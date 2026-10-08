-- One durable, workspace-wide stop timer for the four multi-calling lanes.
CREATE TABLE IF NOT EXISTS ai_calling_stop_timers (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds BETWEEN 60 AND 604800),
  stop_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'stopping', 'completed', 'cancelled')),
  armed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ai_calling_stop_timers_due_idx
  ON ai_calling_stop_timers (stop_at, next_attempt_at)
  WHERE status IN ('scheduled', 'stopping');
