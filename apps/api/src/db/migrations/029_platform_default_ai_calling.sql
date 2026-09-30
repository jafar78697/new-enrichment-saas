-- Default AI Calling workspace for tenantless legacy manager sessions.
-- The platform tenant is selected by its stable slug; no user email is used.

BEGIN;

INSERT INTO customer_subscriptions (
  tenant_id, plan_name, pkr_price, start_date, end_date, status, snapshot
)
SELECT
  t.id,
  'Platform Enterprise',
  0,
  NOW(),
  NULL,
  'active',
  '{"source":"platform_default_ai_calling","calling_access":"active"}'::jsonb
FROM tenants t
WHERE t.slug = 'jentoai-platform'
  AND t.deleted_at IS NULL
  AND t.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM customer_subscriptions s
    WHERE s.tenant_id = t.id
      AND s.status = 'active'
      AND s.start_date <= NOW()
      AND (s.end_date IS NULL OR s.end_date > NOW())
  );

INSERT INTO ai_agent_configs (
  tenant_id, name, provider, mode, is_active, voice, language,
  prompt, greeting, assigned_phone_number, max_call_duration_sec
)
SELECT
  t.id,
  'Jento AI Outbound Agent',
  'deepgram_voice_agent',
  'outbound',
  true,
  'flux-kit-en',
  'en',
  'You are Jento AI''s concise outbound business development caller for companies in the USA and Canada. Introduce yourself clearly as an AI assistant from Jento AI and ask whether it is a good time for one short question. Discover whether missed calls, slow lead follow-up, or after-hours coverage are costing the company business. Ask one question at a time and use only facts the prospect confirms. If there is interest, ask for a preferred callback day, time, timezone, phone number, and email, then save a factual call note. Never invent prices, integrations, results, appointments, or business facts. Never request passwords, payment card details, API keys, or sensitive information. Respect refusals immediately. If the person asks not to be called again, apologize, record do-not-call, and end the call. Keep every spoken response short, natural, and professional.',
  'Hi, am I speaking with the person responsible for incoming calls? This is Jento AI. Is now a bad time for one quick question?',
  NULL,
  180
FROM tenants t
WHERE t.slug = 'jentoai-platform'
  AND t.deleted_at IS NULL
  AND t.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM ai_agent_configs ac
    WHERE ac.tenant_id = t.id
      AND ac.mode = 'outbound'
      AND ac.is_active = true
  );

COMMIT;
