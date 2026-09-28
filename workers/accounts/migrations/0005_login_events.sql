CREATE TABLE IF NOT EXISTS account_login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  logged_in_at INTEGER NOT NULL,
  auth_provider TEXT NOT NULL CHECK(auth_provider IN ('google.com','password')),
  device_label TEXT NOT NULL DEFAULT '',
  session_expires_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'login' CHECK(source IN ('login','session_backfill'))
);
CREATE INDEX IF NOT EXISTS login_events_time_idx ON account_login_events(logged_in_at DESC);
CREATE INDEX IF NOT EXISTS login_events_account_idx ON account_login_events(account_id,logged_in_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS login_events_dedupe_idx ON account_login_events(account_id,logged_in_at,device_label,source);

INSERT OR IGNORE INTO account_login_events(account_id,logged_in_at,auth_provider,device_label,session_expires_at,source)
SELECT s.account_id,s.created_at,a.auth_provider,s.device_label,s.expires_at,'session_backfill'
FROM account_sessions s JOIN accounts a ON a.id=s.account_id;
