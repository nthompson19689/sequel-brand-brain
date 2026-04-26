-- Migration 021: Product Launch Campaign Engine
--
-- 3 tables:
--   campaigns          — top-level launch (brief + parsed manifest + meta)
--   campaign_assets    — every individual asset (blog, email, linkedin, etc.)
--   campaign_generations — generation run history (for debugging / regen)

-- ============================================================
-- 1. Campaigns
-- ============================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    launch_date DATE,

    -- Raw user-supplied brief (paragraphs, bullets, anything).
    brief TEXT NOT NULL DEFAULT '',

    -- Parsed/structured context the orchestrator extracts from `brief`.
    -- { product_name, value_props[], target_personas[], key_messages[],
    --   differentiators[], proof_points[], tone, audience_pain[] }
    parsed_context JSONB DEFAULT '{}'::jsonb,

    -- Asset manifest the orchestrator builds. Array of:
    -- { asset_type, title, audience, intent, agent, dependencies[] }
    asset_manifest JSONB DEFAULT '[]'::jsonb,

    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'parsed', 'generating', 'ready', 'published', 'archived')),

    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created ON campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_launch ON campaigns(launch_date);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access campaigns"
    ON campaigns FOR ALL USING (true);

-- ============================================================
-- 2. Campaign Assets
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

    asset_type TEXT NOT NULL CHECK (asset_type IN (
        'blog',
        'email',
        'linkedin',
        'sales_enablement',
        'website',
        'faq',
        'video_script',
        'slack_internal',
        'thought_leadership',
        'social'
    )),

    -- Which specialist agent prompt to use (filename without .md).
    agent TEXT NOT NULL,

    title TEXT,
    audience TEXT,
    intent TEXT,

    -- Other asset ids in this campaign that must complete before this one.
    dependencies JSONB DEFAULT '[]'::jsonb,

    -- The generated content.
    body TEXT,
    -- Anything structured the writer returns alongside body
    -- (subject lines, CTAs, meta_title, hashtags, etc).
    metadata JSONB DEFAULT '{}'::jsonb,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'generating', 'ready', 'edited', 'approved', 'failed')),

    error TEXT,

    -- Sort order within the campaign (set when manifest is parsed).
    position INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_assets_campaign ON campaign_assets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_status ON campaign_assets(status);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_type ON campaign_assets(asset_type);

ALTER TABLE campaign_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access campaign_assets"
    ON campaign_assets FOR ALL USING (true);

-- ============================================================
-- 3. Campaign Generations (run history)
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES campaign_assets(id) ON DELETE CASCADE,

    -- 'parse' (orchestrator), 'generate' (single asset), 'regenerate'
    kind TEXT NOT NULL CHECK (kind IN ('parse', 'generate', 'regenerate')),
    agent TEXT,

    prompt TEXT,
    response TEXT,
    error TEXT,

    input_tokens INT,
    output_tokens INT,
    duration_ms INT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_gen_campaign ON campaign_generations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_gen_asset ON campaign_generations(asset_id);
CREATE INDEX IF NOT EXISTS idx_campaign_gen_created ON campaign_generations(created_at DESC);

ALTER TABLE campaign_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access campaign_generations"
    ON campaign_generations FOR ALL USING (true);

-- ============================================================
-- updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at_campaigns()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_campaigns();

DROP TRIGGER IF EXISTS trg_campaign_assets_updated_at ON campaign_assets;
CREATE TRIGGER trg_campaign_assets_updated_at
    BEFORE UPDATE ON campaign_assets
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_campaigns();
