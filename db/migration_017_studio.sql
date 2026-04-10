-- Migration 017: Thought Leadership Studio
--
-- 2 tables for source transcripts and generated content outputs.

-- ============================================================
-- 1. Studio Sources (transcripts, recordings)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('transcript_upload', 'live_recording', 'url')),
    speaker_name TEXT,
    speaker_title TEXT,
    speaker_company TEXT,
    speaker_bio TEXT,
    raw_transcript TEXT NOT NULL,
    topic_summary TEXT,
    key_quotes JSONB DEFAULT '[]'::jsonb,
    key_themes JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'ready', 'published')),
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_sources_status ON studio_sources(status);
CREATE INDEX IF NOT EXISTS idx_studio_sources_created ON studio_sources(created_at DESC);

ALTER TABLE studio_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access studio_sources"
    ON studio_sources FOR ALL USING (true);

-- ============================================================
-- 2. Studio Outputs (generated content)
-- ============================================================
CREATE TABLE IF NOT EXISTS studio_outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES studio_sources(id) ON DELETE CASCADE,
    output_type TEXT NOT NULL CHECK (output_type IN ('blog_post', 'newsletter', 'linkedin_blog_promo', 'linkedin_newsletter_promo')),
    title TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'edited', 'approved', 'published')),
    publish_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_outputs_source ON studio_outputs(source_id);
CREATE INDEX IF NOT EXISTS idx_studio_outputs_type ON studio_outputs(output_type);

ALTER TABLE studio_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access studio_outputs"
    ON studio_outputs FOR ALL USING (true);
