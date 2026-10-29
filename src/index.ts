import { Hono } from "hono";
import {
  extractInboundMeta,
  getEventType,
  isBotMenuEvent,
  isMessageReceiveEvent,
  isUrlVerification,
  parseFeishuBody,
  stubMenuHandler,
  tokenMatches,
} from "./channels/feishu";
import { echoReplyEnabled, maybeEchoReply } from "./channels/feishu_reply";
import { verifyFeishuSignature } from "./crypto/feishu";
import type { Env } from "./env";
import { handleFeishuDmEvent } from "./handlers/dm";
import {
  handleLoginApiPost,
  handleLoginPageGet,
} from "./routes/login_page";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "bupt-ucloud-bot-messenger",
    phase: 2,
    channels: ["feishu", "lark", "wecom"],
    features: ["feishu_webhook", "login_page", "multi_user_bind"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, phase: 2 }));

app.get("/login", (c) => handleLoginPageGet(c));
app.post("/api/login", (c) => handleLoginApiPost(c));

async function logInboundMessage(
  db: D1Database,
  channel: "feishu" | "lark",
  meta: ReturnType<typeof extractInboundMeta>,
): Promise<void> {
  const id = crypto.randomUUID();
  try {
    await db
      .prepare(
        `INSERT OR IGNORE INTO inbound_messages
        (id, channel, event_type, event_id, message_id, chat_id, chat_type,
         sender_open_id, message_type, text_snippet, raw_meta)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        channel,
        meta.eventType ?? null,
        meta.eventId ?? null,
        meta.messageId ?? null,
        meta.chatId ?? null,
        meta.chatType ?? null,
        meta.senderOpenId ?? null,
        meta.messageType ?? null,
        // Never persist possible password lines from /login id pass
        redactSnippet(meta.textSnippet) ?? null,
        JSON.stringify({
          eventType: meta.eventType,
          eventId: meta.eventId,
          messageId: meta.messageId,
          chatId: meta.chatId,
          menuKey: meta.menuKey,
        }),
      )
      .run();
  } catch (e) {
    console.warn(
      "inbound_log_failed",
      e instanceof Error ? e.message : String(e),
    );
  }
}

function redactSnippet(snippet: string | undefined): string | undefined {
  if (!snippet) return snippet;
  if (/^(?:\/login|登入|登录)\s+\S+\s+\S+/i.test(snippet.trim())) {
    return "[redacted_login_command]";
  }
  return snippet;
}

app.post("/webhook/feishu", async (c) => {
  const rawText = await c.req.text();
  const encryptKey = c.env.FEISHU_ENCRYPT_KEY?.trim();
  const verificationToken = c.env.FEISHU_VERIFICATION_TOKEN?.trim();

  let body;
  try {
    body = await parseFeishuBody(rawText, encryptKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse_error";
    return c.json(
      {
        ok: false,
        error: msg,
        hint:
          msg === "decrypt_failed" || msg === "missing_encrypt_key"
            ? "Check FEISHU_ENCRYPT_KEY matches console, or clear Encrypt Key for URL verify then re-enable"
            : undefined,
      },
      400,
    );
  }

  if (isUrlVerification(body)) {
    if (body.token && verificationToken && body.token !== verificationToken) {
      return c.json({ ok: false, error: "bad_token" }, 401);
    }
    if (!body.challenge) {
      return c.json({ ok: false, error: "missing_challenge" }, 400);
    }
    return c.json({ challenge: body.challenge }, 200);
  }

  const ts =
    c.req.header("X-Lark-Request-Timestamp") ??
    c.req.header("X-Feishu-Request-Timestamp");
  const nonce =
    c.req.header("X-Lark-Request-Nonce") ??
    c.req.header("X-Feishu-Request-Nonce");
  const sig =
    c.req.header("X-Lark-Signature") ?? c.req.header("X-Feishu-Signature");
  if (encryptKey && ts && nonce && sig) {
    const ok = await verifyFeishuSignature(encryptKey, ts, nonce, rawText, sig);
    if (!ok) {
      return c.json({ ok: false, error: "bad_signature" }, 401);
    }
  }

  if (!tokenMatches(body, verificationToken)) {
    return c.json({ ok: false, error: "bad_token" }, 401);
  }

  const meta = extractInboundMeta(body);
  const eventType = getEventType(body);

  if (isMessageReceiveEvent(body) || isBotMenuEvent(body) || eventType) {
    await logInboundMessage(c.env.DB, "feishu", meta);
    console.log("feishu_event", {
      eventType: meta.eventType,
      messageId: meta.messageId,
      chatId: meta.chatId,
      chatType: meta.chatType,
      senderOpenId: meta.senderOpenId,
      messageType: meta.messageType,
      textSnippet: redactSnippet(meta.textSnippet),
      menuKey: meta.menuKey,
    });

    if (isBotMenuEvent(body)) {
      console.log("feishu_menu", {
        menuKey: meta.menuKey,
        stub: stubMenuHandler(meta.menuKey),
        senderOpenId: meta.senderOpenId,
      });
      c.executionCtx.waitUntil(
        handleFeishuDmEvent(c.env, "feishu", meta, "menu").catch((err) => {
          console.warn(
            "feishu_menu_handler_failed",
            err instanceof Error ? err.message : String(err),
          );
        }),
      );
    }

    if (isMessageReceiveEvent(body)) {
      c.executionCtx.waitUntil(
        handleFeishuDmEvent(c.env, "feishu", meta, "message").catch((err) => {
          console.warn(
            "feishu_dm_handler_failed",
            err instanceof Error ? err.message : String(err),
          );
        }),
      );
      if (echoReplyEnabled(c.env)) {
        c.executionCtx.waitUntil(
          maybeEchoReply(c.env, meta.chatId, redactSnippet(meta.textSnippet)).catch(
            (err) => {
              console.warn(
                "feishu_echo_failed",
                err instanceof Error ? err.message : String(err),
              );
            },
          ),
        );
      }
    }
  }

  return c.json({}, 200);
});

app.post("/webhook/lark", async (c) => {
  const rawText = await c.req.text();
  const encryptKey = c.env.LARK_ENCRYPT_KEY?.trim();
  const verificationToken = c.env.LARK_VERIFICATION_TOKEN?.trim();

  let body;
  try {
    body = await parseFeishuBody(rawText, encryptKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse_error";
    return c.json({ ok: false, error: msg }, 400);
  }

  if (isUrlVerification(body)) {
    if (body.token && verificationToken && body.token !== verificationToken) {
      return c.json({ ok: false, error: "bad_token" }, 401);
    }
    if (!body.challenge) {
      return c.json({ ok: false, error: "missing_challenge" }, 400);
    }
    return c.json({ challenge: body.challenge }, 200);
  }

  if (!tokenMatches(body, verificationToken)) {
    return c.json({ ok: false, error: "bad_token" }, 401);
  }

  const meta = extractInboundMeta(body);
  if (isMessageReceiveEvent(body) || isBotMenuEvent(body) || getEventType(body)) {
    await logInboundMessage(c.env.DB, "lark", meta);
    console.log("lark_event", {
      eventType: meta.eventType,
      messageId: meta.messageId,
      chatId: meta.chatId,
      menuKey: meta.menuKey,
    });
    if (isBotMenuEvent(body)) {
      console.log("lark_menu_stub", {
        menuKey: meta.menuKey,
        stub: stubMenuHandler(meta.menuKey),
      });
    }
  }

  return c.json({}, 200);
});

app.get("/webhook/wecom", (c) => {
  const echostr = c.req.query("echostr");
  if (echostr) return c.text(echostr);
  return c.json({ ok: true, channel: "wecom", phase: 2, note: "placeholder verify" });
});

app.post("/webhook/wecom", async (c) => {
  await c.req.text().catch(() => "");
  return c.json({ ok: true, channel: "wecom", phase: 2, note: "placeholder" });
});

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

export default app;