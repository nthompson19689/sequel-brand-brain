-- Migration 019: Customer Docs Module
--
-- 8 tables for knowledge base, transcript imports, ticket analysis,
-- FAQs, changelogs, and review tracking.

-- ============================================================
-- 1. Docs Categories
-- ============================================================
CREATE TABLE IF NOT EXISTS docs_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    icon TEXT DEFAULT '📄',
    display_order INTEGER DEFAULT 0,
    article_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE docs_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access docs_categories" ON docs_categories FOR ALL USING (true);

-- ============================================================
-- 2. Docs Articles
-- ============================================================
CREATE TABLE IF NOT EXISTS docs_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category_id UUID REFERENCES docs_categories(id) ON DELETE SET NULL,
    subcategory TEXT,
    content_markdown TEXT NOT NULL,
    content_html TEXT,
    excerpt TEXT,
    source_type TEXT NOT NULL DEFAULT 'manual'
        CHECK (source_type IN ('manual', 'transcript', 'support_ticket', 'faq_generated', 'product_update')),
    source_id UUID,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'published', 'archived', 'outdated')),
    visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'internal', 'customer_only')),
    product_area TEXT,
    difficulty_level TEXT DEFAULT 'beginner'
        CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    related_articles JSONB DEFAULT '[]'::jsonb,
    search_keywords JSONB DEFAULT '[]'::jsonb,
    view_count INTEGER DEFAULT 0,
    helpful_yes INTEGER DEFAULT 0,
    helpful_no INTEGER DEFAULT 0,
    review_interval_days INTEGER DEFAULT 90,
    last_reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_articles_category ON docs_articles(category_id);
CREATE INDEX IF NOT EXISTS idx_docs_articles_status ON docs_articles(status);
CREATE INDEX IF NOT EXISTS idx_docs_articles_product ON docs_articles(product_area);
CREATE INDEX IF NOT EXISTS idx_docs_articles_slug ON docs_articles(slug);
CREATE INDEX IF NOT EXISTS idx_docs_articles_views ON docs_articles(view_count DESC);
ALTER TABLE docs_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access docs_articles" ON docs_articles FOR ALL USING (true);

-- ============================================================
-- 3. Docs Transcript Imports
-- ============================================================
CREATE TABLE IF NOT EXISTS docs_transcript_imports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_text TEXT NOT NULL,
    transcript_source TEXT NOT NULL DEFAULT 'support_call'
        CHECK (transcript_source IN ('support_call', 'onboarding_call', 'training_session', 'sales_call', 'customer_meeting')),
    customer_name TEXT,
    customer_company TEXT,
    articles_generated INTEGER DEFAULT 0,
    articles_updated INTEGER DEFAULT 0,
    gaps_identified JSONB DEFAULT '[]'::jsonb,
    import_status TEXT NOT NULL DEFAULT 'processing'
        CHECK (import_status IN ('processing', 'review', 'completed')),
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE docs_transcript_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access docs_transcript_imports" ON docs_transcript_imports FOR ALL USING (true);

-- ============================================================
-- 4. Docs Support Tickets
-- ============================================================
CREATE TABLE IF NOT EXISTS docs_support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_subject TEXT NOT NULL,
    ticket_body TEXT,
    ticket_source TEXT DEFAULT 'email'
        CHECK (ticket_source IN ('email', 'chat', 'phone', 'form')),
    customer_email TEXT,
    customer_company TEXT,
    product_area TEXT,
    resolution TEXT,
    resolution_article_id UUID REFERENCES docs_articles(id) ON DELETE SET NULL,
    imported_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_tickets_product ON docs_support_tickets(product_area);
ALTER TABLE docs_support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access docs_support_tickets" ON docs_support_tickets FOR ALL USING (true);

-- ============================================================
-- 5. Docs FAQs
-- ============================================================
CREATE TABLE IF NOT EXISTS docs_faqs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    category_id UUID REFERENCES docs_categories(id) ON DELETE SET NULL,
    source_type TEXT DEFAULT 'manual',
    source_id UUID,
    schema_markup TEXT,
    display_order INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_faqs_category ON docs_faqs(category_id);
ALTER TABLE docs_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access docs_faqs" ON docs_faqs FOR ALL USING (true);

-- ============================================================
-- 6. Docs Changelogs
-- ============================================================
CREATE TABLE IF NOT EXISTS docs_changelogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version TEXT,
    release_date TIMESTAMPTZ DEFAULT NOW(),
    title TEXT NOT NULL,
    summary TEXT,
    details_markdown TEXT,
    affected_articles JSONB DEFAULT '[]'::jsonb,
    update_status TEXT NOT NULL DEFAULT 'drafted'
        CHECK (update_status IN ('drafted', 'articles_updated', 'published')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE docs_changelogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access docs_changelogs" ON docs_changelogs FOR ALL USING (true);

-- ============================================================
-- 7. Docs Review Log
-- ============================================================
CREATE TABLE IF NOT EXISTS docs_review_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES docs_articles(id) ON DELETE CASCADE,
    reviewed_by TEXT,
    review_result TEXT NOT NULL CHECK (review_result IN ('accurate', 'minor_update', 'major_rewrite', 'archived')),
    notes TEXT,
    reviewed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_docs_review_log_article ON docs_review_log(article_id);
ALTER TABLE docs_review_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access docs_review_log" ON docs_review_log FOR ALL USING (true);

-- ============================================================
-- 8. Tenant config additions
-- ============================================================
-- Future: auto-import support tickets
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS zendesk_api_key TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS intercom_api_key TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS freshdesk_api_key TEXT;
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS helpscout_api_key TEXT;
-- Future: custom help site domain
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS help_site_domain TEXT;
