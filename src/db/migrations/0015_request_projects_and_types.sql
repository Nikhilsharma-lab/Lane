-- Workspace work areas and optional Request categorization. This additive
-- migration retains old requests; both new Request columns default to NULL.
-- Apply only after a verified backup; staging before production.
BEGIN;

CREATE TYPE public.request_type AS ENUM ('bug', 'improvement', 'new_feature');

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by text NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_org_id_id_unique UNIQUE (org_id, id),
  CONSTRAINT projects_name_check CHECK (
    char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)
  ),
  CONSTRAINT projects_description_check CHECK (
    description IS NULL OR char_length(description) <= 300
  )
);
CREATE UNIQUE INDEX projects_org_name_unique ON public.projects (org_id, lower(name));
CREATE INDEX projects_created_by_idx ON public.projects (created_by);

ALTER TABLE public.requests
  ADD COLUMN project_id uuid,
  ADD COLUMN request_type public.request_type,
  ADD CONSTRAINT requests_project_workspace_fk
    FOREIGN KEY (org_id, project_id) REFERENCES public.projects(org_id, id);
CREATE INDEX requests_project_id_idx ON public.requests(project_id);

-- As with 0014, Clerk guards authorize the server-only Drizzle path. No Data
-- API policies or grants. RLS also protects against accidental future grants.
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.projects FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.projects FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.projects FROM authenticated;
  END IF;
END
$$;

COMMIT;
