-- Migration 025: human-in-the-loop feedback on campaign assets.
-- Lets the user write notes about a generated asset, then regenerate
-- with that feedback fed back into the writer + editor pipeline.

ALTER TABLE campaign_assets
    ADD COLUMN IF NOT EXISTS feedback TEXT,
    ADD COLUMN IF NOT EXISTS revision_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
