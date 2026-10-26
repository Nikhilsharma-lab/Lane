-- #218 (spec #195, item 7): Same problem links. Admins and Members link Requests that tackle the same problem, at any
-- status, including Closed; the Request page lists the group's Iterations (numbered by creation order, never stored).
-- `same_problem_members` records which group a Request is in, one group at most. Linking two Requests joins their
-- groups (two groups combine); removing a link takes only that Request out; a group left with one Request ends.
-- Deleting a Request (only an Open one can be) removes its membership. Nothing on `requests` changes, so a Closed
-- record is never touched. `same_problem_events` is each Request's history of links added and removed: append-only,
-- kept while its Request exists. Follow-ups keep `requests.follow_up_of` and are not iterations.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.same_problem_members (
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid PRIMARY KEY,
  group_id uuid NOT NULL,
  -- Who put the Request in its group (shown in history, never used for access): no profile FK, like quarter_notes.
  added_by text NOT NULL CONSTRAINT same_problem_members_added_by_check CHECK (added_by <> ''),
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT same_problem_members_request_fk FOREIGN KEY (org_id, request_id) REFERENCES public.requests(org_id, id) ON DELETE CASCADE
);
CREATE INDEX same_problem_members_group_idx ON public.same_problem_members (org_id, group_id);
CREATE INDEX same_problem_members_group_only_idx ON public.same_problem_members (group_id);

-- A group never spans workspaces.
CREATE FUNCTION public.same_problem_one_workspace() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.same_problem_members m WHERE m.group_id = NEW.group_id AND m.org_id <> NEW.org_id) THEN
  RAISE EXCEPTION 'Same problem groups stay inside one workspace' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER same_problem_one_workspace BEFORE INSERT OR UPDATE OF group_id, org_id ON public.same_problem_members
 FOR EACH ROW EXECUTE FUNCTION public.same_problem_one_workspace();

-- A group left with one Request (its other Requests deleted or taken out) is no group: that membership goes too.
CREATE FUNCTION public.same_problem_end_lone_group() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.group_id = OLD.group_id THEN RETURN NULL; END IF;
 IF (SELECT count(*) FROM public.same_problem_members m WHERE m.group_id = OLD.group_id) = 1 THEN
  DELETE FROM public.same_problem_members m WHERE m.group_id = OLD.group_id;
 END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER same_problem_end_lone_group AFTER DELETE OR UPDATE OF group_id ON public.same_problem_members
 FOR EACH ROW EXECUTE FUNCTION public.same_problem_end_lone_group();

CREATE TABLE public.same_problem_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  request_id uuid NOT NULL,
  kind text NOT NULL CONSTRAINT same_problem_events_kind_check CHECK (kind IN ('linked', 'removed')),
  -- 'linked': the Request this one was linked with. 'removed': null when this Request was taken out, or the Request
  -- whose removal ended this one's group. The number is kept so the line still reads after that Request is deleted.
  other_request_id uuid,
  other_request_number integer CONSTRAINT same_problem_events_other_number_check CHECK (other_request_number > 0),
  actor_id text NOT NULL CONSTRAINT same_problem_events_actor_check CHECK (actor_id <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT same_problem_events_other_check CHECK ((other_request_id IS NULL) = (other_request_number IS NULL)),
  CONSTRAINT same_problem_events_linked_check CHECK (kind <> 'linked' OR other_request_id IS NOT NULL),
  CONSTRAINT same_problem_events_request_fk FOREIGN KEY (org_id, request_id) REFERENCES public.requests(org_id, id) ON DELETE CASCADE
);
CREATE INDEX same_problem_events_request_idx ON public.same_problem_events (org_id, request_id, created_at);

-- History is kept: no update, and no delete except the cascade of a Request that is being deleted.
CREATE FUNCTION public.protect_same_problem_events() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Same problem link history is immutable'; END IF;
 IF EXISTS (SELECT 1 FROM public.requests r WHERE r.org_id = OLD.org_id AND r.id = OLD.request_id) THEN
  RAISE EXCEPTION 'Same problem link history is kept while its Request exists';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER protect_same_problem_events BEFORE UPDATE OR DELETE ON public.same_problem_events
 FOR EACH ROW EXECUTE FUNCTION public.protect_same_problem_events();

-- No Data API access: Clerk-authorized server code owns access.
ALTER TABLE public.same_problem_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.same_problem_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.same_problem_members, public.same_problem_events FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.same_problem_members, public.same_problem_events FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.same_problem_members, public.same_problem_events FROM authenticated; END IF;
END $$;
REVOKE ALL ON FUNCTION public.same_problem_one_workspace(), public.same_problem_end_lone_group(), public.protect_same_problem_events() FROM PUBLIC;

COMMIT;
