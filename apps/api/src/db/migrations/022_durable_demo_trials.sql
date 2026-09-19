-- Migration: Durable Demo Trials
-- This table tracks the immutable 15-minute demo window per tenant.

BEGIN;

CREATE TABLE IF NOT EXISTS tenant_demo_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'expired'
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL, -- normally started_at + 15 minutes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_demo_trials_expires ON tenant_demo_trials(expires_at);

-- A trigger to automatically mark it expired could be added, but application logic will also enforce this.

COMMIT;
