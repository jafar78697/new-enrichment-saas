BEGIN;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS meeting_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_call_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_next_call_at
  ON contacts (tenant_id, next_call_at)
  WHERE next_call_at IS NOT NULL;

COMMIT;
