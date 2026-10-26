-- #200 (spec #195, item 1): move the metrics existing workspaces already saved into their Metrics library.
-- One-time. Each workspace gets its starter metrics, then one definition per distinct metric and unit found in its
-- saved predictions and guardrails, measurement drafts, Expected impact history and closed results.
-- * A built-in metric saved in its starter unit maps to that workspace's starter definition. Saved in another unit
--   (e.g. Conversion rate counted as "Conversions") it is a different metric and gets its own definition.
-- * Typed metrics become one definition per name (ignoring case and extra spaces) and unit. A typed name that
--   matches an active definition with the same unit maps to it. Names that clash across units get the unit added,
--   e.g. "Signups (count)" and "Signups (%)"; an Admin renames or merges them later.
-- * Older free-text units that aren't one of the four ("users", "USD") become a count, with the typed unit kept in
--   the name, e.g. "Signups (users)". "%", "s", "min", "#" and their spellings map to their unit.
-- Saved Requests are NOT rewritten: closed results and Expected impact history are protected records. Instead,
-- metric_definition_aliases records which definition each saved built-in key, or typed name and unit, stands for;
-- src/lib/metrics-library.ts resolves older saved versions through it (and follows "merged into").
-- Only the Metrics library module reads or writes these tables.
-- Pre-launch data only. Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- How a saved name and unit are compared. The migration and the library's lookups use the same two functions.
CREATE FUNCTION public.metric_alias_name(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
 SELECT lower(regexp_replace(regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '[[:space:]]+', ' ', 'g'))
$$;
CREATE FUNCTION public.metric_alias_unit(value text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
 SELECT CASE
  WHEN normalized IN ('%', 'percent', 'percentage', 'percentages', 'pct', 'per cent') THEN 'percent'
  WHEN normalized IN ('count', 'counts', '#', 'number', 'no.') THEN 'count'
  WHEN normalized IN ('seconds', 'second', 'secs', 'sec', 's') THEN 'seconds'
  WHEN normalized IN ('minutes', 'minute', 'mins', 'min') THEN 'minutes'
  ELSE normalized END
 FROM (SELECT public.metric_alias_name(value) AS normalized) AS unit
$$;

CREATE TABLE public.metric_definition_aliases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 definition_id uuid NOT NULL,
 -- Exactly one of: the built-in key, or the typed name as metric_alias_name() compares it.
 builtin_key text,
 typed_name text,
 -- The saved unit as metric_alias_unit() compares it: one of the four units, or an older free-text unit.
 unit text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (org_id, definition_id) REFERENCES public.metric_definitions(org_id, id) ON DELETE CASCADE,
 CONSTRAINT metric_definition_aliases_source_check CHECK ((builtin_key IS NULL) <> (typed_name IS NULL)),
 CONSTRAINT metric_definition_aliases_builtin_check CHECK (builtin_key IS NULL OR builtin_key IN ('conversion', 'adoption', 'error', 'support', 'csat', 'duration', 'events')),
 CONSTRAINT metric_definition_aliases_typed_check CHECK (typed_name IS NULL OR (typed_name <> '' AND typed_name = public.metric_alias_name(typed_name))),
 CONSTRAINT metric_definition_aliases_unit_check CHECK (unit <> '' AND unit = public.metric_alias_unit(unit))
);
CREATE UNIQUE INDEX metric_definition_aliases_builtin_unique ON public.metric_definition_aliases(org_id, builtin_key, unit) WHERE builtin_key IS NOT NULL;
CREATE UNIQUE INDEX metric_definition_aliases_typed_unique ON public.metric_definition_aliases(org_id, typed_name, unit) WHERE typed_name IS NOT NULL;
CREATE INDEX metric_definition_aliases_definition_idx ON public.metric_definition_aliases(org_id, definition_id);

-- The mapping is kept as recorded: no update, and no delete except the cascade of a removed definition.
CREATE FUNCTION public.protect_metric_definition_aliases() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN RAISE EXCEPTION 'Metric definition aliases are immutable'; END IF;
 IF EXISTS (SELECT 1 FROM public.metric_definitions d WHERE d.org_id = OLD.org_id AND d.id = OLD.definition_id) THEN
  RAISE EXCEPTION 'Metric definition aliases are kept while their definition exists';
 END IF;
 RETURN OLD;
END $$;
CREATE TRIGGER protect_metric_definition_aliases BEFORE UPDATE OR DELETE ON public.metric_definition_aliases
 FOR EACH ROW EXECUTE FUNCTION public.protect_metric_definition_aliases();

-- The starter metrics, as src/lib/metrics-library.ts adds them on a workspace's first read.
CREATE TEMP TABLE starter_metrics (key text PRIMARY KEY, name text NOT NULL, unit text NOT NULL, how_counted text NOT NULL, count_name text) ON COMMIT DROP;
INSERT INTO starter_metrics VALUES
 ('conversion', 'Conversion rate', 'percent', 'Share of people who start the step and finish it, within the measurement window.', 'Conversions'),
 ('adoption', 'Feature adoption rate', 'percent', 'Share of active users who use the feature at least once within the measurement window.', 'Users who adopted'),
 ('error', 'User error rate', 'percent', 'Share of people who hit an error while doing the task, within the measurement window.', 'Users with errors'),
 ('support', 'Support contact rate', 'percent', 'Share of users who contact support about this area, within the measurement window.', 'Users who contacted support'),
 ('csat', 'Customer satisfaction', 'percent', 'Share of survey responses that rate their experience as satisfied.', 'Satisfied responses'),
 ('duration', 'Median time to convert', 'seconds', 'Median time from starting the step to finishing it.', NULL),
 ('events', 'Action count', 'count', 'Number of times people take the action within the measurement window.', NULL);

WITH added AS (
 INSERT INTO public.metric_definitions (org_id, name, unit, how_counted, starter_key, created_by)
 SELECT o.id, s.name, s.unit, s.how_counted, s.key, NULL FROM public.organizations o CROSS JOIN starter_metrics s
 ON CONFLICT DO NOTHING
 RETURNING org_id, id, name, unit, link, how_counted, archived_at, merged_into_id
)
INSERT INTO public.metric_definition_history (org_id, definition_id, revision, kind, before, after, author_id)
SELECT org_id, id, 1, 'created', NULL, jsonb_build_object('name', name, 'unit', unit, 'link', link, 'howCounted', how_counted,
 'archivedAt', archived_at, 'mergedIntoId', merged_into_id), NULL
FROM added;

-- The metrics one saved Expected impact names: the main metric (position 0), then guardrails in saved order.
-- Pass/fail checks, unchosen metrics and drafts without a name or unit name nothing.
CREATE FUNCTION pg_temp.saved_metrics(impact jsonb)
RETURNS TABLE (position_in_impact bigint, builtin_key text, typed_name text, saved_unit text) LANGUAGE sql STABLE AS $$
 WITH metrics AS (
  SELECT 0::bigint AS position_in_impact, impact->'primary' AS metric WHERE impact->>'kind' = 'measurement'
  UNION ALL
  SELECT g.position_in_impact, g.metric FROM jsonb_array_elements(CASE WHEN impact->>'kind' = 'measurement' AND jsonb_typeof(impact->'guardrails') = 'array' THEN impact->'guardrails' ELSE '[]'::jsonb END)
   WITH ORDINALITY AS g(metric, position_in_impact)
 ), legacy AS (
  SELECT 0::bigint AS position_in_impact, impact->>'metric' AS typed_name, impact->>'unit' AS saved_unit WHERE impact->>'kind' = 'metric'
  UNION ALL
  SELECT 1, impact->'guardrail'->>'metric', impact->'guardrail'->>'unit' WHERE impact->>'kind' IN ('metric', 'verification') AND jsonb_typeof(impact->'guardrail') = 'object'
  UNION ALL
  SELECT 1 + g.position_in_impact, g.guardrail->>'metric', g.guardrail->>'unit'
  FROM jsonb_array_elements(CASE WHEN impact->>'kind' IN ('metric', 'verification') AND jsonb_typeof(impact->'additionalGuardrails') = 'array' THEN impact->'additionalGuardrails' ELSE '[]'::jsonb END)
   WITH ORDINALITY AS g(guardrail, position_in_impact)
 ), found AS (
  SELECT position_in_impact,
   CASE WHEN metric->>'key' IN ('conversion', 'adoption', 'error', 'support', 'csat', 'duration', 'events') THEN metric->>'key' END AS builtin_key,
   CASE WHEN metric->>'key' = 'custom' THEN metric->>'name' END AS typed_name,
   metric->>'unit' AS saved_unit
  FROM metrics WHERE metric->>'key' IN ('conversion', 'adoption', 'error', 'support', 'csat', 'duration', 'events') OR metric->>'key' = 'custom'
  UNION ALL
  SELECT position_in_impact, NULL, typed_name, saved_unit FROM legacy
 )
 SELECT position_in_impact, builtin_key, typed_name, saved_unit FROM found
 WHERE public.metric_alias_unit(COALESCE(saved_unit, '')) <> ''
  AND (builtin_key IS NOT NULL OR public.metric_alias_name(COALESCE(typed_name, '')) <> '')
$$;

-- Every saved metric, in the order it was first saved: by Request, then current impact, draft, older revisions and
-- closed result, then position. The first spelling of a typed name becomes the definition's name.
CREATE TEMP TABLE saved_metric_uses ON COMMIT DROP AS
SELECT r.org_id, r.created_by, r.created_at, r.id AS request_id, source.source_order, source.revision, m.*
FROM public.requests r
CROSS JOIN LATERAL (
 SELECT 1 AS source_order, 0 AS revision, r.expected_impact AS impact
 UNION ALL SELECT 2, 0, r.measurement_draft
 UNION ALL SELECT 3, v.revision, v.expected_impact FROM public.request_expected_impact_revisions v WHERE v.org_id = r.org_id AND v.request_id = r.id
 UNION ALL SELECT 4, 0, r.outcome_closure->'expected'
) AS source
CROSS JOIN LATERAL pg_temp.saved_metrics(source.impact) AS m
WHERE source.impact IS NOT NULL AND jsonb_typeof(source.impact) = 'object';

CREATE TEMP TABLE saved_metric_entries ON COMMIT DROP AS
WITH uses AS (
 SELECT u.org_id, u.created_by, u.builtin_key, k.*,
  row_number() OVER (ORDER BY u.org_id, u.created_at, u.request_id, u.source_order, u.revision, u.position_in_impact) AS first_seen
 FROM saved_metric_uses u
 CROSS JOIN LATERAL (SELECT
  CASE WHEN u.builtin_key IS NULL THEN public.metric_alias_name(u.typed_name) END AS typed_key,
  public.metric_alias_unit(u.saved_unit) AS unit_key,
  regexp_replace(regexp_replace(COALESCE(u.typed_name, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '[[:space:]]+', ' ', 'g') AS shown_name,
  regexp_replace(regexp_replace(u.saved_unit, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '[[:space:]]+', ' ', 'g') AS shown_unit) AS k
), spelled AS (
 -- One spelling per typed name in a workspace, whatever its unit: the first one saved.
 SELECT uses.*, first_value(shown_name) OVER (PARTITION BY org_id, typed_key ORDER BY first_seen) AS spelling FROM uses
)
SELECT DISTINCT ON (e.org_id, e.builtin_key, e.typed_key, e.unit_key)
 e.org_id, e.builtin_key, e.typed_key, e.unit_key, e.created_by, e.first_seen,
 CASE WHEN e.unit_key IN ('percent', 'count', 'seconds', 'minutes') THEN e.unit_key ELSE 'count' END AS definition_unit,
 CASE
  WHEN e.builtin_key IS NOT NULL THEN
   CASE WHEN e.unit_key = s.unit THEN s.name WHEN e.unit_key = 'count' AND s.count_name IS NOT NULL THEN s.count_name ELSE s.name END
  WHEN e.unit_key IN ('percent', 'count', 'seconds', 'minutes') THEN e.spelling
  ELSE rtrim(left(e.spelling, 120 - char_length(e.shown_unit) - 3)) || ' (' || e.shown_unit || ')'
 END AS base_name
FROM spelled e
LEFT JOIN starter_metrics s ON s.key = e.builtin_key
ORDER BY e.org_id, e.builtin_key, e.typed_key, e.unit_key, e.first_seen;

DO $$
DECLARE
 entry record;
 target uuid;
 candidate text;
 named text;
 suffix text;
 attempt integer;
BEGIN
 FOR entry IN SELECT * FROM saved_metric_entries ORDER BY org_id, first_seen LOOP
  -- 1. An active definition with this very name and unit (a starter, or one made a moment ago).
  SELECT d.id INTO target FROM public.metric_definitions d
  WHERE d.org_id = entry.org_id AND d.archived_at IS NULL AND d.merged_into_id IS NULL
   AND lower(d.name) = lower(entry.base_name) AND d.unit = entry.definition_unit;
  IF target IS NULL THEN
   -- 2. A new definition. Its name gets the unit when another unit uses the same name, here or among the saved metrics.
   -- An existing definition's spelling of the name wins ("Conversion rate", not "conversion rate").
   SELECT d.name INTO candidate FROM public.metric_definitions d
   WHERE d.org_id = entry.org_id AND d.archived_at IS NULL AND d.merged_into_id IS NULL AND lower(d.name) = lower(entry.base_name)
   ORDER BY d.starter_key IS NULL, d.created_at, d.id LIMIT 1;
   candidate := COALESCE(candidate, entry.base_name);
   IF EXISTS (SELECT 1 FROM public.metric_definitions d WHERE d.org_id = entry.org_id AND d.archived_at IS NULL AND d.merged_into_id IS NULL
               AND lower(d.name) = lower(entry.base_name) AND d.unit <> entry.definition_unit)
    OR EXISTS (SELECT 1 FROM saved_metric_entries o WHERE o.org_id = entry.org_id AND lower(o.base_name) = lower(entry.base_name) AND o.definition_unit <> entry.definition_unit) THEN
    suffix := ' (' || CASE entry.definition_unit WHEN 'percent' THEN '%' ELSE entry.definition_unit END || ')';
    candidate := rtrim(left(candidate, 120 - char_length(suffix))) || suffix;
   END IF;
   -- 3. Should that name still be taken by another unit, number it: "Signups (count) 2".
   named := candidate;
   attempt := 1;
   LOOP
    SELECT d.id INTO target FROM public.metric_definitions d
    WHERE d.org_id = entry.org_id AND d.archived_at IS NULL AND d.merged_into_id IS NULL AND lower(d.name) = lower(candidate) AND d.unit = entry.definition_unit;
    EXIT WHEN target IS NOT NULL OR NOT EXISTS (SELECT 1 FROM public.metric_definitions d
     WHERE d.org_id = entry.org_id AND d.archived_at IS NULL AND d.merged_into_id IS NULL AND lower(d.name) = lower(candidate));
    attempt := attempt + 1;
    candidate := rtrim(left(named, 120 - char_length(' ' || attempt))) || ' ' || attempt;
   END LOOP;
   IF target IS NULL THEN
    INSERT INTO public.metric_definitions (org_id, name, unit, created_by)
    VALUES (entry.org_id, candidate, entry.definition_unit, entry.created_by)
    RETURNING id INTO target;
    INSERT INTO public.metric_definition_history (org_id, definition_id, revision, kind, before, after, author_id)
    VALUES (entry.org_id, target, 1, 'created', NULL, jsonb_build_object('name', candidate, 'unit', entry.definition_unit, 'link', NULL,
     'howCounted', NULL, 'archivedAt', NULL, 'mergedIntoId', NULL), NULL);
   END IF;
  END IF;
  INSERT INTO public.metric_definition_aliases (org_id, definition_id, builtin_key, typed_name, unit)
  VALUES (entry.org_id, target, entry.builtin_key, entry.typed_key, entry.unit_key)
  ON CONFLICT DO NOTHING;
 END LOOP;
END $$;

DROP FUNCTION pg_temp.saved_metrics(jsonb);

-- No Data API access: Clerk-authorized server code owns access, like the rest of the Metrics library.
ALTER TABLE public.metric_definition_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.metric_definition_aliases FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.metric_definition_aliases FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.metric_definition_aliases FROM authenticated; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_metric_definition_aliases() FROM PUBLIC;

COMMIT;
