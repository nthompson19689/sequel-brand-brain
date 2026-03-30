-- Migration 008: Internal ticketing system (workflow requests + bug reports)

-- ─── Tickets table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('workflow_request', 'bug_report')),
  status TEXT NOT NULL DEFAULT 'new',
  submitted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Workflow request fields
  goal TEXT,
  process TEXT,
  due_date DATE,

  -- Bug report fields
  title TEXT,
  description TEXT,
  page_feature TEXT,
  severity TEXT CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical')),
  screenshot_url TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Validate status per type
  CONSTRAINT valid_workflow_status CHECK (
    type != 'workflow_request' OR status IN ('new', 'in_progress', 'completed', 'rejected')
  ),
  CONSTRAINT valid_bug_status CHECK (
    type != 'bug_report' OR status IN ('new', 'investigating', 'fixed', 'wont_fix')
  ),

  -- Require key fields per type
  CONSTRAINT workflow_requires_goal CHECK (
    type != 'workflow_request' OR goal IS NOT NULL
  ),
  CONSTRAINT bug_requires_title CHECK (
    type != 'bug_report' OR title IS NOT NULL
  )
);

CREATE INDEX idx_tickets_submitted_by ON tickets(submitted_by, created_at DESC);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_type ON tickets(type);

-- ─── Ticket comments ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id, created_at ASC);

-- ─── RLS ─────────────────────────────────────────────────────────────────────────

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on tickets" ON tickets
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on ticket_comments" ON ticket_comments
  FOR ALL USING (auth.role() = 'service_role');

-- Users can read their own tickets
CREATE POLICY "Users can read own tickets" ON tickets
  FOR SELECT USING (auth.uid() = submitted_by);

-- Admins can read all tickets
CREATE POLICY "Admins can read all tickets" ON tickets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Users can create tickets
CREATE POLICY "Users can create tickets" ON tickets
  FOR INSERT WITH CHECK (auth.uid() = submitted_by);

-- Admins can update any ticket
CREATE POLICY "Admins can update tickets" ON tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Users can update own tickets only if status is 'new'
CREATE POLICY "Users can update own new tickets" ON tickets
  FOR UPDATE USING (auth.uid() = submitted_by AND status = 'new');

-- Comments: users can read comments on their tickets or if admin
CREATE POLICY "Users can read comments on own tickets" ON ticket_comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM tickets WHERE id = ticket_id AND submitted_by = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Anyone authenticated can add comments
CREATE POLICY "Authenticated users can add comments" ON ticket_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);
