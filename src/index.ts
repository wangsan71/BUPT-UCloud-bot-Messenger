import { Hono } from "hono";
import {
  isUrlVerification,
  parseFeishuBody,
  tokenMatches,
} from "./channels/feishu";
import { verifyFeishuSignature } from "./crypto/feishu";

export type Env = {
  DB: D1Database;
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_ENCRYPT_KEY?: string;
  FEISHU_VERIFICATION_TOKEN?: string;
  LARK_APP_ID?: string;
  LARK_APP_SECRET?: string;
  LARK_ENCRYPT_KEY?: string;
  LARK_VERIFICATION_TOKEN?: string;
  WECOM_CORP_ID?: string;
  WECOM_AGENT_ID?: string;
  WECOM_SECRET?: string;
  WECOM_TOKEN?: string;
  WECOM_ENCODING_AES_KEY?: string;
  SESSION_ENCRYPTION_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.json({
    ok: true,
    service: "bupt-ucloud-bot-messenger",
    phase: 1,
    channels: ["feishu", "lark", "wecom"],
  }),
);

app.get("/health", (c) => c.json({ ok: true, phase: 1 }));

app.post("/webhook/feishu", async (c) => {
  const rawText = await c.req.text();
  const encryptKey = c.env.FEISHU_ENCRYPT_KEY?.trim();
  const verificationToken = c.env.FEISHU_VERIFICATION_TOKEN?.trim();

  let body;
  try {
    body = await parseFeishuBody(rawText, encryptKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse_error";
    // Feishu treats non-challenge JSON as "Challenge code not returned"
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
    // Official response: ONLY { challenge } with 200
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

  return c.json({ ok: true, channel: "feishu", phase: 1 });
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

  return c.json({ ok: true, channel: "lark", phase: 1, note: "placeholder" });
});

app.get("/webhook/wecom", (c) => {
  const echostr = c.req.query("echostr");
  if (echostr) return c.text(echostr);
  return c.json({ ok: true, channel: "wecom", phase: 1, note: "placeholder verify" });
});

app.post("/webhook/wecom", async (c) => {
  await c.req.text().catch(() => "");
  return c.json({ ok: true, channel: "wecom", phase: 1, note: "placeholder" });
});

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

export default app;