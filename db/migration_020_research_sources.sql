-- Migration 020: Prospect research sources + API usage tracking
--
-- Stores raw research data from each pass (Perplexity, web search, Brand Brain)
-- and tracks API usage for cost visibility.

CREATE TABLE IF NOT EXISTS prospect_research_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('perplexity', 'web_search', 'linkedin', 'brand_brain')),
    raw_response TEXT,
    extracted_facts JSONB DEFAULT '[]'::jsonb,
    retrieved_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_sources_prospect ON prospect_research_sources(prospect_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_retrieved ON prospect_research_sources(retrieved_at DESC);

ALTER TABLE prospect_research_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "svc prospect_research_sources" ON prospect_research_sources;
CREATE POLICY "svc prospect_research_sources" ON prospect_research_sources FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS api_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service TEXT NOT NULL CHECK (service IN ('perplexity', 'anthropic', 'web_search')),
    endpoint TEXT,
    tokens_used INTEGER DEFAULT 0,
    cost_estimate NUMERIC DEFAULT 0,
    triggered_by TEXT CHECK (triggered_by IN ('prospect_research', 'abm_research', 'manual', 'studio', 'outreach', 'events', 'docs')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_log_created ON api_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_log_service ON api_usage_log(service);

ALTER TABLE api_usage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "svc api_usage_log" ON api_usage_log;
CREATE POLICY "svc api_usage_log" ON api_usage_log FOR ALL USING (true);
