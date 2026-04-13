-- Nav schema migration: workspace_members, team_memberships evolution, stream_guests, RLS
-- Run after `npm run db:push` to apply RLS and indexes that Drizzle doesn't manage.

-- ─── 1. Add owner_id to organizations (workspaces) ─────────────────────────
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_id uuid;

-- ─── 2. Workspace roles + workspace_members ─────────────────────────────────
DO $$ BEGIN
  CREATE TYPE workspace_role AS ENUM ('owner', 'admin', 'member', 'guest');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role workspace_role NOT NULL DEFAULT 'member',
  invited_by uuid,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ─── 3. Team roles + evolve project_members ─────────────────────────────────
DO $$ BEGIN
  CREATE TYPE team_role AS ENUM ('lead', 'designer', 'pm', 'contributor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE project_members ADD COLUMN IF NOT EXISTS team_role team_role DEFAULT 'designer';
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS is_team_admin boolean DEFAULT false;

-- ─── 4. Add slug to projects (teams) ────────────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug text;

-- ─── 5. Stream guests ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stream_guests (
  stream_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  invited_by uuid NOT NULL,
  can_comment boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (stream_id, user_id)
);

-- ─── 6. Required indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_project_members_user_id
  ON project_members(user_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_workspace
  ON workspace_members(user_id, workspace_id);

CREATE INDEX IF NOT EXISTS idx_stream_guests_user_id
  ON stream_guests(user_id);

-- ─── 7. RLS on requests (streams) ───────────────────────────────────────────
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

-- Team members see their team's streams
CREATE POLICY "members_see_team_streams" ON requests FOR SELECT USING (
  project_id IN (
    SELECT project_id FROM project_members WHERE user_id = auth.uid()
  )
);

-- Admins/owners see all streams in their workspace
CREATE POLICY "admins_see_all" ON requests FOR SELECT USING (
  org_id IN (
    SELECT workspace_id FROM workspace_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Guests see only streams they were explicitly invited to
CREATE POLICY "guests_see_invited_streams" ON requests FOR SELECT USING (
  id IN (
    SELECT stream_id FROM stream_guests WHERE user_id = auth.uid()
  )
);
