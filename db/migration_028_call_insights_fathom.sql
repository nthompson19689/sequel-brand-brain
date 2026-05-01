-- Migration 028: Fathom integration on call_insights.
-- Adds the columns the import + classification pipeline writes:
--   fathom_call_id  unique key from Fathom (used to deduplicate imports)
--   needs_review    flag set when classification fails or is uncertain
--   call_date       call timestamp from Fathom metadata
--
-- Also widens the call_type CHECK so the new category labels we use
-- in the UI (closed_won, closed_lost, open_opp) are valid alongside
-- the originals.

-- ─── New columns ──────────────────────────────────────────────────
ALTER TABLE call_insights
    ADD COLUMN IF NOT EXISTS fathom_call_id TEXT,
    ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;

-- call_date may already exist as TIMESTAMPTZ in schema.sql; this is a
-- no-op safety net if it doesn't.
ALTER TABLE call_insights
    ADD COLUMN IF NOT EXISTS call_date TIMESTAMPTZ;

-- ─── Unique index (acts like a unique constraint, but tolerant of NULLs
-- so legacy rows without a fathom_call_id don't conflict) ────────────
CREATE UNIQUE INDEX IF NOT EXISTS call_insights_fathom_call_id_key
    ON call_insights(fathom_call_id) WHERE fathom_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_insights_needs_review
    ON call_insights(needs_review) WHERE needs_review = TRUE;

-- ─── Widen the call_type check constraint ────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'call_insights_call_type_check'
    ) THEN
        ALTER TABLE call_insights DROP CONSTRAINT call_insights_call_type_check;
    END IF;
END$$;

ALTER TABLE call_insights
    ADD CONSTRAINT call_insights_call_type_check
    CHECK (call_type IN (
        'customer',
        'sales',
        'closed_won',
        'closed_lost',
        'open_opp',
        -- legacy values from the original schema
        'prospect_won',
        'prospect_lost'
    ));

NOTIFY pgrst, 'reload schema';
