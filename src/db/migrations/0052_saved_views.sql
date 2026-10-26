-- #219 (spec #195, item 8): saved views. A person saves the Requests list's current filters under a name and reopens
-- it from the navigation. Each view is personal: its owner alone sees, renames, updates and deletes it; nothing is
-- shared or published. `filters` holds the list filters only (status and Project today, any later list filters
-- tomorrow), never Requests: opening a view applies them through the normal list, so it never shows more than the
-- person may see. Viewers and Guests save views too.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CONSTRAINT saved_views_name_check CHECK (char_length(name) BETWEEN 1 AND 60 AND name = btrim(name)),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb CONSTRAINT saved_views_filters_check CHECK (jsonb_typeof(filters) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One view of each name per person per workspace, ignoring case; also the navigation's read.
CREATE UNIQUE INDEX saved_views_owner_name_idx ON public.saved_views (org_id, owner_id, lower(name));
CREATE INDEX saved_views_owner_idx ON public.saved_views (owner_id);

CREATE TRIGGER set_updated_at_saved_views BEFORE UPDATE ON public.saved_views
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- No Data API access: Clerk-authorized server code owns access.
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_views FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.saved_views FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.saved_views FROM authenticated; END IF;
END $$;

COMMIT;
