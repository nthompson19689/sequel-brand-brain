-- Migration 022: Campaign Documents
--
-- Lets users attach reference docs (PRDs, transcripts, FAQs, CSVs, etc.)
-- to a campaign. The extracted text is included in orchestrator + writer
-- context.

CREATE TABLE IF NOT EXISTS campaign_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

    filename TEXT NOT NULL,
    file_type TEXT,           -- 'pdf', 'docx', 'txt', 'md', 'csv'
    label TEXT,               -- optional user label ("PRD", "Customer interview", etc.)
    content TEXT NOT NULL,    -- extracted plain text
    word_count INT,

    -- Whether to include in writer prompts (orchestrator always sees them).
    include_in_writers BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_docs_campaign ON campaign_documents(campaign_id);

ALTER TABLE campaign_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access campaign_documents"
    ON campaign_documents FOR ALL USING (true);
