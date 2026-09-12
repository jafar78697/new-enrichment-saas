-- Migration 016: Enforce time-bound calling subscriptions.
-- Calling is allowed only while a customer has an active, unexpired subscription.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_customer_subscriptions_calling_access
  ON customer_subscriptions (tenant_id, status, end_date DESC, created_at DESC);

-- Reflect already elapsed paid periods in the stored status for admin reporting.
UPDATE customer_subscriptions
SET status = 'expired'
WHERE status = 'active'
  AND end_date IS NOT NULL
  AND end_date <= NOW();

-- Existing customer tenants created before subscriptions were added receive one
-- 30-day period from their original onboarding date. Platform admins are excluded.
INSERT INTO customer_subscriptions (
  tenant_id,
  plan_name,
  pkr_price,
  start_date,
  end_date,
  status,
  snapshot
)
SELECT
  t.id,
  'Starter 30-Day Access',
  0,
  COALESCE(t.onboarded_at, t.created_at, NOW()),
  COALESCE(t.onboarded_at, t.created_at, NOW()) + INTERVAL '30 days',
  CASE
    WHEN COALESCE(t.onboarded_at, t.created_at, NOW()) + INTERVAL '30 days' > NOW()
      THEN 'active'
    ELSE 'expired'
  END,
  jsonb_build_object('source', 'subscription_enforcement_backfill', 'duration_days', 30)
FROM tenants t
WHERE t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM customer_subscriptions cs
    WHERE cs.tenant_id = t.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM users u
    WHERE u.tenant_id = t.id
      AND u.role = 'platform_admin'
  );

COMMIT;
