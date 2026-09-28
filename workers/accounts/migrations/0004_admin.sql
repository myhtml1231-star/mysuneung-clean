CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_account_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_account_id TEXT,
  detail TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(detail)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit(target_account_id,created_at DESC);
