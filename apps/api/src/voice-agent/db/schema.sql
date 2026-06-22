-- Voice Agent Database Schema
-- Extends the existing enrichment-saas PostgreSQL database
-- Run via the existing migration pattern: apps/api/src/db/migrations/

-- Voice AI Agent configurations (separate from human agents table)
CREATE TABLE IF NOT EXISTS voice_agents (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  agent_type VARCHAR(50) NOT NULL DEFAULT 'sales'
    CHECK (agent_type IN ('sales', 'receptionist', 'appointment_setter', 'customer_support', 'custom')),
  industry VARCHAR(50),
  tone VARCHAR(50) DEFAULT 'professional'
    CHECK (tone IN ('professional', 'casual', 'friendly', 'formal')),
  response_style VARCHAR(50) DEFAULT 'concise'
    CHECK (response_style IN ('concise', 'detailed', 'conversational')),
  filler_word_frequency VARCHAR(20) DEFAULT 'natural'
    CHECK (filler_word_frequency IN ('none', 'minimal', 'natural', 'frequent')),
  voice_id VARCHAR(100) NOT NULL DEFAULT '21m00Tcm4TlvDq8ikWAM',
  elevenlabs_voice_id VARCHAR(100),
  system_prompt TEXT NOT NULL,
  greeting_message TEXT,
  closing_message TEXT,
  max_conversation_turns INTEGER DEFAULT 50,
  silence_timeout_ms INTEGER DEFAULT 3000,
  barge_in_confidence NUMERIC(3,2) DEFAULT 0.50,
  is_active BOOLEAN DEFAULT TRUE,
  tenant_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Prompt templates (versioned)
CREATE TABLE IF NOT EXISTS voice_agent_prompts (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES voice_agents(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  prompt_text TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Per-call AI session data
CREATE TABLE IF NOT EXISTS voice_call_sessions (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(100) NOT NULL UNIQUE,
  agent_id INTEGER REFERENCES voice_agents(id) ON DELETE SET NULL,
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

-- Knowledge base documents for RAG
CREATE TABLE IF NOT EXISTS voice_knowledge_bases (
  id SERIAL PRIMARY KEY,
  tenant_id UUID,
  agent_id INTEGER REFERENCES voice_agents(id) ON DELETE CASCADE,
  title VARCHAR(300) NOT NULL,
  content TEXT NOT NULL,
  content_type VARCHAR(50) DEFAULT 'text'
    CHECK (content_type IN ('text', 'pdf', 'url', 'faq')),
  source_url VARCHAR(500),
  embedding vector(1536),
  chunk_index INTEGER DEFAULT 0,
  total_chunks INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tools enabled per voice agent
CREATE TABLE IF NOT EXISTS voice_agent_tools (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES voice_agents(id) ON DELETE CASCADE,
  tool_name VARCHAR(100) NOT NULL
    CHECK (tool_name IN ('google_calendar', 'crm_lookup', 'webhook', 'custom')),
  tool_config JSONB NOT NULL DEFAULT '{}',
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, tool_name)
);

-- Analytics aggregation cache
CREATE TABLE IF NOT EXISTS voice_analytics_daily (
  id SERIAL PRIMARY KEY,
  tenant_id UUID,
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  ai_minutes INTEGER DEFAULT 0,
  avg_duration_seconds INTEGER DEFAULT 0,
  appointments_booked INTEGER DEFAULT 0,
  positive_sentiment_count INTEGER DEFAULT 0,
  neutral_sentiment_count INTEGER DEFAULT 0,
  negative_sentiment_count INTEGER DEFAULT 0,
  total_cost NUMERIC(10,4) DEFAULT 0,
  avg_cost_per_call NUMERIC(10,4) DEFAULT 0,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_tts_characters BIGINT DEFAULT 0,
  leads_qualified INTEGER DEFAULT 0,
  interruptions_total INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, date)
);

-- Supervisor alerts
CREATE TABLE IF NOT EXISTS voice_supervisor_alerts (
  id SERIAL PRIMARY KEY,
  call_sid VARCHAR(100) NOT NULL,
  agent_id INTEGER REFERENCES voice_agents(id) ON DELETE SET NULL,
  alert_type VARCHAR(50) NOT NULL
    CHECK (alert_type IN ('negative_sentiment', 'customer_upset', 'long_silence', 'repeated_objections', 'escalation_request')),
  severity VARCHAR(20) DEFAULT 'medium'
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  details JSONB,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by INTEGER,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Alter existing calls table to support AI voice calls
-- (Run separately — commented out for safety, execute manually or in migration)
-- ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_type VARCHAR(20) DEFAULT 'human';
-- ALTER TABLE calls ADD COLUMN IF NOT EXISTS ai_agent_id INTEGER;
-- ALTER TABLE calls ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(3,2);
-- ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_url TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_voice_agents_tenant ON voice_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_agents_type ON voice_agents(agent_type);
CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_call_sid ON voice_call_sessions(call_sid);
CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_agent ON voice_call_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_sessions_created ON voice_call_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_voice_knowledge_bases_tenant ON voice_knowledge_bases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_voice_knowledge_bases_agent ON voice_knowledge_bases(agent_id);
CREATE INDEX IF NOT EXISTS idx_voice_analytics_daily_date ON voice_analytics_daily(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_voice_supervisor_alerts_call ON voice_supervisor_alerts(call_sid);
