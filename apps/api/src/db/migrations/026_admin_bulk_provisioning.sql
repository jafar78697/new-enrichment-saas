-- Durable idempotency record for Platform Admin bulk customer provisioning.
-- Credentials are never stored in this table; they are returned only once.
BEGIN;

CREATE TABLE IF NOT EXISTS admin_bulk_provisioning_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT admin_bulk_provisioning_batches_status_check
    CHECK (status IN ('in_progress', 'completed')),
  CONSTRAINT admin_bulk_provisioning_batches_actor_key_unique
    UNIQUE (actor_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_bulk_provisioning_batches_created
  ON admin_bulk_provisioning_batches(created_at DESC);

COMMIT;
