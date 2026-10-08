-- AI Closer: a lane type that re-calls warm leads produced by opener lanes.
-- Opener behavior is unchanged; every new column defaults to opener semantics.

ALTER TABLE ai_calling_lanes
  ADD COLUMN IF NOT EXISTS lane_type TEXT NOT NULL DEFAULT 'opener',
  ADD COLUMN IF NOT EXISTS closer_source_stages TEXT[] NOT NULL DEFAULT ARRAY['interested']::TEXT[],
  ADD COLUMN IF NOT EXISTS closer_min_delay_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS max_close_attempts SMALLINT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS human_transfer_number TEXT,
  ADD COLUMN IF NOT EXISTS transfer_hours JSONB;

DO $$ BEGIN
  ALTER TABLE ai_calling_lanes ADD CONSTRAINT ai_calling_lanes_lane_type_chk
    CHECK (lane_type IN ('opener', 'closer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE ai_calling_lanes ADD CONSTRAINT ai_calling_lanes_closer_delay_chk
    CHECK (closer_min_delay_minutes BETWEEN 0 AND 43200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE ai_calling_lanes ADD CONSTRAINT ai_calling_lanes_close_attempts_chk
    CHECK (max_close_attempts BETWEEN 1 AND 10);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE ai_calling_lanes ADD CONSTRAINT ai_calling_lanes_closer_stages_chk
    CHECK (closer_source_stages <@ ARRAY['interested','followup','demo_scheduled','proposal_sent']::TEXT[]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE enrichment_results
  ADD COLUMN IF NOT EXISTS close_attempts SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_opener_session_id UUID,
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS deal_currency TEXT,
  ADD COLUMN IF NOT EXISTS meeting_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_timezone TEXT,
  ADD COLUMN IF NOT EXISTS payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS payment_status TEXT;

ALTER TABLE ai_call_sessions
  ADD COLUMN IF NOT EXISTS call_role TEXT NOT NULL DEFAULT 'opener',
  ADD COLUMN IF NOT EXISTS handoff_summary JSONB,
  ADD COLUMN IF NOT EXISTS transfer_status TEXT;

DO $$ BEGIN
  ALTER TABLE ai_call_sessions ADD CONSTRAINT ai_call_sessions_call_role_chk
    CHECK (call_role IN ('opener', 'closer'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS ai_close_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID,
  session_id UUID REFERENCES ai_call_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'close_result', 'meeting_booked', 'link_sent', 'transfer_requested',
    'transfer_connected', 'transfer_failed', 'payment_received', 'close_lost'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_close_events_lead_idx ON ai_close_events (tenant_id, lead_id, created_at DESC);

-- Closer queue scan: warm leads per niche ordered by last contact.
CREATE INDEX IF NOT EXISTS enrichment_results_closer_scan_idx
  ON enrichment_results (tenant_id, niche_id, lead_stage, last_contacted_at)
  WHERE do_not_call = false;
