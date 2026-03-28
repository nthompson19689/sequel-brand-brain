-- Migration 006: Admin + LinkedIn Ghostwriter
-- Run this in the Supabase SQL Editor

-- ============================================================
-- 1. ADMIN FIELDS ON PROFILES
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Bootstrap: set Nathan as admin
UPDATE profiles SET is_admin = true WHERE id = '570df420-7758-40c4-9635-c271a27c0eb7';

-- ============================================================
-- 2. LINKEDIN FIELDS ON PROFILES
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_url TEXT DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_voice JSONB DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_samples TEXT[] DEFAULT '{}';

-- ============================================================
-- 3. PENDING INVITES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS pending_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role TEXT DEFAULT 'Other',
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  workspace_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ
);

ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on pending_invites" ON pending_invites FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 4. LINKEDIN POSTS HISTORY TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS linkedin_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  variants JSONB NOT NULL DEFAULT '[]',
  source_type TEXT DEFAULT 'manual',
  source_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_linkedin_posts_user ON linkedin_posts(user_id, created_at DESC);

ALTER TABLE linkedin_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on linkedin_posts" ON linkedin_posts FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Users can read own linkedin posts" ON linkedin_posts FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- 5. UPDATE TRIGGER: Mark invite as accepted on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_ws_id UUID;
  user_name TEXT;
BEGIN
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    user_name,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Other')
  );

  INSERT INTO public.workspaces (name, type, icon, color, created_by)
  VALUES (user_name || '''s Workspace', 'personal', '', '#7C3AED', NEW.id)
  RETURNING id INTO new_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws_id, NEW.id, 'owner');

  -- Mark any pending invite as accepted
  UPDATE public.pending_invites
  SET accepted_at = NOW()
  WHERE email = NEW.email AND accepted_at IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
