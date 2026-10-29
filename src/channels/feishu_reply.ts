/**
 * Feishu send helpers. Used for login/help/pending replies (not only echo).
 * Requires FEISHU_APP_ID + FEISHU_APP_SECRET + im:message:send_as_bot.
 */

const FEISHU_TOKEN_URL =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const FEISHU_SEND_URL =
  "https://open.feishu.cn/open-apis/im/v1/messages";

export type FeishuReplyEnv = {
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_ECHO_REPLY?: string;
};

export function feishuSendConfigured(env: FeishuReplyEnv): boolean {
  return !!env.FEISHU_APP_ID?.trim() && !!env.FEISHU_APP_SECRET?.trim();
}

export function echoReplyEnabled(env: FeishuReplyEnv): boolean {
  return env.FEISHU_ECHO_REPLY?.trim() === "1" && feishuSendConfigured(env);
}

async function getTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<string | null> {
  const res = await fetch(FEISHU_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = (await res.json().catch(() => null)) as {
    code?: number;
    tenant_access_token?: string;
  } | null;
  if (!data || data.code !== 0 || !data.tenant_access_token) {
    console.warn("feishu_token_failed", data?.code ?? res.status);
    return null;
  }
  return data.tenant_access_token;
}

export type ReceiveIdType = "chat_id" | "open_id";

/** Send a short text to chat_id or open_id. */
export async function sendFeishuText(opts: {
  appId: string;
  appSecret: string;
  receiveId: string;
  text: string;
  receiveIdType?: ReceiveIdType;
}): Promise<boolean> {
  const token = await getTenantAccessToken(opts.appId, opts.appSecret);
  if (!token) return false;
  const idType = opts.receiveIdType ?? "chat_id";
  const url = `${FEISHU_SEND_URL}?receive_id_type=${idType}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: opts.receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: opts.text }),
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
  } | null;
  if (!data || data.code !== 0) {
    console.warn("feishu_send_failed", data?.code ?? res.status, data?.msg);
    return false;
  }
  return true;
}

/** Prefer chat_id when known; else open_id (menu events have no chat_id). */
export async function replyFeishuDm(
  env: FeishuReplyEnv,
  opts: { chatId?: string | null; openId?: string | null; text: string },
): Promise<boolean> {
  if (!feishuSendConfigured(env)) {
    console.warn("feishu_reply_skipped_no_app_creds");
    return false;
  }
  const appId = env.FEISHU_APP_ID!.trim();
  const appSecret = env.FEISHU_APP_SECRET!.trim();
  if (opts.chatId) {
    return sendFeishuText({
      appId,
      appSecret,
      receiveId: opts.chatId,
      receiveIdType: "chat_id",
      text: opts.text,
    });
  }
  if (opts.openId) {
    return sendFeishuText({
      appId,
      appSecret,
      receiveId: opts.openId,
      receiveIdType: "open_id",
      text: opts.text,
    });
  }
  console.warn("feishu_reply_skipped_no_recipient");
  return false;
}

export async function maybeEchoReply(
  env: FeishuReplyEnv,
  chatId: string | undefined,
  snippet: string | undefined,
): Promise<void> {
  if (!echoReplyEnabled(env) || !chatId) return;
  const text = snippet
    ? `已收到：${snippet.slice(0, 80)}`
    : "已收到（Phase 1 確認）";
  await replyFeishuDm(env, { chatId, text });
}