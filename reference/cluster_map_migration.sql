-- Content Engine: Cluster-Based Production Migration
-- Run this in Supabase Dashboard → SQL Editor
--
-- This adds the cluster_posts table that powers the Brief → Writer → Editor
-- pipeline described in SLG_Content_Engine_Spec.md.

-- 1. cluster_posts: one row per blog post from the cluster map CSV
CREATE TABLE IF NOT EXISTS cluster_posts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES clients(id) ON DELETE CASCADE NOT NULL,

    -- Core identifiers
    cluster_id text NOT NULL,
    post_id text NOT NULL,
    post_type text NOT NULL CHECK (post_type IN ('pillar', 'supporting', 'question')),
    cluster_position integer NOT NULL DEFAULT 1,

    -- Content metadata
    title text NOT NULL,
    primary_keyword text NOT NULL,
    volume integer DEFAULT 0,
    kd integer DEFAULT 0,
    secondary_keywords text DEFAULT '',
    word_count integer DEFAULT 1500,
    book_chapter text DEFAULT '',

    -- Internal linking
    links_to text DEFAULT '',
    links_from text DEFAULT '',

    -- Pipeline status
    status text NOT NULL DEFAULT 'queued'
        CHECK (status IN (
            'queued',
            'brief_generated',
            'brief_approved',
            'writing',
            'editing',
            'review',
            'published'
        )),

    -- Agent outputs (stored inline for simplicity)
    brief text DEFAULT '',
    draft text DEFAULT '',
    edited_draft text DEFAULT '',
    editor_notes text DEFAULT '',
    quality_score text DEFAULT '',

    -- Publishing
    published_url text DEFAULT '',
    slug text DEFAULT '',
    meta_description text DEFAULT '',

    -- Timestamps
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- Unique constraint: one post_id per client
    UNIQUE (client_id, post_id)
);

-- 2. Enable RLS
ALTER TABLE cluster_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access cluster_posts" ON cluster_posts
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 3. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cluster_posts_client_id ON cluster_posts(client_id);
CREATE INDEX IF NOT EXISTS idx_cluster_posts_cluster_id ON cluster_posts(client_id, cluster_id);
CREATE INDEX IF NOT EXISTS idx_cluster_posts_status ON cluster_posts(status);
CREATE INDEX IF NOT EXISTS idx_cluster_posts_position ON cluster_posts(cluster_position);
CREATE INDEX IF NOT EXISTS idx_cluster_posts_post_id ON cluster_posts(client_id, post_id);

-- 4. Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_cluster_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cluster_posts_updated_at
    BEFORE UPDATE ON cluster_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_cluster_posts_updated_at();
