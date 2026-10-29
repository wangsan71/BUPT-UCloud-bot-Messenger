-- Phase 2b: outbound Feishu send diagnostics (code/msg only; no tokens).
CREATE TABLE IF NOT EXISTS outbound_send_log (
  id TEXT PRIMARY KEY NOT NULL,
  channel TEXT NOT NULL DEFAULT 'feishu',
  receive_id_type TEXT,
  receive_id TEXT,
  ok INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  api_code INTEGER,
  api_msg TEXT,
  stage TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_outbound_send_log_created
  ON outbound_send_log(created_at);
