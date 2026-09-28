PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS community_inquiries (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '익명',
  content TEXT NOT NULL,
  privacy TEXT NOT NULL DEFAULT 'public' CHECK(privacy IN ('public','private')),
  password_salt TEXT,
  password_hash TEXT,
  password_iterations INTEGER,
  date_label TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  answer TEXT NOT NULL DEFAULT '',
  answered INTEGER NOT NULL DEFAULT 0 CHECK(answered IN (0,1)),
  answered_at INTEGER,
  source TEXT NOT NULL DEFAULT 'server' CHECK(source IN ('server','legacy_firestore'))
);
CREATE INDEX IF NOT EXISTS community_inquiries_created_idx ON community_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS community_inquiries_answered_idx ON community_inquiries(answered,created_at DESC);

CREATE TABLE IF NOT EXISTS community_chat_users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK(disabled IN (0,1))
);

CREATE TABLE IF NOT EXISTS community_chat_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES community_chat_users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  device_label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS community_chat_sessions_user_idx ON community_chat_sessions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS community_chat_sessions_expiry_idx ON community_chat_sessions(expires_at);

CREATE TABLE IF NOT EXISTS community_chat_messages (
  id TEXT PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  user_id TEXT REFERENCES community_chat_users(id) ON DELETE SET NULL,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'server' CHECK(source IN ('server','legacy_firestore'))
);
CREATE INDEX IF NOT EXISTS community_chat_messages_created_idx ON community_chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS community_chat_messages_user_idx ON community_chat_messages(user_id,created_at DESC);
