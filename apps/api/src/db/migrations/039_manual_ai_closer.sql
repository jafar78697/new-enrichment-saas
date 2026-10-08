-- Operator-initiated follow-up calls, independent of automatic lane queues.
CREATE TABLE IF NOT EXISTS ai_closer_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  script TEXT NOT NULL CHECK (length(trim(script)) BETWEEN 20 AND 10000),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_closer_scripts_tenant_idx ON ai_closer_scripts (tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_closer_calls (
  session_id UUID PRIMARY KEY REFERENCES ai_call_sessions(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  request_id UUID NOT NULL,
  request_hash TEXT NOT NULL,
  script_id UUID REFERENCES ai_closer_scripts(id) ON DELETE SET NULL,
  script_name TEXT NOT NULL,
  script_snapshot TEXT NOT NULL,
  prospect_phone TEXT NOT NULL,
  prospect_name TEXT,
  company_name TEXT,
  context_note TEXT,
  caller_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, request_id)
);
CREATE INDEX IF NOT EXISTS ai_closer_calls_history_idx ON ai_closer_calls (tenant_id, created_at DESC);
