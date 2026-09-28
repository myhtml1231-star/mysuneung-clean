PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS accounts (
 id TEXT PRIMARY KEY,
 firebase_uid TEXT NOT NULL UNIQUE,
 email TEXT NOT NULL,
 display_name TEXT NOT NULL DEFAULT '',
 provider TEXT NOT NULL CHECK(provider='google.com'),
 consent_version TEXT NOT NULL,
 consent_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS account_sessions (
 token_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 auth_time INTEGER NOT NULL,
 device_label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS sessions_account ON account_sessions(account_id,created_at);
CREATE INDEX IF NOT EXISTS sessions_expiry ON account_sessions(expires_at);
CREATE TABLE IF NOT EXISTS account_records (
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('download','attempt','draft','university','annotation','university_state')),
 record_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>0),
 data TEXT NOT NULL CHECK(json_valid(data)),
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
 updated_at INTEGER NOT NULL,
 mutation_id TEXT NOT NULL,
 PRIMARY KEY(account_id,kind,record_id)
);
CREATE INDEX IF NOT EXISTS records_user_kind ON account_records(account_id,kind,deleted,updated_at);
CREATE TABLE IF NOT EXISTS account_changes (
 seq INTEGER PRIMARY KEY AUTOINCREMENT,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 record_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 changed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changes_user_seq ON account_changes(account_id,seq);
CREATE TRIGGER IF NOT EXISTS records_insert_change AFTER INSERT ON account_records
BEGIN
 DELETE FROM account_changes WHERE account_id=NEW.account_id AND kind=NEW.kind AND record_id=NEW.record_id;
 INSERT INTO account_changes(account_id,kind,record_id,version,changed_at)
 VALUES(NEW.account_id,NEW.kind,NEW.record_id,NEW.version,NEW.updated_at);
END;
CREATE TRIGGER IF NOT EXISTS records_update_change AFTER UPDATE ON account_records
BEGIN
 DELETE FROM account_changes WHERE account_id=NEW.account_id AND kind=NEW.kind AND record_id=NEW.record_id;
 INSERT INTO account_changes(account_id,kind,record_id,version,changed_at)
 VALUES(NEW.account_id,NEW.kind,NEW.record_id,NEW.version,NEW.updated_at);
END;
CREATE TABLE IF NOT EXISTS account_rate_limits (
 bucket TEXT PRIMARY KEY,
 count INTEGER NOT NULL DEFAULT 1,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_expiry ON account_rate_limits(expires_at);

CREATE TRIGGER IF NOT EXISTS account_record_quota_insert BEFORE INSERT ON account_records
WHEN NOT EXISTS(SELECT 1 FROM account_records WHERE account_id=NEW.account_id AND kind=NEW.kind AND record_id=NEW.record_id)
BEGIN
 SELECT (CASE WHEN NEW.deleted=0 AND (SELECT COUNT(*) FROM account_records WHERE account_id=NEW.account_id AND deleted=0)>=3000 THEN RAISE(ABORT,'account_quota') END);
 SELECT (CASE WHEN (SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM account_records WHERE account_id=NEW.account_id)+length(CAST(NEW.data AS BLOB))>10485760 THEN RAISE(ABORT,'account_quota') END);
END;
CREATE TRIGGER IF NOT EXISTS account_record_quota_update BEFORE UPDATE ON account_records
BEGIN
 SELECT (CASE WHEN OLD.deleted=1 AND NEW.deleted=0 AND (SELECT COUNT(*) FROM account_records WHERE account_id=NEW.account_id AND deleted=0)>=3000 THEN RAISE(ABORT,'account_quota') END);
 SELECT (CASE WHEN (SELECT COALESCE(SUM(length(CAST(data AS BLOB))),0) FROM account_records WHERE account_id=NEW.account_id)-length(CAST(OLD.data AS BLOB))+length(CAST(NEW.data AS BLOB))>10485760 THEN RAISE(ABORT,'account_quota') END);
END;

CREATE TABLE IF NOT EXISTS account_bridge_codes (
 code_hash TEXT PRIMARY KEY,
 account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 parent_session_hash TEXT NOT NULL REFERENCES account_sessions(token_hash) ON DELETE CASCADE,
 challenge TEXT NOT NULL,
 client TEXT NOT NULL CHECK(client='universitypredict'),
 expires_at INTEGER NOT NULL,
 session_expires_at INTEGER NOT NULL,
 auth_time INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS bridge_expiry ON account_bridge_codes(expires_at);
