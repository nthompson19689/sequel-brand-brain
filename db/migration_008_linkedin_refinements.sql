-- Migration 008: LinkedIn Refinements
-- Stores user edits to AI-generated posts so future generations learn from preferences.
-- Each entry is { original: string, edited: string }. Max 20 kept per user.
-- Run this in the Supabase SQL Editor.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_refinements JSONB DEFAULT '[]';
