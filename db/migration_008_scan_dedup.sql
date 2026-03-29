-- Add dedup_key column to competitor_scan_results for deduplication
-- This prevents the same finding from being stored multiple times across weekly scans

ALTER TABLE competitor_scan_results
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

-- Index for fast lookups during dedup check
CREATE INDEX IF NOT EXISTS idx_scan_results_dedup
  ON competitor_scan_results (competitor_id, dedup_key, created_at);
