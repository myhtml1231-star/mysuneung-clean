-- Additive migration: preserve every account, FK, session and learning record.
-- The v1 provider column has a Google-only CHECK and remains a legacy compatibility column.
-- Authentication comes from the verified Firebase JWT, never either stored display field.
ALTER TABLE accounts ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'google.com' CHECK(auth_provider IN ('google.com','password'));
