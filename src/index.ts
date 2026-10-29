import { Hono } from "hono";

/**
 * Cloudflare Worker bindings (Phase 0 stubs).
 * Fill secrets via `wrangler secret`; create D1 and replace database_id in wrangler.toml.
 */
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
    phase: 0,
    channels: ["feishu", "lark", "wecom"],
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

/** Feishu (China) event / message webhook — verify + route in Phase 1. */
app.post("/webhook/feishu", async (c) => {
  const body = await c.req.json().catch(() => null);
  // URL verification challenge (Feishu / Lark often POST { challenge, token, type })
  if (body && typeof body === "object" && "challenge" in body) {
    return c.json({ challenge: (body as { challenge: string }).challenge });
  }
  return c.json({ ok: true, channel: "feishu", phase: 0, note: "placeholder" });
});

/** Lark (Global) event / message webhook — verify + route in Phase 1. */
app.post("/webhook/lark", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body && typeof body === "object" && "challenge" in body) {
    return c.json({ challenge: (body as { challenge: string }).challenge });
  }
  return c.json({ ok: true, channel: "lark", phase: 0, note: "placeholder" });
});

/**
 * WeCom callback: GET for URL verification, POST for messages/events.
 * Echo echostr after decrypt in Phase 1; Phase 0 only acknowledges.
 */
app.get("/webhook/wecom", (c) => {
  const echostr = c.req.query("echostr");
  if (echostr) {
    return c.text(echostr);
  }
  return c.json({ ok: true, channel: "wecom", phase: 0, note: "placeholder verify" });
});

app.post("/webhook/wecom", async (c) => {
  await c.req.text().catch(() => "");
  return c.json({ ok: true, channel: "wecom", phase: 0, note: "placeholder" });
});

app.notFound((c) => c.json({ ok: false, error: "not_found" }, 404));

export default app;
