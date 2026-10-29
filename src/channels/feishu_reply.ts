/**
 * Feishu send helpers. Used for login/help/pending replies (not only echo).
 * Requires FEISHU_APP_ID + FEISHU_APP_SECRET + im:message:send_as_bot.
 *
 * Token: try new OAuth endpoint first (accounts.feishu.cn), fall back to legacy
 * open.feishu.cn/auth/v3/tenant_access_token/internal.
 */

const FEISHU_TOKEN_URL_LEGACY =
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal";
const FEISHU_TOKEN_URL_OAUTH = "https://accounts.feishu.cn/oauth/v3/token";
const FEISHU_SEND_URL =
  "https://open.feishu.cn/open-apis/im/v1/messages";

export type FeishuReplyEnv = {
  FEISHU_APP_ID?: string;
  FEISHU_APP_SECRET?: string;
  FEISHU_ECHO_REPLY?: string;
  DB?: D1Database;
};

export type SendResult = {
  ok: boolean;
  stage?: "token" | "send" | "config" | "recipient";
  httpStatus?: number;
  apiCode?: number;
  apiMsg?: string;
  receiveIdType?: ReceiveIdType;
  receiveId?: string;
  logId?: string;
  tokenSource?: "oauth" | "legacy";
};

export function feishuSendConfigured(env: FeishuReplyEnv): boolean {
  return !!env.FEISHU_APP_ID?.trim() && !!env.FEISHU_APP_SECRET?.trim();
}

export function echoReplyEnabled(env: FeishuReplyEnv): boolean {
  return env.FEISHU_ECHO_REPLY?.trim() === "1" && feishuSendConfigured(env);
}

