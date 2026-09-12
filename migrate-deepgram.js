import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
dotenv.config(); // loads .env in root

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('Connected to database.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agent_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,

        voice TEXT,
        language TEXT DEFAULT 'en',
        prompt TEXT,
        callback_phone TEXT,
        callback_email TEXT,

        max_call_duration_sec INT DEFAULT 90,
        first_answer_timeout_ms INT DEFAULT 5000,
        unknown_max INT DEFAULT 1,

        end_on_ivr BOOLEAN DEFAULT true,
        end_on_voicemail BOOLEAN DEFAULT true,
        end_on_hold BOOLEAN DEFAULT true,
        end_on_ai_receptionist BOOLEAN DEFAULT false,

        daily_call_limit INT DEFAULT 100,
        daily_budget_limit_usd NUMERIC DEFAULT 5,
        max_concurrent_calls INT DEFAULT 1,

        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('Created ai_agent_configs table.');

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_call_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        lead_id UUID NOT NULL,
        agent_config_id UUID,
        provider TEXT NOT NULL,

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

        transcript JSONB DEFAULT '[]',
        summary TEXT,
        outcome TEXT,
        cost_estimate_usd NUMERIC DEFAULT 0,

        created_at TIMESTAMP DEFAULT now()
      );
    `);
    console.log('Created ai_call_sessions table.');

    await client.query(`
      ALTER TABLE enrichment_results
      ADD COLUMN IF NOT EXISTS ai_agent_provider TEXT DEFAULT 'openai_realtime',
      ADD COLUMN IF NOT EXISTS assigned_ai_agent_id UUID,
      ADD COLUMN IF NOT EXISTS last_ai_call_provider TEXT,
      ADD COLUMN IF NOT EXISTS last_ai_call_outcome TEXT,
      ADD COLUMN IF NOT EXISTS last_ai_call_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS ai_call_attempts INT DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ai_call_status TEXT DEFAULT 'not_queued';
    `);
    console.log('Altered enrichment_results table.');

    console.log('Migration completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await client.end();
  }
}

migrate();
