CREATE TABLE IF NOT EXISTS visitor_daily (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  first_seen INTEGER NOT NULL,
  first_source TEXT NOT NULL CHECK(first_source IN ('main','cbt','university')),
  counted INTEGER NOT NULL DEFAULT 0 CHECK(counted IN (0,1,2)),
  PRIMARY KEY(day, visitor_hash)
);
CREATE INDEX IF NOT EXISTS visitor_daily_seen_idx ON visitor_daily(first_seen);
