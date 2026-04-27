-- Migration 024: Campaign asset scheduling
--
-- Adds when + where each asset should be posted, and a posted_at field
-- for marking it as live.

ALTER TABLE campaign_assets
    ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS channel TEXT,
    ADD COLUMN IF NOT EXISTS channel_url TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_campaign_assets_scheduled
    ON campaign_assets(scheduled_at) WHERE scheduled_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
