-- Tiered polling support. Existing databases created before this column
-- need it added; new ones get it from db/setup.ts directly.
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ;
ALTER TABLE trackers ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_trackers_next_check_at
  ON trackers(next_check_at) WHERE status = 'active';
