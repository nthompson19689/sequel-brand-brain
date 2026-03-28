-- Migration 004: Add model column to agents table
-- Run this in the Supabase SQL Editor

ALTER TABLE agents ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'claude-sonnet-4-6';
