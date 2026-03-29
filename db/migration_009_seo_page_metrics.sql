-- Migration 009: SEO Page Metrics
-- Stores per-URL performance data from GSC, GA4, and Ahrefs with a calculated health score.
-- Run this in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS seo_page_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  avg_position NUMERIC DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  engagement_rate NUMERIC DEFAULT 0,
  url_rating INTEGER DEFAULT 0,
  referring_domains INTEGER DEFAULT 0,
  health_score NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'not_working' CHECK (status IN ('working', 'needs_push', 'not_working')),
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seo_page_metrics_score ON seo_page_metrics(health_score DESC);
CREATE INDEX IF NOT EXISTS idx_seo_page_metrics_status ON seo_page_metrics(status);

ALTER TABLE seo_page_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on seo_page_metrics" ON seo_page_metrics FOR ALL USING (auth.role() = 'service_role');
