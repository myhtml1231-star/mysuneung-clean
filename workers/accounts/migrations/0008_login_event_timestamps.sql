-- A timestamp/device combination is not a unique login event.
-- Event IDs remain unique; retain the ordinary account/time lookup indexes.
DROP INDEX IF EXISTS login_events_dedupe_idx;
