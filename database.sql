-- Phase 0 D1 schema stubs (users / sessions / subscriptions).
-- Apply after creating the database:
--   npx wrangler d1 migrations apply bupt-ucloud-bot --local
--   npx wrangler d1 migrations apply bupt-ucloud-bot

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  student_id TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS channel_bindings (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('feishu', 'lark', 'wecom')),
  open_id TEXT NOT NULL,
  tenant_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (channel, open_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  -- Encrypted Teaching Cloud / CAS tokens (never store plaintext password long-term)
  access_token_enc TEXT,
  refresh_token_enc TEXT,
  expires_at TEXT,
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

CREATE INDEX IF NOT EXISTS idx_channel_bindings_user ON channel_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
