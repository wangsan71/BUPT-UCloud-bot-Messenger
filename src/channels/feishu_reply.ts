/**
 * Optional echo / send stub. Only used when FEISHU_ECHO_REPLY=1 and App ID/Secret exist.
 * Kept off by default so Phase 1 stays "ack + D1 log" within Feishu's 3s window.
 */

const FEISHU_TOKEN_URL =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const FEISHU_SEND_URL =
  "https://open.feishu.cn/open-apis/im/v1/messages";

export type EchoReplyEnv = {
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_ECHO_REPLY?: string;
};

export function echoReplyEnabled(env: EchoReplyEnv): boolean {
  return (
    env.FEISHU_ECHO_REPLY?.trim() === "1" &&
    !!env.FEISHU_APP_ID?.trim() &&
    !!env.FEISHU_APP_SECRET?.trim()
  );
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

/** Send a short text into chat_id (open_id / chat_id receive_id_type=chat_id). */
export async function sendFeishuText(opts: {
  appId: string;
  appSecret: string;
  chatId: string;
  text: string;
}): Promise<boolean> {
  const token = await getTenantAccessToken(opts.appId, opts.appSecret);
  if (!token) return false;
  const url = `${FEISHU_SEND_URL}?receive_id_type=chat_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      receive_id: opts.chatId,
      msg_type: "text",
      content: JSON.stringify({ text: opts.text }),
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    code?: number;
  } | null;
  if (!data || data.code !== 0) {
    console.warn("feishu_send_failed", data?.code ?? res.status);
    return false;
  }
  return true;
}

export async function maybeEchoReply(
  env: EchoReplyEnv,
  chatId: string | undefined,
  snippet: string | undefined,
): Promise<void> {
  if (!echoReplyEnabled(env) || !chatId) return;
  const appId = env.FEISHU_APP_ID!.trim();
  const appSecret = env.FEISHU_APP_SECRET!.trim();
  const text = snippet
    ? `已收到：${snippet.slice(0, 80)}`
    : "已收到（Phase 1 確認）";
  await sendFeishuText({ appId, appSecret, chatId, text });
}
