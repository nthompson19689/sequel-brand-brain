-- Migration 011: SEO dashboard enhancements (conversions, visitors, keyword watchlist)

-- ─── New columns on seo_page_metrics ────────────────────────────────────────────

ALTER TABLE seo_page_metrics ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0;
ALTER TABLE seo_page_metrics ADD COLUMN IF NOT EXISTS new_users INTEGER DEFAULT 0;
ALTER TABLE seo_page_metrics ADD COLUMN IF NOT EXISTS returning_users INTEGER DEFAULT 0;

-- ─── Keyword watchlist ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seo_keyword_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL UNIQUE,
  added_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seo_keyword_watchlist_keyword ON seo_keyword_watchlist(keyword);

-- ─── Keyword metrics (per period) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seo_keyword_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id UUID NOT NULL REFERENCES seo_keyword_watchlist(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- '7d', '30d', '90d'
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr NUMERIC DEFAULT 0,
  avg_position NUMERIC DEFAULT 0,
  prev_position NUMERIC DEFAULT 0,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(keyword_id, period)
);

CREATE INDEX IF NOT EXISTS idx_seo_keyword_metrics_keyword ON seo_keyword_metrics(keyword_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────────

ALTER TABLE seo_keyword_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keyword_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on seo_keyword_watchlist" ON seo_keyword_watchlist
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on seo_keyword_metrics" ON seo_keyword_metrics
  FOR ALL USING (auth.role() = 'service_role');
