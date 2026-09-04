-- Canonical Deepgram Voice Agent schema. Outbound queue state remains in the
-- existing CRM tables; this schema never creates SignalWire subscribers.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS ai_agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'deepgram_voice_agent',
  mode TEXT NOT NULL DEFAULT 'outbound' CHECK (mode IN ('browser_preview', 'inbound', 'outbound')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  voice TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  prompt TEXT,
  greeting TEXT,
  assigned_phone_number TEXT,
  max_call_duration_sec INT NOT NULL DEFAULT 180 CHECK (max_call_duration_sec BETWEEN 60 AND 600),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_agent_configs
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'browser_preview',
  ADD COLUMN IF NOT EXISTS greeting TEXT,
  ADD COLUMN IF NOT EXISTS assigned_phone_number TEXT,
  ADD COLUMN IF NOT EXISTS max_call_duration_sec INT NOT NULL DEFAULT 180;

ALTER TABLE ai_agent_configs
  DROP CONSTRAINT IF EXISTS ai_agent_configs_mode_check;
ALTER TABLE ai_agent_configs
  ADD CONSTRAINT ai_agent_configs_mode_check CHECK (mode IN ('browser_preview', 'inbound', 'outbound'));

CREATE UNIQUE INDEX IF NOT EXISTS ai_agent_configs_active_inbound_phone_unique
  ON ai_agent_configs ((regexp_replace(assigned_phone_number, '\\D', '', 'g')))
  WHERE is_active = true AND mode = 'inbound' AND assigned_phone_number IS NOT NULL;

ALTER TABLE enrichment_results
  ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_agent_provider TEXT,
  ADD COLUMN IF NOT EXISTS assigned_ai_agent_id UUID,
  ADD COLUMN IF NOT EXISTS ai_voice_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_voice_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_voice_consent_source TEXT,
  ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS contacts
  ADD COLUMN IF NOT EXISTS ai_voice_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_voice_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_voice_consent_source TEXT,
  ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN NOT NULL DEFAULT false;

UPDATE enrichment_results
SET raw_data = '{}'::jsonb
WHERE raw_data IS NULL;

ALTER TABLE enrichment_results
  ALTER COLUMN raw_data SET DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS enrichment_results_source_contact_idx
  ON enrichment_results (tenant_id, ((raw_data->>'source_contact_id')))
  WHERE raw_data ? 'source_contact_id';

CREATE INDEX IF NOT EXISTS enrichment_results_assigned_ai_agent_idx
  ON enrichment_results (tenant_id, assigned_ai_agent_id)
  WHERE assigned_to_ai = true;

CREATE TABLE IF NOT EXISTS ai_calling_controls (
  tenant_id UUID PRIMARY KEY,
  is_running BOOLEAN NOT NULL DEFAULT false,
  calls_per_minute INT NOT NULL DEFAULT 1,
  max_calls_per_day INT NOT NULL DEFAULT 5,
  max_minutes_per_day INT NOT NULL DEFAULT 10,
  max_cost_usd_per_day NUMERIC NOT NULL DEFAULT 1,
  calling_timezone TEXT NOT NULL DEFAULT 'America/New_York',
  calling_window_start_hour INT NOT NULL DEFAULT 9,
  calling_window_end_hour INT NOT NULL DEFAULT 17,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_calling_controls
  ADD COLUMN IF NOT EXISTS calls_per_minute INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_calls_per_day INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_minutes_per_day INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_cost_usd_per_day NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS calling_timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS calling_window_start_hour INT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS calling_window_end_hour INT NOT NULL DEFAULT 17;

CREATE TABLE IF NOT EXISTS ai_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  lead_id UUID,
  agent_config_id UUID REFERENCES ai_agent_configs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'deepgram_voice_agent',
  signalwire_call_sid TEXT,
  signalwire_stream_sid TEXT,
  deepgram_session_id TEXT,
  call_state TEXT,
  first_answer_type TEXT,
  hangup_reason TEXT,
  started_at TIMESTAMP,
  answered_at TIMESTAMP,
  ended_at TIMESTAMP,
  duration_sec INT,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  outcome TEXT,
  latency_report JSONB,
  last_error TEXT,
  cost_estimate_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_call_sessions
  ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE ai_call_sessions
  ADD COLUMN IF NOT EXISTS latency_report JSONB,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

CREATE INDEX IF NOT EXISTS ai_call_sessions_started_at_idx
  ON ai_call_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS ai_call_sessions_agent_started_at_idx
  ON ai_call_sessions (agent_config_id, started_at DESC);

CREATE TABLE IF NOT EXISTS ai_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_config_id UUID REFERENCES ai_agent_configs(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ai_call_sessions(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('signalwire_inbound', 'browser_preview')),
  usage_seconds INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ai_usage_ledger_created_at_idx
  ON ai_usage_ledger (created_at DESC);
