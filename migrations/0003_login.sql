-- Phase 2: login challenges + multi-user binding columns.
-- Apply:
--   npx wrangler d1 migrations apply bupt-ucloud-bot --local
--   npx wrangler d1 migrations apply bupt-ucloud-bot

PRAGMA foreign_keys = ON;

-- Short-lived login tokens for HTTPS form (and conversational flow bookkeeping).
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

CREATE INDEX IF NOT EXISTS idx_login_challenges_open
  ON login_challenges(channel, open_id);

CREATE INDEX IF NOT EXISTS idx_login_challenges_expires
  ON login_challenges(expires_at);

-- Track last known p2p chat for menu replies (menu events have no chat_id).
ALTER TABLE channel_bindings ADD COLUMN p2p_chat_id TEXT;
ALTER TABLE channel_bindings ADD COLUMN updated_at TEXT;

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE sessions ADD COLUMN student_id TEXT;
ALTER TABLE sessions ADD COLUMN real_name TEXT;
ALTER TABLE sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
