-- Migration 015: Account-Based Marketing (ABM) Module
--
-- 5 tables for target account management, trigger monitoring,
-- content generation, engagement tracking, and integration config.

-- ============================================================
-- 1. Target Accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS target_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    domain TEXT NOT NULL UNIQUE,
    industry TEXT,
    employee_count TEXT,
    funding_stage TEXT,
    key_contacts JSONB DEFAULT '[]'::jsonb,
    tech_stack JSONB DEFAULT '[]'::jsonb,
    account_status TEXT NOT NULL DEFAULT 'researching'
        CHECK (account_status IN ('researching', 'monitoring', 'engaging', 'opportunity', 'customer')),
    priority_score INTEGER DEFAULT 50 CHECK (priority_score >= 1 AND priority_score <= 100),
    account_brief TEXT,
    triggers JSONB DEFAULT '[]'::jsonb,
    workspace_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_target_accounts_status ON target_accounts(account_status);
CREATE INDEX IF NOT EXISTS idx_target_accounts_priority ON target_accounts(priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_target_accounts_domain ON target_accounts(domain);
CREATE INDEX IF NOT EXISTS idx_target_accounts_workspace ON target_accounts(workspace_id);

ALTER TABLE target_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access target_accounts"
    ON target_accounts FOR ALL USING (true);

-- ============================================================
-- 2. Account Triggers
-- ============================================================
CREATE TABLE IF NOT EXISTS account_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES target_accounts(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'funding', 'leadership_change', 'job_posting', 'competitor_mention',
        'product_launch', 'content_published', 'event_attendance'
    )),
    trigger_detail TEXT NOT NULL,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    relevance_score INTEGER DEFAULT 5 CHECK (relevance_score >= 1 AND relevance_score <= 10),
    acted_on BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_account_triggers_account ON account_triggers(account_id);
CREATE INDEX IF NOT EXISTS idx_account_triggers_detected ON account_triggers(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_triggers_relevance ON account_triggers(relevance_score DESC);

ALTER TABLE account_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access account_triggers"
    ON account_triggers FOR ALL USING (true);

-- ============================================================
-- 3. ABM Content (generated outreach)
-- ============================================================
CREATE TABLE IF NOT EXISTS abm_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES target_accounts(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('email_sequence', 'one_pager', 'linkedin_note')),
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abm_content_account ON abm_content(account_id);

ALTER TABLE abm_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access abm_content"
    ON abm_content FOR ALL USING (true);

-- ============================================================
-- 4. Account Engagement
-- ============================================================
CREATE TABLE IF NOT EXISTS account_engagement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES target_accounts(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin', 'web', 'ad', 'event')),
    action TEXT NOT NULL CHECK (action IN ('opened', 'clicked', 'visited', 'replied', 'booked')),
    detail TEXT,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_account_engagement_account ON account_engagement(account_id);
CREATE INDEX IF NOT EXISTS idx_account_engagement_occurred ON account_engagement(occurred_at DESC);

ALTER TABLE account_engagement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access account_engagement"
    ON account_engagement FOR ALL USING (true);

-- ============================================================
-- 5. Tenant Config (future integration hooks)
-- ============================================================
-- Placeholder for HubSpot, Apollo, Sales Navigator, Slack integrations.
-- All fields are nullable — filled in when the user configures each integration.
CREATE TABLE IF NOT EXISTS tenant_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL UNIQUE,
    hubspot_api_key TEXT,        -- Future: HubSpot CRM sync for contact/deal management
    apollo_api_key TEXT,         -- Future: Apollo.io for contact enrichment and email finding
    sales_navigator_config JSONB, -- Future: LinkedIn Sales Navigator for prospecting automation
    slack_webhook_url TEXT,      -- Future: Slack notifications for high-relevance triggers (score 7+)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tenant_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access tenant_config"
    ON tenant_config FOR ALL USING (true);
