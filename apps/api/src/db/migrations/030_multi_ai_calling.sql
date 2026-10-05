CREATE TABLE ai_calling_lanes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slot_number SMALLINT NOT NULL CHECK (slot_number BETWEEN 1 AND 4),
  name TEXT NOT NULL,
  niche_id INTEGER,
  agent_config_id UUID REFERENCES ai_agent_configs(id) ON DELETE SET NULL,
  active_script_version_id UUID,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','ready','running','draining','paused','error')),
  max_concurrent_calls SMALLINT NOT NULL DEFAULT 1 CHECK (max_concurrent_calls = 1),
  rotation_cursor SMALLINT NOT NULL DEFAULT 0 CHECK (rotation_cursor IN (0,1)),
  cooldown_seconds SMALLINT NOT NULL DEFAULT 4 CHECK (cooldown_seconds BETWEEN 0 AND 60),
  next_dial_after TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  last_error TEXT,
  config_version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, slot_number)
);

CREATE UNIQUE INDEX ai_calling_lanes_active_niche_uq
  ON ai_calling_lanes (tenant_id, niche_id)
  WHERE niche_id IS NOT NULL;

-- Removed agent_config_id uniqueness because multiple lanes can share the same Voice Agent.

CREATE INDEX ai_calling_lanes_worker_idx
  ON ai_calling_lanes (status, next_dial_after)
  WHERE status IN ('running', 'draining');

CREATE TABLE ai_calling_lane_numbers (
  lane_id UUID NOT NULL REFERENCES ai_calling_lanes(id) ON DELETE CASCADE,
  phone_number_id UUID NOT NULL REFERENCES phone_numbers(id) ON DELETE RESTRICT,
  position SMALLINT NOT NULL CHECK (position IN (0,1)),
  enabled BOOLEAN NOT NULL DEFAULT true,
  health_status TEXT NOT NULL DEFAULT 'healthy'
    CHECK (health_status IN ('healthy','cooldown','disabled','error')),
  cooldown_until TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  answered_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  PRIMARY KEY (lane_id, phone_number_id),
  UNIQUE (lane_id, position),
  UNIQUE (phone_number_id)
);

CREATE TABLE ai_calling_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  niche_id INTEGER,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_calling_script_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES ai_calling_scripts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published','archived')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  definition JSONB NOT NULL,
  compiled_prompt TEXT,
  compiled_hash TEXT,
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (script_id, version)
);

CREATE UNIQUE INDEX ai_calling_script_versions_one_draft_uq
  ON ai_calling_script_versions (script_id)
  WHERE status = 'draft';

ALTER TABLE ai_calling_lanes
  ADD CONSTRAINT ai_calling_lanes_active_script_version_fk
  FOREIGN KEY (active_script_version_id)
  REFERENCES ai_calling_script_versions(id)
  ON DELETE SET NULL;

CREATE TABLE ai_call_queue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lane_id UUID NOT NULL REFERENCES ai_calling_lanes(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES enrichment_results(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued','claimed','dialing','ringing','streaming','completed','failed','cancelled')),
  priority INTEGER NOT NULL DEFAULT 100,
  attempt_number INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  claim_token UUID,
  caller_phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,
  session_id UUID REFERENCES ai_call_sessions(id) ON DELETE SET NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX ai_call_queue_items_active_lead_uq
  ON ai_call_queue_items (tenant_id, lead_id)
  WHERE state IN ('queued','claimed','dialing','ringing','streaming');

CREATE INDEX ai_call_queue_items_claim_idx
  ON ai_call_queue_items (lane_id, priority, scheduled_at, created_at)
  WHERE state = 'queued';

CREATE TABLE ai_call_lane_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lane_id UUID NOT NULL REFERENCES ai_calling_lanes(id) ON DELETE CASCADE,
  session_id UUID REFERENCES ai_call_sessions(id) ON DELETE SET NULL,
  queue_item_id UUID REFERENCES ai_call_queue_items(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_call_sessions
  ADD COLUMN IF NOT EXISTS lane_id UUID REFERENCES ai_calling_lanes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue_item_id UUID REFERENCES ai_call_queue_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS script_version_id UUID REFERENCES ai_calling_script_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS script_compiled_hash TEXT,
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT;

ALTER TABLE ai_agent_configs
  ADD COLUMN IF NOT EXISTS speech_speed NUMERIC(3,2) NOT NULL DEFAULT 1.05 CHECK (speech_speed BETWEEN 0.50 AND 1.50),
  ADD COLUMN IF NOT EXISTS listen_eot_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS listen_eot_timeout_ms INTEGER NOT NULL DEFAULT 900;

ALTER TABLE enrichment_results
  ADD COLUMN IF NOT EXISTS niche_id INTEGER,
  ADD COLUMN IF NOT EXISTS ai_calling_lane_id UUID REFERENCES ai_calling_lanes(id) ON DELETE SET NULL;
