-- Migration 010: Decks & Presentation Themes
-- Creates the tables needed for the AI deck builder.
-- Run this in the Supabase SQL Editor.

-- ============================================================
-- 1. PRESENTATION THEMES
-- ============================================================
CREATE TABLE IF NOT EXISTS presentation_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  colors JSONB NOT NULL DEFAULT '{"primary": "#7C3AED", "secondary": "#6D28D9", "accent": "#A78BFA", "background": "mixed"}',
  fonts JSONB NOT NULL DEFAULT '{"header": "Georgia", "body": "Calibri", "sizePreset": "default"}',
  logo_url TEXT,
  footer_text TEXT DEFAULT '',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE presentation_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on presentation_themes" ON presentation_themes FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can read all themes" ON presentation_themes FOR SELECT USING (true);

-- ============================================================
-- 2. DECKS
-- ============================================================
CREATE TABLE IF NOT EXISTS decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT 'Untitled Deck',
  slides JSONB NOT NULL DEFAULT '[]',
  theme_id UUID REFERENCES presentation_themes(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decks_created_by ON decks(created_by, updated_at DESC);

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on decks" ON decks FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can read own decks" ON decks FOR SELECT USING (created_by = auth.uid());
CREATE POLICY "Users can read shared decks" ON decks FOR SELECT USING (is_shared = true);
