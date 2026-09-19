-- Per-employee feature permissions managed by the Customer Admin.
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS can_call BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_scrape BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
