-- Migration 002: Add content_type to articles table
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard/project/zlmnplkxzuazofjmvctb/sql)

-- 1. Add content_type column
ALTER TABLE articles ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'blog';

-- 2. Set all existing articles to 'blog' (they're all blog posts)
UPDATE articles SET content_type = 'blog' WHERE content_type IS NULL;

-- 3. Create an updated search function that supports content_type filtering
CREATE OR REPLACE FUNCTION search_articles_by_type(
    query_embedding vector(1024),
    match_count INT DEFAULT 5,
    match_threshold FLOAT DEFAULT 0.7,
    filter_content_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    url TEXT,
    full_text TEXT,
    primary_keyword TEXT,
    content_type TEXT,
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
        a.content_type,
        1 - (a.embedding <=> query_embedding) AS similarity
    FROM articles a
    WHERE a.status = 'published'
        AND 1 - (a.embedding <=> query_embedding) > match_threshold
        AND (filter_content_type IS NULL OR a.content_type = filter_content_type)
    ORDER BY a.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- 4. Create index on content_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_articles_content_type ON articles(content_type);
