-- Migration 012: Installed GTM Skills
-- Stores which skills each user has installed from the Skills marketplace,
-- along with the answers they gave during the skill's setup interview.

CREATE TABLE IF NOT EXISTS installed_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    setup_answers JSONB DEFAULT '{}'::jsonb,
    installed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_installed_skills_user ON installed_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_installed_skills_name ON installed_skills(skill_name);

ALTER TABLE installed_skills ENABLE ROW LEVEL SECURITY;

-- Service role has full access (API routes use it)
DROP POLICY IF EXISTS "Service role full access installed_skills" ON installed_skills;
CREATE POLICY "Service role full access installed_skills"
    ON installed_skills FOR ALL USING (true);

-- Authenticated users can read/write their own installed skills
DROP POLICY IF EXISTS "Users manage own installed skills" ON installed_skills;
CREATE POLICY "Users manage own installed skills"
    ON installed_skills FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
