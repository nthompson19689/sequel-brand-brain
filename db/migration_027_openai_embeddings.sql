-- Migration 027: switch from vector(1024) (Voyage) to vector(1536) (OpenAI
-- text-embedding-3-small). Nothing was actually embedded yet so this is
-- a safe schema change with no data loss.
--
-- Also adds embedding columns to brand_docs, campaigns, campaign_assets,
-- and competitor_scan_results so the MCP server can do semantic search
-- across all of them.

-- ─── Drop old ivfflat indexes (depend on the vector column type) ───
DROP INDEX IF EXISTS idx_articles_embedding;
DROP INDEX IF EXISTS idx_battle_cards_embedding;
DROP INDEX IF EXISTS idx_call_insights_embedding;

-- ─── Resize existing vector columns 1024 → 1536 ───
ALTER TABLE articles       ALTER COLUMN embedding TYPE vector(1536) USING NULL;
ALTER TABLE battle_cards   ALTER COLUMN embedding TYPE vector(1536) USING NULL;
ALTER TABLE call_insights  ALTER COLUMN embedding TYPE vector(1536) USING NULL;

-- ─── Add embedding columns where they don't exist yet ───
ALTER TABLE brand_docs               ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE campaigns                ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE campaign_assets          ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE competitor_scan_results  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- ─── Recreate ivfflat indexes for cosine similarity ───
CREATE INDEX IF NOT EXISTS idx_articles_embedding              ON articles              USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_battle_cards_embedding          ON battle_cards          USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS idx_call_insights_embedding         ON call_insights         USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_brand_docs_embedding            ON brand_docs            USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS idx_campaigns_embedding             ON campaigns             USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);
CREATE INDEX IF NOT EXISTS idx_campaign_assets_embedding       ON campaign_assets       USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);
CREATE INDEX IF NOT EXISTS idx_competitor_scan_embedding       ON competitor_scan_results USING ivfflat (embedding vector_cosine_ops) WITH (lists = 30);

-- ─── Drop the old 1024-dim search RPCs from schema.sql ───
-- They referenced vector(1024) signatures and are now stale. The MCP
-- server uses inline queries instead, so we don't recreate them.
DROP FUNCTION IF EXISTS search_articles(vector, int, float);
DROP FUNCTION IF EXISTS search_battle_cards(vector, int, float);
DROP FUNCTION IF EXISTS search_call_insights(vector, int, float);
DROP FUNCTION IF EXISTS search_all(vector, int, float);

NOTIFY pgrst, 'reload schema';
