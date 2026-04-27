-- Migration 023: Per-asset-type writer prompt overrides
--
-- Stores Sequel-specific writing instructions that get appended to the
-- base agent prompt for each asset type. Editable in the UI; no deploy
-- needed to change them.

CREATE TABLE IF NOT EXISTS campaign_writer_overrides (
    asset_type TEXT PRIMARY KEY CHECK (asset_type IN (
        'blog','email','linkedin','sales_enablement','website',
        'faq','video_script','slack_internal','thought_leadership','social'
    )),
    prompt TEXT NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaign_writer_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access campaign_writer_overrides"
    ON campaign_writer_overrides FOR ALL USING (true);

CREATE OR REPLACE FUNCTION set_updated_at_writer_overrides()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_writer_overrides_updated_at ON campaign_writer_overrides;
CREATE TRIGGER trg_writer_overrides_updated_at
    BEFORE UPDATE ON campaign_writer_overrides
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_writer_overrides();

NOTIFY pgrst, 'reload schema';
