/**
 * Feishu DM (p2p) command + menu handlers for login / help / pending stubs.
 * Group chats: login ignored; brief tip that features are DM-only.
 */
import type { FeishuInboundMeta } from "../channels/feishu";
import { MENU_KEYS } from "../channels/feishu";
import { replyFeishuDm, type FeishuReplyEnv } from "../channels/feishu_reply";
import {
  bindUserSession,
  createLoginChallenge,
  findBinding,
  touchP2pChatId,
  unbindUser,
  type Channel,
} from "../db/bindings";
import { loginUCloud, UCloudLoginError } from "../ucloud/auth";

export type DmEnv = FeishuReplyEnv & {
  DB: D1Database;
  SESSION_ENCRYPTION_KEY?: string;
  BYRDOCS_OCR_TOKEN?: string;
  /** Public origin for login links, e.g. https://playerrone.ccwu.cc */
  PUBLIC_BASE_URL?: string;
};

const HELP_TEXT = `【北郵教學雲 Bot — 幫助】
本 bot 僅在「單聊」使用（每位同學獨立對話，類似 Telegram bot）。

指令（單聊）：
• 幫助 / help — 本說明
• 登入 / login — 開啟安全登入連結（推薦）
• /login <學號> <統一認證密碼> — 對話內登入（密碼會留在聊天記錄，較不推薦）
• 登出 / logout — 解除綁定
• 待交 / pending — 待交作業（登入後；列表稍後實作）

選單：待交作業 / 提交作業 / 幫助

安全：密碼只經本 Worker；D1 只存加密 token，不長存明文密碼。
其他同學：掃 AppLink QR 加 bot → 單聊登入自己的學號即可。`;

function publicBase(env: DmEnv): string {
  return (env.PUBLIC_BASE_URL?.trim() || "https://playerrone.ccwu.cc").replace(
    /\/$/,
    "",
  );
}

function isP2p(meta: FeishuInboundMeta): boolean {
  // Menu events are always p2p on Feishu; treat missing chatType + menu as p2p.
  if (meta.messageType === "bot_menu") return true;
  if (!meta.chatType) return true;
  return meta.chatType === "p2p" || meta.chatType === "private";
}

async function reply(
  env: DmEnv,
  meta: FeishuInboundMeta,
  text: string,
): Promise<void> {
  await replyFeishuDm(env, {
    chatId: meta.chatId,
    openId: meta.senderOpenId,
    text,
  });
}

async function startWebLogin(
  env: DmEnv,
  channel: Channel,
  meta: FeishuInboundMeta,
): Promise<void> {
  const openId = meta.senderOpenId;
  if (!openId) {
    await reply(env, meta, "無法識別你的飛書帳號，請重新開啟單聊後再試。");
    return;
  }
  if (!env.SESSION_ENCRYPTION_KEY?.trim()) {
    await reply(
      env,
      meta,
      "服務尚未配置 SESSION_ENCRYPTION_KEY，暫時無法登入。請聯絡管理員。",
    );
    return;
  }
  const token = await createLoginChallenge(
    env.DB,
    channel,
    openId,
    meta.chatId,
  );
  const url = `${publicBase(env)}/login?token=${token}`;
  await reply(
    env,
    meta,
    `請在 ${15} 分鐘內開啟以下連結登入（僅綁定你的飛書帳號）：\n${url}\n\n密碼只提交到本站 Worker，不會寫入飛書聊天記錄。\n若無法開啟連結，可用：/login <學號> <統一認證密碼>`,
  );
}

async function loginInline(
  env: DmEnv,
  channel: Channel,
  meta: FeishuInboundMeta,
  studentId: string,
  password: string,
): Promise<void> {
  const openId = meta.senderOpenId;
  if (!openId) {
    await reply(env, meta, "無法識別你的飛書帳號。");
    return;
  }
  const key = env.SESSION_ENCRYPTION_KEY?.trim();
  if (!key) {
    await reply(env, meta, "服務尚未配置加密密鑰，無法登入。");
    return;
  }
  await reply(env, meta, "正在登入教學雲，請稍候…");
  try {
    const session = await loginUCloud(studentId, password, {
      ocrToken: env.BYRDOCS_OCR_TOKEN,
    });
    const sid =
      session.user_name || session.account || studentId.trim();
    await bindUserSession({
      db: env.DB,
      channel,
      openId,
      chatId: meta.chatId,
      studentId: sid,
      displayName: session.real_name ?? null,
      session,
      encryptionKey: key,
    });
    const name = session.real_name ? `（${session.real_name}）` : "";
    await reply(
      env,
      meta,
      `登入成功：已綁定學號 ${sid}${name}。\n可撳「待交作業」或傳送 pending（作業列表稍後實作）。\n建議刪除含密碼的訊息。`,
    );
  } catch (e) {
    const msg =
      e instanceof UCloudLoginError
        ? e.message
        : e instanceof Error
          ? e.message
          : String(e);
    console.warn("ucloud_login_failed", msg);
    await reply(
      env,
      meta,
      `登入失敗：${msg}\n請確認學號／統一認證密碼，或改用登入連結。`,
    );
  }
}