async function logOutbound(
  db: D1Database | undefined,
  row: {
    receiveIdType?: string;
    receiveId?: string;
    ok: boolean;
    httpStatus?: number;
    apiCode?: number;
    apiMsg?: string;
    stage?: string;
  },
): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(
        `INSERT INTO outbound_send_log
        (id, channel, receive_id_type, receive_id, ok, http_status, api_code, api_msg, stage)
        VALUES (?, 'feishu', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        row.receiveIdType ?? null,
        row.receiveId ? row.receiveId.slice(0, 80) : null,
        row.ok ? 1 : 0,
        row.httpStatus ?? null,
        row.apiCode ?? null,
        row.apiMsg ? String(row.apiMsg).slice(0, 300) : null,
        row.stage ?? null,
      )
      .run();
  } catch (e) {
    console.warn(
      "outbound_log_failed",
      e instanceof Error ? e.message : String(e),
    );
  }
}

type TokenResult = {
  token: string | null;
  source: "oauth" | "legacy";
  httpStatus: number;
  apiCode?: number;
  apiMsg?: string;
  logId?: string;
};

async function getTokenOAuth(
  appId: string,
  appSecret: string,
): Promise<TokenResult> {
  const res = await fetch(FEISHU_TOKEN_URL_OAUTH, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: appId,
      client_secret: appSecret,
    }),
  });
  const logId = res.headers.get("x-tt-logid") ?? undefined;
  const data = (await res.json().catch(() => null)) as {
    code?: number;
    access_token?: string;
    error?: string;
    error_description?: string;
    msg?: string;
  } | null;
  if (data?.access_token && (data.code === 0 || data.code === undefined)) {
    return {
      token: data.access_token,
      source: "oauth",
      httpStatus: res.status,
      logId,
    };
  }
  return {
    token: null,
    source: "oauth",
    httpStatus: res.status,
    apiCode: data?.code,
    apiMsg: data?.error_description || data?.error || data?.msg,
    logId,
  };
}

async function getTokenLegacy(
  appId: string,
  appSecret: string,
): Promise<TokenResult> {
  const res = await fetch(FEISHU_TOKEN_URL_LEGACY, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const logId = res.headers.get("x-tt-logid") ?? undefined;
  const data = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
  } | null;
  if (data?.tenant_access_token && data.code === 0) {
    return {
      token: data.tenant_access_token,
      source: "legacy",
      httpStatus: res.status,
      logId,
    };
  }
  return {
    token: null,
    source: "legacy",
    httpStatus: res.status,
    apiCode: data?.code,
    apiMsg: data?.msg,
    logId,
  };
}

/** Prefer new OAuth token API; fall back to legacy internal endpoint. */
export async function getTenantAccessTokenDetailed(
  appId: string,
  appSecret: string,
): Promise<TokenResult> {
  const oauth = await getTokenOAuth(appId, appSecret);
  if (oauth.token) return oauth;
  console.warn(
    "feishu_token_oauth_failed",
    oauth.apiCode ?? oauth.httpStatus,
    oauth.apiMsg,
    oauth.logId,
  );
  const legacy = await getTokenLegacy(appId, appSecret);
  if (legacy.token) return legacy;
  console.warn(
    "feishu_token_legacy_failed",
    legacy.apiCode ?? legacy.httpStatus,
    legacy.apiMsg,
    legacy.logId,
  );
  // Prefer reporting the more informative failure (legacy often has 21001)
  return {
    token: null,
    source: legacy.apiCode != null ? "legacy" : "oauth",
    httpStatus: legacy.httpStatus || oauth.httpStatus,
    apiCode: legacy.apiCode ?? oauth.apiCode,
    apiMsg: [
      oauth.apiMsg ? `oauth:${oauth.apiMsg}` : null,
      legacy.apiMsg ? `legacy:${legacy.apiMsg}` : null,
    ]
      .filter(Boolean)
      .join(" | ") || undefined,
    logId: legacy.logId || oauth.logId,
  };
}

export type ReceiveIdType = "chat_id" | "open_id";

/** Send a short text to chat_id or open_id. */
export async function sendFeishuText(opts: {
  appId: string;
  appSecret: string;
  receiveId: string;
  text: string;
  receiveIdType?: ReceiveIdType;
  db?: D1Database;
}): Promise<SendResult> {
  const idType = opts.receiveIdType ?? "chat_id";
  const tok = await getTenantAccessTokenDetailed(opts.appId, opts.appSecret);
  if (!tok.token) {
    const result: SendResult = {
      ok: false,
      stage: "token",
      httpStatus: tok.httpStatus,
      apiCode: tok.apiCode,
      apiMsg: tok.apiMsg,
      receiveIdType: idType,
      receiveId: opts.receiveId,
      logId: tok.logId,
      tokenSource: tok.source,
    };
    await logOutbound(opts.db, {
      ...result,
      apiMsg: [result.apiMsg, result.logId ? `logid=${result.logId}` : null]
        .filter(Boolean)
        .join(" "),
    });
    return result;
  }
  const url = `${FEISHU_SEND_URL}?receive_id_type=${idType}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${tok.token}`,
    },
    body: JSON.stringify({
      receive_id: opts.receiveId,
      msg_type: "text",
      content: JSON.stringify({ text: opts.text }),
    }),
  });
  const logId = res.headers.get("x-tt-logid") ?? tok.logId;
  const data = (await res.json().catch(() => null)) as {
    code?: number;
    msg?: string;
  } | null;
  if (!data || data.code !== 0) {
    console.warn(
      "feishu_send_failed",
      data?.code ?? res.status,
      data?.msg,
      idType,
      logId,
    );
    const result: SendResult = {
      ok: false,
      stage: "send",
      httpStatus: res.status,
      apiCode: data?.code,
      apiMsg: data?.msg,
      receiveIdType: idType,
      receiveId: opts.receiveId,
      logId,
      tokenSource: tok.source,
    };
    await logOutbound(opts.db, {
      ...result,
      apiMsg: [result.apiMsg, logId ? `logid=${logId}` : null]
        .filter(Boolean)
        .join(" "),
    });
    return result;
  }
  const result: SendResult = {
    ok: true,
    stage: "send",
    httpStatus: res.status,
    apiCode: 0,
    receiveIdType: idType,
    receiveId: opts.receiveId,
    logId,
    tokenSource: tok.source,
  };
  await logOutbound(opts.db, result);
  return result;
}

/** Prefer chat_id when known; else open_id. If chat_id fails, retry open_id. */
export async function replyFeishuDm(
  env: FeishuReplyEnv,
  opts: { chatId?: string | null; openId?: string | null; text: string },
): Promise<boolean> {
  if (!feishuSendConfigured(env)) {
    console.warn("feishu_reply_skipped_no_app_creds");
    await logOutbound(env.DB, {
      ok: false,
      stage: "config",
      apiMsg: "missing_app_id_or_secret",
    });
    return false;
  }
  const appId = env.FEISHU_APP_ID!.trim();
  const appSecret = env.FEISHU_APP_SECRET!.trim();
  const db = env.DB;

  if (opts.chatId) {
    const r = await sendFeishuText({
      appId,
      appSecret,
      receiveId: opts.chatId,
      receiveIdType: "chat_id",
      text: opts.text,
      db,
    });
    if (r.ok) return true;
    if (opts.openId) {
      console.warn(
        "feishu_reply_chat_id_failed_retry_open_id",
        r.apiCode,
        r.apiMsg,
      );
      const r2 = await sendFeishuText({
        appId,
        appSecret,
        receiveId: opts.openId,
        receiveIdType: "open_id",
        text: opts.text,
        db,
      });
      return r2.ok;
    }
    return false;
  }
  if (opts.openId) {
    const r = await sendFeishuText({
      appId,
      appSecret,
      receiveId: opts.openId,
      receiveIdType: "open_id",
      text: opts.text,
      db,
    });
    return r.ok;
  }
  console.warn("feishu_reply_skipped_no_recipient");
  await logOutbound(db, {
    ok: false,
    stage: "recipient",
    apiMsg: "no_chat_id_or_open_id",
  });
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

/** Token-only probe for diagnostics (no send). */
export async function probeFeishuToken(
  appId: string,
  appSecret: string,
): Promise<{
  oauth: { ok: boolean; apiCode?: number; apiMsg?: string; logId?: string };
  legacy: { ok: boolean; apiCode?: number; apiMsg?: string; logId?: string };
}> {
  const oauth = await getTokenOAuth(appId, appSecret);
  const legacy = await getTokenLegacy(appId, appSecret);
  return {
    oauth: {
      ok: !!oauth.token,
      apiCode: oauth.token ? 0 : oauth.apiCode,
      apiMsg: oauth.token ? undefined : oauth.apiMsg,
      logId: oauth.logId,
    },
    legacy: {
      ok: !!legacy.token,
      apiCode: legacy.token ? 0 : legacy.apiCode,
      apiMsg: legacy.token ? undefined : legacy.apiMsg,
      logId: legacy.logId,
    },
  };
}
