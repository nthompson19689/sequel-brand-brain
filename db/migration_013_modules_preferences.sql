-- Migration 013: Role-based modules, user preferences, workspace API keys
--
-- 1. Add a `module_role` column to profiles — the user's selected GTM role
--    (Marketing, Sales, Leadership, Custom). NULL means "hasn't onboarded yet".
-- 2. Create `user_preferences` table storing enabled modules per user.
-- 3. Create `workspace_api_keys` table for admin-managed API keys per workspace.

-- ============================================================
-- 1. Profile role for module defaults
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS module_role TEXT DEFAULT NULL
  CHECK (module_role IS NULL OR module_role IN ('marketing', 'sales', 'leadership', 'custom'));

-- ============================================================
-- 2. User preferences (enabled modules)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
    module_order JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access user_preferences"
    ON user_preferences FOR ALL USING (true);

CREATE POLICY "Users manage own preferences"
    ON user_preferences FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 3. Workspace API keys (encrypted at rest by Supabase)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE UNIQUE,
    anthropic_api_key TEXT DEFAULT NULL,
    mcp_server_urls JSONB DEFAULT '[]'::jsonb,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_ws ON workspace_api_keys(workspace_id);

ALTER TABLE workspace_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access workspace_api_keys"
    ON workspace_api_keys FOR ALL USING (true);
