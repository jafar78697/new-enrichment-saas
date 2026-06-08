-- Outreach Automation & Email Sending Tables

-- 1. Email Accounts (SMTP/IMAP configurations)
CREATE TABLE IF NOT EXISTS outreach_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT 'gmail', -- 'gmail', 'smtp'
    app_password TEXT NOT NULL, -- Stored securely or at least app specific
    daily_limit INTEGER DEFAULT 25,
    sent_today INTEGER DEFAULT 0,
    day_reset DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    status TEXT DEFAULT 'ok', -- 'ok', 'error', 'needs_reauth'
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, email)
);

-- 2. Outreach Campaigns
CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    channel TEXT DEFAULT 'email', -- 'email', 'linkedin', 'instagram'
    status TEXT DEFAULT 'draft', -- 'draft', 'active', 'paused', 'completed'
    subject TEXT, -- For emails
    body TEXT NOT NULL,
    followup_subject TEXT,
    followup_body TEXT,
    followup_days INTEGER DEFAULT 3,
    daily_limit INTEGER DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Outreach Logs / Prospects Tracker
CREATE TABLE IF NOT EXISTS outreach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
    lead_id UUID NOT NULL REFERENCES enrichment_results(id) ON DELETE CASCADE,
    account_id UUID REFERENCES outreach_accounts(id) ON DELETE SET NULL,
    channel TEXT DEFAULT 'email',
    status TEXT DEFAULT 'pending', -- 'pending', 'sending', 'sent', 'opened', 'replied', 'failed'
    sent_subject TEXT,
    sent_body TEXT,
    msg_id TEXT, -- For IMAP tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    replied_at TIMESTAMP WITH TIME ZONE,
    open_count INTEGER DEFAULT 0,
    error_message TEXT,
    followup_step INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(campaign_id, lead_id)
);

-- 4. Unified Inbox (For fetched replies)
CREATE TABLE IF NOT EXISTS unified_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES outreach_accounts(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES enrichment_results(id) ON DELETE SET NULL,
    msg_id TEXT NOT NULL,
    in_reply_to TEXT,
    from_email TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    is_read BOOLEAN DEFAULT false,
    received_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(tenant_id, msg_id)
);

CREATE INDEX idx_outreach_accounts_tenant ON outreach_accounts(tenant_id);
CREATE INDEX idx_outreach_campaigns_tenant ON outreach_campaigns(tenant_id);
CREATE INDEX idx_outreach_logs_campaign ON outreach_logs(campaign_id);
CREATE INDEX idx_outreach_logs_lead ON outreach_logs(lead_id);
CREATE INDEX idx_unified_inbox_tenant ON unified_inbox(tenant_id);
CREATE INDEX idx_unified_inbox_lead ON unified_inbox(lead_id);
