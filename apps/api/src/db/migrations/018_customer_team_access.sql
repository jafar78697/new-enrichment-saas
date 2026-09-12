-- Customer-admin managed employee access.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS platform_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_users_tenant_role_status
  ON users(tenant_id, role, account_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_platform_user
  ON agents(platform_user_id)
  WHERE platform_user_id IS NOT NULL;

COMMIT;
