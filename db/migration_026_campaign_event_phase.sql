-- Migration 026: pre-event vs post-event phasing + transcript context.
-- Pre-event assets generate immediately. Post-event assets are "gated"
-- until a transcript / thought-leader notes are added on the campaign,
-- so the follow-up emails, replay LinkedIn posts, and thought-leadership
-- writeup can pull from the actual event content.

ALTER TABLE campaign_assets
    ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'pre',
    ADD COLUMN IF NOT EXISTS gated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_campaign_assets_phase ON campaign_assets(phase);

ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS event_transcript TEXT;

NOTIFY pgrst, 'reload schema';
