-- Launch-readiness schema repair. Every statement is idempotent so this can
-- safely run against installations that already have some of these objects.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS meeting_time TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS voice_call_sessions (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(160) NOT NULL UNIQUE,
  agent_id INTEGER,
  transcript JSONB,
  summary TEXT,
  sentiment_score NUMERIC(3,2),
  sentiment_analysis JSONB,
  lead_qualified BOOLEAN DEFAULT FALSE,
  lead_score INTEGER DEFAULT 0,
  outcome VARCHAR(50),
  cost_breakdown JSONB,
  duration_seconds INTEGER DEFAULT 0,
  interruptions_count INTEGER DEFAULT 0,
  conversation_turns INTEGER DEFAULT 0,
  tts_characters INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_agent
  ON voice_call_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_created
  ON voice_call_sessions(created_at);

CREATE TABLE IF NOT EXISTS system_alerts (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  account_id INTEGER,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type VARCHAR(20) DEFAULT 'human';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_agent_id INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(3,2);
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_url TEXT;
