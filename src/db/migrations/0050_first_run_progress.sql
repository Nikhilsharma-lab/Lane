-- #217 (spec #195, item 6): each person's first run, per workspace. The workspace's first person gets the
-- 'first_request' guide (filing a first real Request: framing, a library metric, Reviewers, Free Requests left,
-- Release and Result due); people who join later get the short 'joined' guide that shows their Inbox.
-- `steps` lists the guide steps the person has read; `skipped_at` / `completed_at` say they skipped or finished it,
-- and reopening it from help clears both. Nothing else is stored: no demo workspace and no sample data.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.first_run_progress (
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guide text NOT NULL CONSTRAINT first_run_progress_guide_check CHECK (guide IN ('first_request', 'joined')),
  steps text[] NOT NULL DEFAULT '{}'
    CONSTRAINT first_run_progress_steps_check CHECK (steps <@ ARRAY['framing', 'prediction', 'reviewers', 'free_requests', 'release', 'inbox']::text[]),
  skipped_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX first_run_progress_user_idx ON public.first_run_progress (user_id);

ALTER TABLE public.first_run_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.first_run_progress FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.first_run_progress FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.first_run_progress FROM authenticated; END IF;
END $$;

COMMIT;
