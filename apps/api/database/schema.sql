CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  company TEXT,
  email TEXT,
  notes TEXT,
  assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  source TEXT,
  niche_id INTEGER REFERENCES niches(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS niches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  twilio_identity TEXT NOT NULL UNIQUE,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  role TEXT NOT NULL DEFAULT 'employee',
  password_hash TEXT,
  invite_token TEXT,
  invite_expires_at TEXT,
  invite_accepted_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_login_at TEXT,
  twilio_phone_number TEXT,
  twilio_phone_sid TEXT,
  twilio_phone_area_code TEXT,
  twilio_phone_purchased_at TEXT,
  stats_total_calls INTEGER NOT NULL DEFAULT 0,
  stats_connected_calls INTEGER NOT NULL DEFAULT 0,
  stats_total_seconds INTEGER NOT NULL DEFAULT 0,
  team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (twilio_identity <> ''),
  CHECK (twilio_identity NOT GLOB '*[^A-Za-z0-9_]*')
);

CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  started_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON contacts(phone_number);
-- idx_contacts_assigned_agent_id is created in migrateExistingDatabase() after ALTER TABLE adds the column
CREATE INDEX IF NOT EXISTS idx_calls_contact_id ON calls(contact_id);
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON calls(started_at);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_outcome ON calls(outcome);
CREATE INDEX IF NOT EXISTS idx_contacts_niche_id ON contacts(niche_id);
CREATE INDEX IF NOT EXISTS idx_niches_assigned_agent_id ON niches(assigned_agent_id);

CREATE TABLE IF NOT EXISTS employee_niches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  niche_id INTEGER NOT NULL REFERENCES niches(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(agent_id, niche_id)
);
CREATE INDEX IF NOT EXISTS idx_employee_niches_agent ON employee_niches(agent_id);
CREATE INDEX IF NOT EXISTS idx_employee_niches_niche ON employee_niches(niche_id);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  leader_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_teams_leader_id ON teams(leader_id);
