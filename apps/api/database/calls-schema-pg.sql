CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  twilio_identity TEXT NOT NULL UNIQUE,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL DEFAULT 'employee',
  password_hash TEXT,
  invite_token TEXT,
  invite_expires_at TIMESTAMP,
  invite_accepted_at TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending',
  last_login_at TIMESTAMP,
  twilio_phone_number TEXT,
  twilio_phone_sid TEXT,
  twilio_phone_area_code TEXT,
  twilio_phone_purchased_at TIMESTAMP,
  stats_total_calls INTEGER NOT NULL DEFAULT 0,
  stats_connected_calls INTEGER NOT NULL DEFAULT 0,
  stats_total_seconds INTEGER NOT NULL DEFAULT 0,
  team_id INTEGER,
  username TEXT UNIQUE,
  linkedin_cookie TEXT,
  linkedin_daily_limit INTEGER DEFAULT 25,
  linkedin_connection_template TEXT,
  linkedin_connections_sent_today INTEGER DEFAULT 0,
  linkedin_last_reset_date DATE,
  reddit_session TEXT,
  reddit_daily_limit INTEGER DEFAULT 25,
  reddit_connection_template TEXT,
  reddit_connections_sent_today INTEGER DEFAULT 0,
  reddit_last_reset_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (twilio_identity <> ''),
  CHECK (twilio_identity ~ '^[A-Za-z0-9_]*$')
);

CREATE TABLE IF NOT EXISTS twilio_webhook_logs (
  id SERIAL PRIMARY KEY,
  call_sid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS linkedin_tasks (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL, -- 'scrape_profile', 'send_connection', 'send_message'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reddit_tasks (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER REFERENCES agents(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  leader_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE agents ADD CONSTRAINT fk_agents_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS email_accounts (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  app_password TEXT NOT NULL,
  daily_limit INTEGER DEFAULT 40,
  sent_today INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  user_id UUID NOT NULL,
  day_reset DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warmup_logs (
  id SERIAL PRIMARY KEY,
  sender_email TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  base_template TEXT,
  status TEXT DEFAULT 'active',
  send_time TEXT DEFAULT '09:00',
  daily_limit INTEGER DEFAULT 50,
  start_date DATE DEFAULT CURRENT_DATE,
  end_date DATE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS niches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  company TEXT,
  email TEXT,
  notes TEXT,
  assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  source TEXT,
  niche_id INTEGER REFERENCES niches(id) ON DELETE SET NULL,
  website TEXT,
  linkedin TEXT,
  reddit_url TEXT,
  timezone TEXT,
  facebook TEXT,
  instagram TEXT,
  website_data TEXT,
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  score INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_received INTEGER DEFAULT 0,
  email_opened INTEGER DEFAULT 0,
  last_email_sent_at TIMESTAMP,
  followup_status TEXT DEFAULT 'pending',
  stage TEXT DEFAULT 'new_lead',
  unsubscribed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS calls (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  call_sid TEXT NOT NULL UNIQUE,
  child_call_sid TEXT UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL,
  duration_seconds INTEGER,
  recording_url TEXT,
  recording_sid TEXT,
  recording_status TEXT,
  recording_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  outcome TEXT CHECK (outcome IN ('connected', 'voicemail', 'no_answer', 'busy')),
  notes TEXT,
  from_number TEXT,
  to_number TEXT,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_niches (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  niche_id INTEGER NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, niche_id)
);

CREATE TABLE IF NOT EXISTS meta_connections (
  id SERIAL PRIMARY KEY,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  facebook_user_id TEXT,
  access_token TEXT,
  page_id TEXT,
  page_access_token TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_agent_id ON contacts(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(started_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);
CREATE INDEX IF NOT EXISTS idx_contacts_niche_id ON contacts(niche_id);
CREATE INDEX IF NOT EXISTS idx_niches_assigned_agent_id ON niches(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_employee_niches_agent ON employee_niches(agent_id);
CREATE INDEX IF NOT EXISTS idx_employee_niches_niche ON employee_niches(niche_id);
CREATE INDEX IF NOT EXISTS idx_teams_leader_id ON teams(leader_id);
