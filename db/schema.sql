-- Sequel Brand Brain — Supabase Schema
-- Run this in the Supabase SQL Editor to set up all tables

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- BRAND BRAIN (Protected Layer)
-- These are the governance docs — brand voice,
-- MVV, guidelines. Always loaded into every
-- Claude API call. Not user-editable via the app.
-- ============================================

CREATE TABLE brand_docs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    doc_type TEXT NOT NULL CHECK (doc_type IN (
        'mission_vision_values',
        'voice_and_tone',
        'editorial_longform',
        'editorial_shortform',
        'content_examples',
        'positioning',
        'icp',
        'other'
    )),
    content TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brand_docs_type ON brand_docs(doc_type);
CREATE INDEX idx_brand_docs_active ON brand_docs(is_active);

-- ============================================
-- ARTICLES / SITEMAP (Searchable Content)
-- Full text of every published article + embeddings
-- for semantic search. This is the retrieval layer.
-- ============================================

CREATE TABLE articles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    url TEXT UNIQUE,
    slug TEXT,
    full_text TEXT NOT NULL,
    meta_description TEXT,
    primary_keyword TEXT,
    secondary_keywords TEXT[],
    word_count INTEGER,
    status TEXT DEFAULT 'published' CHECK (status IN (
        'published', 'draft', 'archived', 'needs_refresh'
    )),
    embedding vector(1024),  -- Voyage AI dimension; change to 1536 for OpenAI
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_keyword ON articles(primary_keyword);
CREATE INDEX idx_articles_embedding ON articles
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ============================================
-- BATTLE CARDS (Competitive Intelligence)
-- One card per competitor, updated regularly.
-- Searchable by embedding for relevant retrieval.
-- ============================================

CREATE TABLE battle_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_name TEXT NOT NULL,
    positioning TEXT,
    strengths TEXT,
    weaknesses TEXT,
    common_objections TEXT,
    win_strategy TEXT,
    pricing_intel TEXT,
    full_content TEXT NOT NULL,  -- concatenated for embedding
    embedding vector(1024),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_battle_cards_competitor ON battle_cards(competitor_name);
CREATE INDEX idx_battle_cards_embedding ON battle_cards
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- ============================================
-- CALL INSIGHTS (Gong / Call Data)
-- Extracted insights from sales and CS calls.
-- Not raw transcripts — structured signals.
-- ============================================

CREATE TABLE call_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_type TEXT NOT NULL CHECK (call_type IN (
        'prospect_won', 'prospect_lost', 'customer'
    )),
    company_name TEXT,
    contact_name TEXT,
    call_date TIMESTAMPTZ,
    summary TEXT,
    objections TEXT[],
    competitors_mentioned TEXT[],
    features_discussed TEXT[],
    sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral', 'mixed')),
    churn_risk BOOLEAN DEFAULT false,
    case_study_candidate BOOLEAN DEFAULT false,
    notable_quotes TEXT,
    full_content TEXT NOT NULL,  -- concatenated for embedding
    embedding vector(1024),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_call_insights_type ON call_insights(call_type);
CREATE INDEX idx_call_insights_sentiment ON call_insights(sentiment);
CREATE INDEX idx_call_insights_churn ON call_insights(churn_risk) WHERE churn_risk = true;
CREATE INDEX idx_call_insights_casestudy ON call_insights(case_study_candidate) WHERE case_study_candidate = true;
CREATE INDEX idx_call_insights_embedding ON call_insights
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ============================================
-- AGENTS (User-Created Configurations)
-- Each agent is a saved config: system prompt,
-- tool selection, and data scope.
-- ============================================

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '🤖',
    created_by TEXT,  -- user identifier
    system_prompt TEXT NOT NULL,
    tools JSONB DEFAULT '[]',  -- which data sources: ["articles", "battle_cards", "call_insights"]
    is_shared BOOLEAN DEFAULT false,
    run_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agents_created_by ON agents(created_by);

-- ============================================
-- CHAT HISTORY
-- Stores conversations for context continuity.
-- ============================================

CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id TEXT,
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    sources JSONB,  -- which docs/articles were retrieved for this response
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);

-- ============================================
-- CONTENT PIPELINE
-- The content engine: CSV import → brief →
-- write → edit → approve → publish
-- ============================================

