-- #196 (spec #195, item 1): the Metrics library. Each workspace keeps a list of Metric definitions
-- (name, unit, optional link, optional how-it's-counted line) and an append-only history of every
-- change to them. Only src/lib/metrics-library.ts reads or writes these tables.
-- Units are the four Lane already uses. The Pass/fail check is never a definition.
-- The seven starter metrics are added by the app the first time a workspace's library is read;
-- starter_key keeps each one to a single row per workspace, even after a rename or archive.
-- History follows 0035: a revision number per definition, rows never edited, removed only with
-- their definition (which goes only with its workspace). The app writes history in the same
-- transaction as the change.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.metric_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 name text NOT NULL,
 unit text NOT NULL,
 link text,
 how_counted text,
 archived_at timestamptz,
 merged_into_id uuid,
 starter_key text,
 created_by text REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT metric_definitions_org_id_id_unique UNIQUE (org_id, id),
 CONSTRAINT metric_definitions_name_check CHECK (char_length(name) BETWEEN 1 AND 120 AND name = btrim(name)),
 CONSTRAINT metric_definitions_unit_check CHECK (unit IN ('percent', 'count', 'seconds', 'minutes')),
 CONSTRAINT metric_definitions_link_check CHECK (link IS NULL OR (char_length(link) <= 2048 AND link ~* '^https?://[^[:space:]]+$')),
 CONSTRAINT metric_definitions_how_counted_check CHECK (how_counted IS NULL OR (char_length(how_counted) BETWEEN 1 AND 500 AND btrim(how_counted) <> '')),
 CONSTRAINT metric_definitions_starter_key_check CHECK (starter_key IS NULL OR starter_key IN ('conversion', 'adoption', 'error', 'support', 'csat', 'duration', 'events')),
 -- Only the starter metrics Lane adds have no maker.
 CONSTRAINT metric_definitions_created_by_check CHECK (created_by IS NOT NULL OR starter_key IS NOT NULL),
 CONSTRAINT metric_definitions_merged_into_check CHECK (merged_into_id IS DISTINCT FROM id),
 -- A definition is merged only into another definition of the same workspace.
 CONSTRAINT metric_definitions_merged_into_fk FOREIGN KEY (org_id, merged_into_id) REFERENCES public.metric_definitions(org_id, id)
);
-- Names are unique, ignoring case, among active definitions; archived and merged ones don't block a name.
CREATE UNIQUE INDEX metric_definitions_active_name_unique ON public.metric_definitions(org_id, lower(name))
 WHERE archived_at IS NULL AND merged_into_id IS NULL;
CREATE UNIQUE INDEX metric_definitions_starter_unique ON public.metric_definitions(org_id, starter_key) WHERE starter_key IS NOT NULL;
CREATE INDEX metric_definitions_merged_into_idx ON public.metric_definitions(org_id, merged_into_id) WHERE merged_into_id IS NOT NULL;
CREATE INDEX metric_definitions_created_by_idx ON public.metric_definitions(created_by);
CREATE TRIGGER set_updated_at_metric_definitions BEFORE UPDATE ON public.metric_definitions
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.metric_definition_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id text NOT NULL,
 definition_id uuid NOT NULL,
 revision integer NOT NULL CHECK (revision > 0),
 kind text NOT NULL CHECK (kind IN ('created', 'edited', 'archived', 'restored', 'merged_away', 'merged_into')),
 before jsonb CHECK (before IS NULL OR jsonb_typeof(before) = 'object'),
 after jsonb NOT NULL CHECK (jsonb_typeof(after) = 'object'),
 author_id text REFERENCES public.profiles(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (definition_id, revision),
 FOREIGN KEY (org_id, definition_id) REFERENCES public.metric_definitions(org_id, id) ON DELETE CASCADE,
 -- A creation has nothing before it; every later change does.
 CONSTRAINT metric_definition_history_creation_check CHECK ((kind = 'created') = (before IS NULL)),
 -- Only a creation may have no author: the starter metrics Lane adds.
 CONSTRAINT metric_definition_history_author_check CHECK (author_id IS NOT NULL OR kind = 'created')
);
CREATE INDEX metric_definition_history_definition_idx ON public.metric_definition_history(org_id, definition_id, revision);
CREATE INDEX metric_definition_history_author_idx ON public.metric_definition_history(author_id);

-- History is kept: no update, and no delete except the cascade of a definition that is being removed.
CREATE FUNCTION public.protect_metric_definition_history() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Metric definition history is immutable'; END IF;
 IF EXISTS (SELECT 1 FROM public.metric_definitions d WHERE d.org_id = OLD.org_id AND d.id = OLD.definition_id) THEN
  RAISE EXCEPTION 'Metric definition history is kept while its definition exists';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER protect_metric_definition_history BEFORE UPDATE OR DELETE ON public.metric_definition_history
 FOR EACH ROW EXECUTE FUNCTION public.protect_metric_definition_history();

-- No Data API access: Clerk-authorized server code owns access, like Labels and Projects.
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_definition_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metric_definitions, public.metric_definition_history FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.metric_definitions, public.metric_definition_history FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.metric_definitions, public.metric_definition_history FROM authenticated; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_metric_definition_history() FROM PUBLIC;

COMMIT;
