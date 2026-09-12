-- Migration 014: Wallets, Ledger, Manual Payments, and Metering
-- Steps 05-09 of the Calling SaaS implementation

BEGIN;

-- ══════════════════════════════════════════════════════════════════════
-- STEP 05: Wallets & Ledger
-- ══════════════════════════════════════════════════════════════════════

-- Unit-separated wallets (calling_cents, maps_credits)
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  unit TEXT NOT NULL, -- 'calling_cents', 'maps_credits'
  available INT NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved INT NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, unit)
);

-- Immutable ledger for all wallet movements
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  operation_type TEXT NOT NULL, -- 'credit', 'debit', 'reserve', 'settle', 'release', 'reversal'
  amount INT NOT NULL,
  balance_after INT NOT NULL,
  reserved_after INT NOT NULL DEFAULT 0,
  reference_type TEXT, -- 'payment', 'call', 'maps_job', 'admin_adjustment', 'expiry'
  reference_id TEXT,
  description TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet ON wallet_ledger(wallet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ref ON wallet_ledger(reference_type, reference_id);

-- Credit lots (track expiry of granted credits)
CREATE TABLE IF NOT EXISTS credit_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  original_amount INT NOT NULL,
  remaining_amount INT NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
  source TEXT NOT NULL, -- 'payment', 'bonus', 'admin'
  source_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_lots_wallet ON credit_lots(wallet_id, expires_at);

-- Usage reservations (hold funds during active operations)
CREATE TABLE IF NOT EXISTS usage_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  amount INT NOT NULL,
  operation_type TEXT NOT NULL, -- 'call', 'maps_job'
  operation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held', -- 'held', 'settled', 'released', 'partial'
  settled_amount INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_usage_reservations_op ON usage_reservations(operation_type, operation_id);

-- ══════════════════════════════════════════════════════════════════════
-- STEP 06: Manual Payments (JazzCash / WhatsApp)
-- ══════════════════════════════════════════════════════════════════════

-- Payment accounts (receiving details with versioning)
CREATE TABLE IF NOT EXISTS payment_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL DEFAULT 'jazzcash',
  account_number TEXT NOT NULL,
  account_title TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Orders / Quotes
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_ref TEXT NOT NULL UNIQUE,
  plan_name TEXT,
  plan_version INT DEFAULT 1,
  amount_pkr INT NOT NULL,
  calling_cents INT DEFAULT 0,
  maps_credits INT DEFAULT 0,
  duration_days INT DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'cancelled', 'expired'
  snapshot JSONB,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id, status);

-- Manual payment requests (customer submits proof)
CREATE TABLE IF NOT EXISTS manual_payment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID REFERENCES orders(id),
  amount_pkr INT NOT NULL,
  transaction_reference TEXT, -- JazzCash transaction ID
  sender_number TEXT,
  sender_name TEXT,
  proof_url TEXT, -- screenshot URL
  proof_notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'under_review', 'approved', 'rejected'
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_payments_tenant ON manual_payment_requests(tenant_id, status);

-- Payment receipts (verified actual receipts)
CREATE TABLE IF NOT EXISTS payment_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id UUID REFERENCES manual_payment_requests(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  amount_pkr INT NOT NULL,
  actual_transaction_ref TEXT UNIQUE, -- verified unique ref
  receiving_account_id UUID REFERENCES payment_accounts(id),
  verified_by UUID NOT NULL,
  credits_granted JSONB, -- { calling_cents: X, maps_credits: Y }
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════
-- STEP 07-08: Call tracking & metering
-- ══════════════════════════════════════════════════════════════════════

-- Tracked calls (canonical call records for billing)
CREATE TABLE IF NOT EXISTS tracked_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID,
  agent_id TEXT,
  caller_number TEXT NOT NULL,
  destination_number TEXT NOT NULL,
  provider TEXT DEFAULT 'signalwire',
  provider_call_id TEXT,
  status TEXT NOT NULL DEFAULT 'initiated', -- 'initiated', 'ringing', 'connected', 'completed', 'failed', 'no_answer'
  direction TEXT DEFAULT 'outbound',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  connected_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT DEFAULT 0,
  billable_seconds INT DEFAULT 0,
  rate_per_minute NUMERIC(10,6),
  cost_cents INT DEFAULT 0,
  reservation_id UUID REFERENCES usage_reservations(id),
  settled BOOLEAN DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracked_calls_tenant ON tracked_calls(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tracked_calls_provider ON tracked_calls(provider_call_id);

-- Daily call counters (for limit enforcement)
CREATE TABLE IF NOT EXISTS daily_call_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  unique_destinations INT DEFAULT 0,
  total_attempts INT DEFAULT 0,
  destination_numbers TEXT[] DEFAULT ARRAY[]::TEXT[],
  UNIQUE(tenant_id, date)
);

-- ══════════════════════════════════════════════════════════════════════
-- STEP 09: Maps Jobs & Credit Metering
-- ══════════════════════════════════════════════════════════════════════

-- Metered maps jobs
CREATE TABLE IF NOT EXISTS metered_maps_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID,
  keywords TEXT[] NOT NULL,
  location TEXT,
  max_credits INT NOT NULL DEFAULT 10,
  credits_used INT DEFAULT 0,
  results_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'running', 'completed', 'failed', 'cancelled'
  reservation_id UUID REFERENCES usage_reservations(id),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metered_maps_tenant ON metered_maps_jobs(tenant_id, created_at);

-- Maps job results
CREATE TABLE IF NOT EXISTS metered_maps_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES metered_maps_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  place_id TEXT,
  business_name TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  rating NUMERIC(3,1),
  review_count INT,
  category TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════
-- STEP 10: Customer API Keys
-- ══════════════════════════════════════════════════════════════════════

-- Extend existing api_keys table
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS scopes TEXT[] DEFAULT ARRAY['maps'];
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS requests_today INT DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS daily_limit INT DEFAULT 1000;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_reset_date DATE;

-- Existing tenants start with empty wallets; credits are granted through verified manual payments.
INSERT INTO wallets (tenant_id, unit, available, reserved)
SELECT t.id, unit, 0, 0
FROM tenants t
CROSS JOIN (VALUES ('calling_cents'), ('maps_credits')) AS units(unit)
ON CONFLICT (tenant_id, unit) DO NOTHING;

COMMIT;
