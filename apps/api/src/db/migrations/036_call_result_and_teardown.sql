ALTER TABLE ai_call_sessions
  ADD COLUMN IF NOT EXISTS result_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_terminated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_finalized_at TIMESTAMPTZ;

UPDATE ai_call_sessions SET result_finalized_at = ended_at
WHERE ended_at IS NOT NULL AND result_finalized_at IS NULL
  AND call_state IN ('completed', 'failed', 'busy', 'no-answer', 'canceled', 'closed', 'stopped');

