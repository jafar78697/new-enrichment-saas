-- Platform-admin controlled customer permission for employee/team access.
ALTER TABLE tenant_limits
  ADD COLUMN IF NOT EXISTS employee_access_enabled BOOLEAN NOT NULL DEFAULT TRUE;
