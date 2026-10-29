/**
 * Multi-user bindings: each Feishu open_id maps to its own user + encrypted UCloud session.
 * Never store school passwords. Key lookups by (channel, open_id).
 */
import {
  decryptSessionPayload,
  encryptSessionPayload,
} from "../crypto/session";
import type { UCloudSession } from "../ucloud/types";

export type Channel = "feishu" | "lark" | "wecom";

export type BoundUser = {
  userId: string;
  studentId: string | null;
  displayName: string | null;
  openId: string;
  p2pChatId: string | null;
  hasSession: boolean;
  realName: string | null;
};

export type LoginChallenge = {
  token: string;
  channel: Channel;
  openId: string;
  chatId: string | null;
  status: string;
  expiresAt: string;
};

const CHALLENGE_TTL_MIN = 15;

export async function findBinding(
  db: D1Database,
  channel: Channel,
  openId: string,
): Promise<BoundUser | null> {
  const row = await db
    .prepare(
      `SELECT cb.open_id AS open_id, cb.p2p_chat_id AS p2p_chat_id,
              u.id AS user_id, u.student_id AS student_id, u.display_name AS display_name,
              s.id AS session_id, s.real_name AS real_name, s.status AS session_status
       FROM channel_bindings cb
       JOIN users u ON u.id = cb.user_id
       LEFT JOIN sessions s ON s.user_id = u.id AND s.status = 'active'
       WHERE cb.channel = ? AND cb.open_id = ?
       LIMIT 1`,
    )
    .bind(channel, openId)
    .first<{
      open_id: string;
      p2p_chat_id: string | null;
      user_id: string;
      student_id: string | null;
      display_name: string | null;
      session_id: string | null;
      real_name: string | null;
      session_status: string | null;
    }>();
  if (!row) return null;
  return {
    userId: row.user_id,
    studentId: row.student_id,
    displayName: row.display_name,
    openId: row.open_id,
    p2pChatId: row.p2p_chat_id,
    hasSession: !!row.session_id && row.session_status === "active",
    realName: row.real_name,
  };
}

export async function touchP2pChatId(
  db: D1Database,
  channel: Channel,
  openId: string,
  chatId: string | undefined,
): Promise<void> {
  if (!chatId || !openId) return;
  try {
    await db
      .prepare(
        `UPDATE channel_bindings
         SET p2p_chat_id = ?, updated_at = datetime('now')
         WHERE channel = ? AND open_id = ?`,
      )
      .bind(chatId, channel, openId)
      .run();
  } catch {
    /* column may be missing before migration */
  }
}

export async function createLoginChallenge(
  db: D1Database,
  channel: Channel,
  openId: string,
  chatId: string | undefined,
): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const expires = new Date(Date.now() + CHALLENGE_TTL_MIN * 60 * 1000).toISOString();
  // Invalidate prior pending challenges for this open_id
  await db
    .prepare(
      `UPDATE login_challenges SET status = 'cancelled'
       WHERE channel = ? AND open_id = ? AND status = 'pending'`,
    )
    .bind(channel, openId)
    .run();
  await db
    .prepare(
      `INSERT INTO login_challenges (token, channel, open_id, chat_id, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(token, channel, openId, chatId ?? null, expires)
    .run();
  return token;
}

export async function getLoginChallenge(
  db: D1Database,
  token: string,
): Promise<LoginChallenge | null> {
  const row = await db
    .prepare(
      `SELECT token, channel, open_id, chat_id, status, expires_at
       FROM login_challenges WHERE token = ? LIMIT 1`,
    )
    .bind(token)
    .first<{
      token: string;
      channel: Channel;
      open_id: string;
      chat_id: string | null;
      status: string;
      expires_at: string;
    }>();
  if (!row) return null;
  return {
    token: row.token,
    channel: row.channel,
    openId: row.open_id,
    chatId: row.chat_id,
    status: row.status,
    expiresAt: row.expires_at,
  };
}

export function challengeIsValid(ch: LoginChallenge): boolean {
  if (ch.status !== "pending") return false;
  return Date.parse(ch.expiresAt) > Date.now();
}

export async function markChallengeUsed(
  db: D1Database,
  token: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE login_challenges SET status = 'used' WHERE token = ?`,
    )
    .bind(token)
    .run();
}

