-- Customer-level call recording entitlement.
ALTER TABLE tenant_limits
  ADD COLUMN IF NOT EXISTS call_recording_enabled BOOLEAN NOT NULL DEFAULT FALSE;
