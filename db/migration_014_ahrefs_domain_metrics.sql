-- Migration 014: Ahrefs domain-level metrics history + per-page backlinks
--
-- 1. New table to store historical domain-level Ahrefs metrics (for trend arrows)
-- 2. Add backlinks column to seo_page_metrics for per-page data

CREATE TABLE IF NOT EXISTS ahrefs_domain_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain_rating NUMERIC DEFAULT 0,
    total_backlinks INTEGER DEFAULT 0,
    referring_domains INTEGER DEFAULT 0,
    ahrefs_rank INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ahrefs_domain_metrics_synced
    ON ahrefs_domain_metrics(synced_at DESC);

ALTER TABLE ahrefs_domain_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access ahrefs_domain_metrics"
    ON ahrefs_domain_metrics FOR ALL USING (true);

-- Per-page backlinks column on existing table
ALTER TABLE seo_page_metrics ADD COLUMN IF NOT EXISTS backlinks INTEGER DEFAULT 0;