CREATE TABLE content_clusters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cluster_id UUID REFERENCES content_clusters(id) ON DELETE CASCADE,
    title TEXT,
    primary_keyword TEXT NOT NULL,
    secondary_keywords TEXT[],
    search_intent TEXT,
    post_type TEXT CHECK (post_type IN ('pillar', 'supporting', 'question', 'comparison')),
    status TEXT DEFAULT 'queued' CHECK (status IN (
        'queued',
        'brief_generated',
        'brief_approved',
        'draft_complete',
        'edited',
        'approved',
        'published'
    )),
    brief TEXT,
    draft TEXT,
    edited_draft TEXT,
    editor_notes JSONB,  -- structured editor feedback
    internal_links JSONB,  -- suggested internal links from sitemap
    webflow_item_id TEXT,
    published_url TEXT,
    word_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_posts_cluster ON content_posts(cluster_id);
CREATE INDEX idx_content_posts_status ON content_posts(status);

-- ============================================
-- VECTOR SEARCH FUNCTIONS
-- These are called by the app to find relevant
-- content for any query.
-- ============================================

-- Search articles by semantic similarity
CREATE OR REPLACE FUNCTION search_articles(
    query_embedding vector(1024),
    match_count INT DEFAULT 5,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    url TEXT,
    full_text TEXT,
    primary_keyword TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        a.id,
        a.title,
        a.url,
        a.full_text,
        a.primary_keyword,
        1 - (a.embedding <=> query_embedding) AS similarity
    FROM articles a
    WHERE a.status = 'published'
        AND 1 - (a.embedding <=> query_embedding) > match_threshold
    ORDER BY a.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Search battle cards by semantic similarity
CREATE OR REPLACE FUNCTION search_battle_cards(
    query_embedding vector(1024),
    match_count INT DEFAULT 3,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    competitor_name TEXT,
    full_content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        b.id,
        b.competitor_name,
        b.full_content,
        1 - (b.embedding <=> query_embedding) AS similarity
    FROM battle_cards b
    WHERE 1 - (b.embedding <=> query_embedding) > match_threshold
    ORDER BY b.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Search call insights by semantic similarity
CREATE OR REPLACE FUNCTION search_call_insights(
    query_embedding vector(1024),
    match_count INT DEFAULT 5,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    call_type TEXT,
    company_name TEXT,
    summary TEXT,
    full_content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.call_type,
        c.company_name,
        c.summary,
        c.full_content,
        1 - (c.embedding <=> query_embedding) AS similarity
    FROM call_insights c
    WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Universal search across all content types
CREATE OR REPLACE FUNCTION search_all(
    query_embedding vector(1024),
    match_count INT DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    source_type TEXT,
    source_id UUID,
    title TEXT,
    content TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    (
        SELECT
            'article'::TEXT AS source_type,
            a.id AS source_id,
            a.title,
            a.full_text AS content,
            1 - (a.embedding <=> query_embedding) AS similarity
        FROM articles a
        WHERE a.status = 'published'
            AND 1 - (a.embedding <=> query_embedding) > match_threshold
    )
    UNION ALL
    (
        SELECT
            'battle_card'::TEXT,
            b.id,
            b.competitor_name,
            b.full_content,
            1 - (b.embedding <=> query_embedding)
        FROM battle_cards b
        WHERE 1 - (b.embedding <=> query_embedding) > match_threshold
    )
    UNION ALL
    (
        SELECT
            'call_insight'::TEXT,
            c.id,
            c.company_name,
            c.full_content,
            1 - (c.embedding <=> query_embedding)
        FROM call_insights c
        WHERE 1 - (c.embedding <=> query_embedding) > match_threshold
    )
    ORDER BY similarity DESC
    LIMIT match_count;
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY (basic — expand for prod)
-- ============================================

ALTER TABLE brand_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (API routes use service role key)
CREATE POLICY "Service role full access" ON brand_docs FOR ALL USING (true);
CREATE POLICY "Service role full access" ON articles FOR ALL USING (true);
CREATE POLICY "Service role full access" ON battle_cards FOR ALL USING (true);
CREATE POLICY "Service role full access" ON call_insights FOR ALL USING (true);
CREATE POLICY "Service role full access" ON agents FOR ALL USING (true);
CREATE POLICY "Service role full access" ON chat_sessions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON chat_messages FOR ALL USING (true);
CREATE POLICY "Service role full access" ON content_clusters FOR ALL USING (true);
CREATE POLICY "Service role full access" ON content_posts FOR ALL USING (true);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_brand_docs_updated_at BEFORE UPDATE ON brand_docs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_articles_updated_at BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_content_posts_updated_at BEFORE UPDATE ON content_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