async function handleHelp(env: DmEnv, meta: FeishuInboundMeta): Promise<void> {
  await reply(env, meta, HELP_TEXT);
}

async function handlePending(
  env: DmEnv,
  channel: Channel,
  meta: FeishuInboundMeta,
): Promise<void> {
  const openId = meta.senderOpenId;
  if (!openId) {
    await reply(env, meta, "無法識別你的飛書帳號。");
    return;
  }
  const bound = await findBinding(env.DB, channel, openId);
  if (!bound?.hasSession) {
    await reply(
      env,
      meta,
      "尚未綁定教學雲帳號。請傳送「登入」或撳選單後用連結完成綁定。",
    );
    await startWebLogin(env, channel, meta);
    return;
  }
  await reply(
    env,
    meta,
    `已綁定學號 ${bound.studentId ?? "?"}，作業列表稍後實作。\n（每位同學獨立 session，互不共用。）`,
  );
}

async function handleSubmitStub(
  env: DmEnv,
  channel: Channel,
  meta: FeishuInboundMeta,
): Promise<void> {
  const openId = meta.senderOpenId;
  if (!openId) return;
  const bound = await findBinding(env.DB, channel, openId);
  if (!bound?.hasSession) {
    await reply(env, meta, "提交作業前請先登入。傳送「登入」開始。");
    await startWebLogin(env, channel, meta);
    return;
  }
  await reply(
    env,
    meta,
    "提交作業流程稍後實作。目前可先用「待交作業」確認綁定狀態。",
  );
}

async function handleLogout(
  env: DmEnv,
  channel: Channel,
  meta: FeishuInboundMeta,
): Promise<void> {
  const openId = meta.senderOpenId;
  if (!openId) return;
  const ok = await unbindUser(env.DB, channel, openId);
  await reply(
    env,
    meta,
    ok ? "已解除綁定並撤銷本地 session。" : "你目前沒有綁定記錄。",
  );
}

function parseLoginArgs(text: string): { id: string; pass: string } | null {
  // /login id pass  |  登入 id pass
  const m = text.match(/^(?:\/login|登入|登录)\s+(\S+)\s+(\S+)\s*$/i);
  if (!m) return null;
  return { id: m[1]!, pass: m[2]! };
}

/**
 * Handle a p2p text message or menu click. Safe to run inside waitUntil.
 * Never logs passwords.
 */
export async function handleFeishuDmEvent(
  env: DmEnv,
  channel: Channel,
  meta: FeishuInboundMeta,
  kind: "message" | "menu",
): Promise<void> {
  if (!isP2p(meta)) {
    // Group: do not run login; optionally tip once on clear login intent.
    const t = (meta.textSnippet ?? "").trim();
    if (/^(?:\/login|登入|登录|help|幫助|帮助)/i.test(t)) {
      await reply(
        env,
        meta,
        "登入／待交／幫助請在與機器人的「單聊」中使用（每位同學獨立對話）。",
      );
    }
    return;
  }

  if (meta.senderOpenId && meta.chatId) {
    await touchP2pChatId(env.DB, channel, meta.senderOpenId, meta.chatId);
  }

  if (kind === "menu") {
    switch (meta.menuKey) {
      case MENU_KEYS.help:
        await handleHelp(env, meta);
        return;
      case MENU_KEYS.pendingHomework:
        await handlePending(env, channel, meta);
        return;
      case MENU_KEYS.submitHomework:
        await handleSubmitStub(env, channel, meta);
        return;
      default:
        await reply(env, meta, "未知選單。傳送「幫助」查看用法。");
        return;
    }
  }

  const raw = (meta.textSnippet ?? "").trim();
  if (!raw) return;

  const inline = parseLoginArgs(raw);
  if (inline) {
    // Do not echo or log password.
    await loginInline(env, channel, meta, inline.id, inline.pass);
    return;
  }

  const lower = raw.toLowerCase();
  if (
    raw === "幫助" ||
    raw === "帮助" ||
    lower === "help" ||
    lower === "/help" ||
    lower === "start" ||
    lower === "/start"
  ) {
    await handleHelp(env, meta);
    return;
  }
  if (
    raw === "登入" ||
    raw === "登录" ||
    lower === "login" ||
    lower === "/login"
  ) {
    await startWebLogin(env, channel, meta);
    return;
  }
  if (raw === "登出" || raw === "退出" || lower === "logout" || lower === "/logout") {
    await handleLogout(env, channel, meta);
    return;
  }
  if (
    raw === "待交" ||
    raw === "待交作業" ||
    raw === "待交作业" ||
    lower === "pending" ||
    lower === "/pending" ||
    lower === "/list"
  ) {
    await handlePending(env, channel, meta);
    return;
  }

  // Unbound users get a gentle nudge once they say something unknown.
  if (meta.senderOpenId) {
    const bound = await findBinding(env.DB, channel, meta.senderOpenId);
    if (!bound?.hasSession) {
      await reply(
        env,
        meta,
        "尚未登入。傳送「登入」取得連結，或「幫助」查看說明。",
      );
    }
  }
}