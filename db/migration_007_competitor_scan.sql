-- Migration 007: Competitor Scan Engine
-- Run this in the Supabase SQL Editor

-- ============================================================
-- 1. COMPETITOR WATCH LIST
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_watch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  website_url TEXT NOT NULL,
  pricing_url TEXT,
  careers_url TEXT,
  g2_url TEXT,
  changelog_url TEXT,
  events_url TEXT,
  is_active BOOLEAN DEFAULT true,
  scan_frequency TEXT DEFAULT 'weekly',
  last_scanned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE competitor_watch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on competitor_watch" ON competitor_watch FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 2. SITEMAP CACHE (for diffing new content)
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_sitemap_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitor_watch(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  last_modified TIMESTAMPTZ,
  content_type TEXT,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competitor_id, url)
);

CREATE INDEX idx_sitemap_cache_competitor ON competitor_sitemap_cache(competitor_id);

ALTER TABLE competitor_sitemap_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on competitor_sitemap_cache" ON competitor_sitemap_cache FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 3. PRICING SNAPSHOTS
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_pricing_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitor_watch(id) ON DELETE CASCADE,
  snapshot_text TEXT NOT NULL,
  snapshot_hash TEXT,
  changes_detected TEXT,
  significance TEXT DEFAULT 'low',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_competitor ON competitor_pricing_snapshots(competitor_id, created_at DESC);

ALTER TABLE competitor_pricing_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on competitor_pricing_snapshots" ON competitor_pricing_snapshots FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. REVIEW SITE TRACKING
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_review_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitor_watch(id) ON DELETE CASCADE,
  platform TEXT DEFAULT 'g2',
  rating FLOAT,
  review_count INTEGER,
  recent_themes JSONB DEFAULT '{}',
  key_quotes JSONB DEFAULT '[]',
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_competitor ON competitor_review_tracking(competitor_id, checked_at DESC);

ALTER TABLE competitor_review_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on competitor_review_tracking" ON competitor_review_tracking FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 5. SCAN RESULTS (per-scan detailed results)
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_scan_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id UUID REFERENCES competitor_watch(id) ON DELETE CASCADE,
  scan_type TEXT NOT NULL,
  significance TEXT DEFAULT 'low',
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  raw_data TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scan_results_competitor ON competitor_scan_results(competitor_id, created_at DESC);
CREATE INDEX idx_scan_results_significance ON competitor_scan_results(significance, created_at DESC);

ALTER TABLE competitor_scan_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on competitor_scan_results" ON competitor_scan_results FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 6. WEEKLY DIGESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS competitor_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  digest_markdown TEXT NOT NULL,
  executive_summary TEXT,
  action_items JSONB DEFAULT '[]',
  competitors_scanned INTEGER DEFAULT 0,
  total_findings INTEGER DEFAULT 0,
  high_significance_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE competitor_digests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on competitor_digests" ON competitor_digests FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 7. KEYWORD OPPORTUNITIES (for auto-created content gaps)
-- ============================================================
CREATE TABLE IF NOT EXISTS keyword_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  source_detail TEXT,
  competitor_count INTEGER DEFAULT 0,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE keyword_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on keyword_opportunities" ON keyword_opportunities FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 8. ADD needs_refresh TO BATTLE CARDS
-- ============================================================
ALTER TABLE battle_cards ADD COLUMN IF NOT EXISTS needs_refresh BOOLEAN DEFAULT false;
ALTER TABLE battle_cards ADD COLUMN IF NOT EXISTS refresh_reason TEXT;
