CREATE TABLE IF NOT EXISTS admin_accounts (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('owner','admin')),
  granted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_accounts_role_idx ON admin_accounts(role);

-- Existing service had exactly one registered account at migration time.
-- Preserve access by promoting that oldest existing account as the initial owner.
INSERT OR IGNORE INTO admin_accounts(account_id,role,granted_at)
SELECT id,'owner',CAST(strftime('%s','now') AS INTEGER)*1000
FROM accounts
ORDER BY created_at ASC
LIMIT 1;
