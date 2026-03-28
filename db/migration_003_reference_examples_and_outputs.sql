-- Migration 003: Reference examples on agents + agent_outputs table
-- Run this in the Supabase SQL Editor

-- 1. Add reference_examples to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS reference_examples TEXT DEFAULT '';

-- 2. Create agent_outputs table
CREATE TABLE IF NOT EXISTS agent_outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    input_text TEXT,
    output_content TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'exported')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_outputs_agent ON agent_outputs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_outputs_status ON agent_outputs(status);

-- RLS
ALTER TABLE agent_outputs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON agent_outputs FOR ALL USING (true);

-- Updated_at trigger
CREATE TRIGGER update_agent_outputs_updated_at BEFORE UPDATE ON agent_outputs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
