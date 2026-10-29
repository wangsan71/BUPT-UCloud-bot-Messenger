-- Phase 1: minimal inbound Feishu/Lark event log (ack path + later command routing).
-- Apply:
--   npx wrangler d1 migrations apply bupt-ucloud-bot --local
--   npx wrangler d1 migrations apply bupt-ucloud-bot

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_inbound_messages_dedupe
  ON inbound_messages(channel, message_id)
  WHERE message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_messages_created
  ON inbound_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_inbound_messages_chat
  ON inbound_messages(chat_id);
