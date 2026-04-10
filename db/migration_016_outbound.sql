-- Migration 016: Outbound Sales Module
--
-- 5 tables for prospect management, research, sequences,
-- message generation, and performance tracking.

-- ============================================================
-- 1. Prospects
-- ============================================================
CREATE TABLE IF NOT EXISTS prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    linkedin_url TEXT,
    title TEXT,
    seniority_level TEXT CHECK (seniority_level IS NULL OR seniority_level IN ('C-suite', 'VP', 'Director', 'Manager', 'IC')),
    company_name TEXT,
    company_domain TEXT,
    industry TEXT,
    employee_count TEXT,
    estimated_revenue_range TEXT,
    tech_stack JSONB DEFAULT '[]'::jsonb,
    prospect_status TEXT NOT NULL DEFAULT 'researching'
        CHECK (prospect_status IN ('researching', 'sequenced', 'replied', 'interested', 'booked', 'disqualified', 'nurture')),
    disqualification_reason TEXT,
    source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'abm_module', 'inbound')),
    lead_score INTEGER DEFAULT 50 CHECK (lead_score >= 1 AND lead_score <= 100),
    assigned_to TEXT,
    notes TEXT,
    last_contacted_at TIMESTAMPTZ,
    next_touch_due TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(prospect_status);
CREATE INDEX IF NOT EXISTS idx_prospects_score ON prospects(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_domain ON prospects(company_domain);
CREATE INDEX IF NOT EXISTS idx_prospects_next_touch ON prospects(next_touch_due);
CREATE INDEX IF NOT EXISTS idx_prospects_assigned ON prospects(assigned_to);

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access prospects" ON prospects FOR ALL USING (true);

-- ============================================================
-- 2. Prospect Research
-- ============================================================
CREATE TABLE IF NOT EXISTS prospect_research (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE UNIQUE,
    company_summary TEXT,
    role_analysis TEXT,
    recent_activity JSONB DEFAULT '[]'::jsonb,
    pain_points JSONB DEFAULT '[]'::jsonb,
    personal_hooks JSONB DEFAULT '[]'::jsonb,
    tech_stack_signals JSONB DEFAULT '[]'::jsonb,
    timing_triggers JSONB DEFAULT '[]'::jsonb,
    recommended_opening TEXT,
    recommended_product_angle TEXT,
    relevant_proof_points JSONB DEFAULT '[]'::jsonb,
    researched_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prospect_research_prospect ON prospect_research(prospect_id);

ALTER TABLE prospect_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access prospect_research" ON prospect_research FOR ALL USING (true);

-- ============================================================
-- 3. Sequences
-- ============================================================
CREATE TABLE IF NOT EXISTS sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence_name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_persona TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    total_prospects_enrolled INTEGER DEFAULT 0,
    reply_rate NUMERIC DEFAULT 0,
    booking_rate NUMERIC DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access sequences" ON sequences FOR ALL USING (true);

-- ============================================================
-- 4. Prospect Messages
-- ============================================================
CREATE TABLE IF NOT EXISTS prospect_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL,
    step_number INTEGER NOT NULL DEFAULT 1,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin_connect', 'linkedin_inmail', 'sms', 'call')),
    subject_line TEXT,
    body TEXT NOT NULL,
    edited_body TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'edited', 'approved', 'sent', 'replied', 'positive_reply', 'booked')),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    replied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prospect_messages_prospect ON prospect_messages(prospect_id);
CREATE INDEX IF NOT EXISTS idx_prospect_messages_sequence ON prospect_messages(sequence_id);
CREATE INDEX IF NOT EXISTS idx_prospect_messages_status ON prospect_messages(status);

ALTER TABLE prospect_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access prospect_messages" ON prospect_messages FOR ALL USING (true);

-- ============================================================
-- 5. Outbound Metrics
-- ============================================================
CREATE TABLE IF NOT EXISTS outbound_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    rep_id TEXT NOT NULL,
    emails_sent INTEGER DEFAULT 0,
    linkedin_sent INTEGER DEFAULT 0,
    sms_sent INTEGER DEFAULT 0,
    calls_made INTEGER DEFAULT 0,
    replies_received INTEGER DEFAULT 0,
    positive_replies INTEGER DEFAULT 0,
    meetings_booked INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (date, rep_id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_metrics_date ON outbound_metrics(date DESC);

ALTER TABLE outbound_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access outbound_metrics" ON outbound_metrics FOR ALL USING (true);

-- ============================================================
-- 6. Tenant config additions (future integration hooks)
-- ============================================================
-- Future: Gmail/Outlook SMTP for automated email sending
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS gmail_smtp_config JSONB;
-- Future: Twilio for SMS sending
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS twilio_api_key TEXT;
-- Future: Calendly/HubSpot meetings link for booking
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS calendly_url TEXT;
