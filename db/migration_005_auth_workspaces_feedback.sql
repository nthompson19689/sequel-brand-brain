-- Migration 005: Auth, Workspaces, and Feedback
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ============================================================
-- 1. PROFILES TABLE (mirrors auth.users for app-layer queries)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  role TEXT DEFAULT 'Other',
  avatar_color TEXT DEFAULT '#7C3AED',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role full access on profiles" ON profiles FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 2. WORKSPACES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'team' CHECK (type IN ('personal', 'team')),
  description TEXT,
  icon TEXT DEFAULT '🏠',
  color TEXT DEFAULT '#7C3AED',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on workspaces" ON workspaces FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Members can read their workspaces" ON workspaces FOR SELECT USING (
  id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
);

-- ============================================================
-- 3. WORKSPACE MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on workspace_members" ON workspace_members FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Members can read workspace memberships" ON workspace_members FOR SELECT USING (
  workspace_id IN (SELECT workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid())
);

-- ============================================================
-- 4. AGENT FEEDBACK TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  user_id UUID,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('thumbs_up', 'thumbs_down', 'edit_diff', 'explicit')),
  original_output TEXT,
  edited_output TEXT,
  explicit_feedback TEXT,
  patterns_detected JSONB,
  applied_to_prompt BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_feedback_agent_pending ON agent_feedback(agent_id, applied_to_prompt);

ALTER TABLE agent_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on agent_feedback" ON agent_feedback FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- 5. ADD workspace_id TO EXISTING TABLES
-- ============================================================
ALTER TABLE agents ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE agent_outputs ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;
ALTER TABLE chat_sessions ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

-- ============================================================
-- 6. AUTO-CREATE PROFILE + PERSONAL WORKSPACE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_ws_id UUID;
  user_name TEXT;
BEGIN
  -- Extract name from metadata or email
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Create profile
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    user_name,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Other')
  );

  -- Create personal workspace
  INSERT INTO public.workspaces (name, type, icon, color, created_by)
  VALUES (user_name || '''s Workspace', 'personal', '🏠', '#7C3AED', NEW.id)
  RETURNING id INTO new_ws_id;

  -- Add user as owner of personal workspace
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_ws_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
