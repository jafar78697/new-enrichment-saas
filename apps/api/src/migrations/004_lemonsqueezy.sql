-- Add Lemon Squeezy fields to tenants table
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS ls_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT;
