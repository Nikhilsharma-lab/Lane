-- #152: keep every agreed Expected impact revision. Each row is one saved version of a
-- Request's expected_impact, with who saved it and when. Rows are never edited, and are removed
-- only with their Request. requests.expected_impact stays the current version, unchanged.
-- Creation is recorded by a trigger (author = the creator). Later revisions are recorded by the
-- edit action in the same transaction as the change (author = the editor).
-- Backfill: each existing Request's current impact becomes revision 1, recorded as 'backfilled'.
-- Its author is the creator and its time is the creation time; the real editing history before
-- this migration is not known.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.request_expected_impact_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id text NOT NULL,
 request_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 expected_impact jsonb NOT NULL CHECK (jsonb_typeof(expected_impact) = 'object'),
 author_id text NOT NULL REFERENCES public.profiles(id),
 recorded_as text NOT NULL CHECK (recorded_as IN ('created', 'revised', 'backfilled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (request_id, revision),
 FOREIGN KEY (org_id, request_id) REFERENCES public.requests(org_id, id) ON DELETE CASCADE
);
CREATE INDEX request_expected_impact_revisions_history_idx ON public.request_expected_impact_revisions(org_id, request_id, revision);

INSERT INTO public.request_expected_impact_revisions (org_id, request_id, revision, expected_impact, author_id, recorded_as, created_at)
SELECT org_id, id, 1, expected_impact, created_by, 'backfilled', created_at
FROM public.requests
WHERE expected_impact IS NOT NULL;

-- Revisions are kept: no update, and no delete except the cascade of a Request that is being removed.
CREATE FUNCTION public.protect_expected_impact_revisions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Expected impact revisions are immutable'; END IF;
 IF EXISTS (SELECT 1 FROM public.requests r WHERE r.org_id = OLD.org_id AND r.id = OLD.request_id) THEN
  RAISE EXCEPTION 'Expected impact revisions are kept while their Request exists';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER protect_expected_impact_revisions BEFORE UPDATE OR DELETE ON public.request_expected_impact_revisions
 FOR EACH ROW EXECUTE FUNCTION public.protect_expected_impact_revisions();

-- Every new Request with an Expected impact gets revision 1 in the same write, so no path can skip it.
CREATE FUNCTION public.record_created_expected_impact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.expected_impact IS NOT NULL THEN
  INSERT INTO public.request_expected_impact_revisions (org_id, request_id, revision, expected_impact, author_id, recorded_as)
  VALUES (NEW.org_id, NEW.id, 1, NEW.expected_impact, NEW.created_by, 'created');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER record_created_expected_impact AFTER INSERT ON public.requests
 FOR EACH ROW EXECUTE FUNCTION public.record_created_expected_impact();

ALTER TABLE public.request_expected_impact_revisions ENABLE ROW LEVEL SECURITY;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.request_expected_impact_revisions FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.request_expected_impact_revisions FROM authenticated; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_expected_impact_revisions(), public.record_created_expected_impact() FROM PUBLIC;

COMMIT;
