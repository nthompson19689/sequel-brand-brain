-- Migration 001: Add workflow steps and output_format to agents table
-- Run this in the Supabase SQL Editor

-- Add steps column (JSONB array of workflow steps)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS steps JSONB DEFAULT '[]';

-- Add output_format column
ALTER TABLE agents ADD COLUMN IF NOT EXISTS output_format TEXT DEFAULT '';

-- Add is_builtin flag to distinguish pre-built agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_builtin BOOLEAN DEFAULT false;