/**
 * Bind open_id → student + encrypted session. Creates user/binding if needed.
 * Each open_id is isolated; does not share sessions across users.
 */
export async function bindUserSession(opts: {
  db: D1Database;
  channel: Channel;
  openId: string;
  chatId?: string | null;
  studentId: string;
  displayName?: string | null;
  session: UCloudSession;
  encryptionKey: string;
}): Promise<string> {
  const {
    db,
    channel,
    openId,
    chatId,
    studentId,
    displayName,
    session,
    encryptionKey,
  } = opts;

  const accessEnc = await encryptSessionPayload(
    encryptionKey,
    session.access_token,
  );
  const refreshEnc = await encryptSessionPayload(
    encryptionKey,
    session.refresh_token,
  );
  const expiresAt =
    typeof session.expires_in === "number"
      ? new Date(Date.now() + session.expires_in * 1000).toISOString()
      : null;
  const realName = session.real_name ?? displayName ?? null;

  const existing = await findBinding(db, channel, openId);
  let userId = existing?.userId;
  if (!userId) {
    userId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO users (id, student_id, display_name, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', datetime('now'), datetime('now'))`,
      )
      .bind(userId, studentId, realName)
      .run();
    const bindingId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO channel_bindings (id, user_id, channel, open_id, p2p_chat_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      )
      .bind(bindingId, userId, channel, openId, chatId ?? null)
      .run();
    await db
      .prepare(
        `INSERT INTO subscriptions (id, user_id) VALUES (?, ?)`,
      )
      .bind(crypto.randomUUID(), userId)
      .run();
  } else {
    await db
      .prepare(
        `UPDATE users SET student_id = ?, display_name = ?, status = 'active',
         updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(studentId, realName, userId)
      .run();
    if (chatId) {
      await touchP2pChatId(db, channel, openId, chatId);
    }
  }

  // One active session per user
  await db
    .prepare(`UPDATE sessions SET status = 'revoked' WHERE user_id = ? AND status = 'active'`)
    .bind(userId)
    .run();
  await db
    .prepare(
      `INSERT INTO sessions
       (id, user_id, access_token_enc, refresh_token_enc, expires_at,
        student_id, real_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'))`,
    )
    .bind(
      crypto.randomUUID(),
      userId,
      accessEnc,
      refreshEnc,
      expiresAt,
      studentId,
      realName,
    )
    .run();

  return userId;
}

export async function unbindUser(
  db: D1Database,
  channel: Channel,
  openId: string,
): Promise<boolean> {
  const existing = await findBinding(db, channel, openId);
  if (!existing) return false;
  await db
    .prepare(`UPDATE sessions SET status = 'revoked' WHERE user_id = ?`)
    .bind(existing.userId)
    .run();
  await db
    .prepare(
      `UPDATE users SET status = 'revoked', updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(existing.userId)
    .run();
  await db
    .prepare(`DELETE FROM channel_bindings WHERE channel = ? AND open_id = ?`)
    .bind(channel, openId)
    .run();
  return true;
}

export async function loadActiveSession(
  db: D1Database,
  encryptionKey: string,
  userId: string,
): Promise<UCloudSession | null> {
  const row = await db
    .prepare(
      `SELECT access_token_enc, refresh_token_enc, student_id, real_name, expires_at
       FROM sessions WHERE user_id = ? AND status = 'active' LIMIT 1`,
    )
    .bind(userId)
    .first<{
      access_token_enc: string | null;
      refresh_token_enc: string | null;
      student_id: string | null;
      real_name: string | null;
      expires_at: string | null;
    }>();
  if (!row?.access_token_enc || !row.refresh_token_enc) return null;
  const access_token = await decryptSessionPayload(
    encryptionKey,
    row.access_token_enc,
  );
  const refresh_token = await decryptSessionPayload(
    encryptionKey,
    row.refresh_token_enc,
  );
  return {
    access_token,
    refresh_token,
    user_name: row.student_id ?? undefined,
    account: row.student_id ?? undefined,
    real_name: row.real_name ?? undefined,
  };
}