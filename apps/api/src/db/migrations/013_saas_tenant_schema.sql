-- Migration 013: SaaS Tenant Schema
-- Extends existing tables for multi-tenant paid SaaS
-- Run AFTER backing up production database

BEGIN;

-- ── Extend users table for username-based login ─────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_version INT DEFAULT 1;

-- Make email optional (some customers may not have email)
-- Existing NOT NULL constraint needs to be dropped carefully
DO $$
BEGIN
  ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'email column already nullable or does not exist';
END $$;

-- Create unique index on username (only where not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users (username) WHERE username IS NOT NULL;

-- Backfill legacy users so the new private SaaS login can use the same table.
UPDATE users
SET username = lower(regexp_replace(
  COALESCE(NULLIF(split_part(email, '@', 1), ''), 'user') || substring(id::text, 1, 8),
  '[^a-z0-9]',
  '',
  'g'
))
WHERE username IS NULL;

UPDATE users
SET display_name = COALESCE(display_name, email, username)
WHERE display_name IS NULL;

UPDATE users
SET role = 'tenant_owner'
WHERE role = 'owner';

-- ── Extend tenants table for SaaS ──────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

-- ── Tenant Limits (independent values per Codex plan) ──────────────────
CREATE TABLE IF NOT EXISTS tenant_limits (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  max_phone_numbers INT NOT NULL DEFAULT 1,
  max_seats INT NOT NULL DEFAULT 1,
  max_concurrent_calls INT NOT NULL DEFAULT 1,
  max_daily_unique_destinations INT NOT NULL DEFAULT 50,
  max_daily_call_attempts INT NOT NULL DEFAULT 200,
  allowed_destination_countries TEXT[] DEFAULT ARRAY['US','CA'],
  max_call_seconds INT NOT NULL DEFAULT 1800,
  monthly_spending_limit_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Customer Subscriptions / Packages ──────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  plan_version INT DEFAULT 1,
  pkr_price INT NOT NULL DEFAULT 0,
  start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_subs_tenant
  ON customer_subscriptions(tenant_id);

-- ── User Sessions (proper session management) ──────────────────────────
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at)
  WHERE revoked_at IS NULL;

-- ── Login Attempts (throttling) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL, -- username or IP
  success BOOLEAN DEFAULT FALSE,
  ip_address TEXT,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_identifier
  ON login_attempts(identifier, attempted_at);

-- ── Audit Logs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  actor_user_id UUID,
  actor_role TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at);

-- Every existing tenant needs limits before new authenticated routes can serve profile data.
INSERT INTO tenant_limits (
  tenant_id,
  max_phone_numbers,
  max_seats,
  max_concurrent_calls,
  max_daily_unique_destinations,
  max_daily_call_attempts,
  allowed_destination_countries,
  max_call_seconds,
  monthly_spending_limit_cents
)
SELECT id, 1, 1, 1, 50, 200, ARRAY['US','CA'], 1800, 0
FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

COMMIT;
