-- Migration 018: Webinars & Events Module
--
-- 5 tables: events, event_content, event_questions, event_registrants, event_series
-- Plus tenant_config additions for future integrations.

-- ============================================================
-- 1. Event Series (optional grouping)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_series (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    series_name TEXT NOT NULL,
    description TEXT,
    cadence TEXT CHECK (cadence IS NULL OR cadence IN ('weekly', 'biweekly', 'monthly', 'quarterly')),
    default_event_type TEXT DEFAULT 'webinar',
    default_duration_minutes INTEGER DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access event_series" ON event_series FOR ALL USING (true);

-- ============================================================
-- 2. Events
-- ============================================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_type TEXT NOT NULL DEFAULT 'webinar'
        CHECK (event_type IN ('webinar', 'virtual_event', 'in_person', 'hybrid', 'workshop', 'ama')),
    description TEXT,
    speaker_names JSONB DEFAULT '[]'::jsonb,
    event_date TIMESTAMPTZ,
    duration_minutes INTEGER DEFAULT 60,
    registration_url TEXT,
    landing_page_url TEXT,
    status TEXT NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'promoting', 'live', 'completed', 'repurposed')),
    target_audience TEXT,
    topic_tags JSONB DEFAULT '[]'::jsonb,
    registration_count INTEGER DEFAULT 0,
    attendance_count INTEGER DEFAULT 0,
    recording_url TEXT,
    transcript TEXT,
    series_id UUID REFERENCES event_series(id) ON DELETE SET NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_series ON events(series_id);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access events" ON events FOR ALL USING (true);

-- ============================================================
-- 3. Event Content (generated promo + follow-up)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN (
        'landing_page', 'email_announcement', 'email_reminder', 'email_day_of',
        'linkedin_post', 'internal_announcement',
        'follow_up_email', 'follow_up_noshow', 'follow_up_linkedin', 'recap_blog'
    )),
    title TEXT,
    subject_line TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'edited', 'approved', 'sent', 'published')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_content_event ON event_content(event_id);

ALTER TABLE event_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access event_content" ON event_content FOR ALL USING (true);

-- ============================================================
-- 4. Event Questions (registration qualification)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type TEXT NOT NULL DEFAULT 'multiple_choice'
        CHECK (question_type IN ('multiple_choice', 'open_ended')),
    options JSONB,
    purpose TEXT NOT NULL DEFAULT 'qualification'
        CHECK (purpose IN ('qualification', 'personalization', 'content_planning')),
    display_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_event_questions_event ON event_questions(event_id);

ALTER TABLE event_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access event_questions" ON event_questions FOR ALL USING (true);

-- ============================================================
-- 5. Event Registrants
-- ============================================================
CREATE TABLE IF NOT EXISTS event_registrants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    title TEXT,
    registration_answers JSONB DEFAULT '{}'::jsonb,
    attended BOOLEAN DEFAULT false,
    engagement_score INTEGER DEFAULT 0 CHECK (engagement_score >= 0 AND engagement_score <= 10),
    follow_up_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (follow_up_status IN ('pending', 'sent', 'replied', 'booked')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_registrants_event ON event_registrants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrants_email ON event_registrants(email);
CREATE INDEX IF NOT EXISTS idx_event_registrants_attended ON event_registrants(attended);

ALTER TABLE event_registrants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access event_registrants" ON event_registrants FOR ALL USING (true);

-- ============================================================
-- 6. Tenant config additions (future integrations)
-- ============================================================
-- Future: Zoom API for auto-pulling registrants and attendance
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS zoom_api_key TEXT;
-- Future: Webinar platform webhook URL
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS webinar_webhook_url TEXT;
-- Future: Calendar API sync for event dates
ALTER TABLE tenant_config ADD COLUMN IF NOT EXISTS calendar_api_config JSONB;
