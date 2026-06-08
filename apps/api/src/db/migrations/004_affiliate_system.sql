-- Affiliate Marketing System Migration

-- Affiliate applications (pending approval)
CREATE TABLE IF NOT EXISTS affiliate_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  social_handles JSONB,
  audience_size TEXT,
  terms_accepted BOOLEAN NOT NULL DEFAULT false,
  terms_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_apps_email ON affiliate_applications(normalized_email);
CREATE INDEX IF NOT EXISTS idx_affiliate_apps_status ON affiliate_applications(status);

-- Approved affiliates
CREATE TABLE IF NOT EXISTS affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES affiliate_applications(id),
  user_id UUID REFERENCES users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  promo_code TEXT NOT NULL UNIQUE,
  referral_link TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','terminated')),
  payout_method TEXT,
  payout_details_encrypted TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliates_promo_code ON affiliates(promo_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status ON affiliates(status);
CREATE INDEX IF NOT EXISTS idx_affiliates_user_id ON affiliates(user_id);

-- Referral clicks
CREATE TABLE IF NOT EXISTS referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id),
  anonymized_ip TEXT,
  user_agent TEXT,
  referring_url TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','flagged','bot')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_affiliate ON referral_clicks(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_referral_clicks_created ON referral_clicks(created_at);

-- Referral conversions
CREATE TABLE IF NOT EXISTS referral_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id),
  stripe_event_id TEXT UNIQUE, -- idempotency key
  plan_type TEXT,
  sale_amount NUMERIC(10,2) NOT NULL,
  net_revenue NUMERIC(10,2) NOT NULL,
  attribution_source TEXT NOT NULL DEFAULT 'referral_link' CHECK (attribution_source IN ('referral_link','promo_code','manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conversions_affiliate ON referral_conversions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_conversions_stripe_event ON referral_conversions(stripe_event_id);

-- Commissions
CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id),
  conversion_id UUID REFERENCES referral_conversions(id),
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','reversed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commissions_affiliate ON commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

-- Payout requests
CREATE TABLE IF NOT EXISTS payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES affiliates(id),
  amount NUMERIC(10,2) NOT NULL,
  payout_method TEXT NOT NULL,
  payout_details_snapshot JSONB NOT NULL, -- immutable snapshot at time of request
  status TEXT NOT NULL DEFAULT 'pending_payout' CHECK (status IN ('pending_payout','processing','paid','rejected')),
  rejection_reason TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_requests_affiliate ON payout_requests(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON payout_requests(status);

-- Affiliate system settings (single row)
CREATE TABLE IF NOT EXISTS affiliate_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  default_commission_rate NUMERIC(5,2) NOT NULL DEFAULT 20.00,
  attribution_window_days INT NOT NULL DEFAULT 30,
  min_payout_threshold NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  hold_period_days INT NOT NULL DEFAULT 30,
  app_domain TEXT NOT NULL DEFAULT 'app.enrichment-saas.com',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO affiliate_settings DEFAULT VALUES ON CONFLICT DO NOTHING;

-- Immutable audit log
CREATE TABLE IF NOT EXISTS affiliate_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON affiliate_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON affiliate_audit_log(created_at);
