-- Full D1 schema (Phase 0–2). Prefer migrations for remote apply:
--   npx wrangler d1 migrations apply bupt-ucloud-bot --local
--   npx wrangler d1 migrations apply bupt-ucloud-bot

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  student_id TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channel_bindings (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('feishu', 'lark', 'wecom')),
  open_id TEXT NOT NULL,
  tenant_key TEXT,
  p2p_chat_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,
  UNIQUE (channel, open_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  -- Encrypted Teaching Cloud / CAS tokens (never store plaintext password)
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  expires_at TEXT,
  student_id TEXT,
  real_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  notify_new_homework INTEGER NOT NULL DEFAULT 1,
  notify_deadline INTEGER NOT NULL DEFAULT 1,
  notify_submit_result INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id TEXT PRIMARY KEY NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('feishu', 'lark', 'wecom')),
  event_type TEXT,
  event_id TEXT,
  message_id TEXT,
  chat_id TEXT,
  chat_type TEXT,
  sender_open_id TEXT,
  message_type TEXT,
  text_snippet TEXT,
  raw_meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_challenges (
  token TEXT PRIMARY KEY NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('feishu', 'lark', 'wecom')),
  open_id TEXT NOT NULL,
  chat_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'used', 'expired', 'cancelled')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_channel_bindings_user ON channel_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_messages_dedupe
  ON inbound_messages(channel, message_id)
  WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbound_messages_created ON inbound_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_inbound_messages_chat ON inbound_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_login_challenges_open ON login_challenges(channel, open_id);
CREATE INDEX IF NOT EXISTS idx_login_challenges_expires ON login_challenges(expires_at);