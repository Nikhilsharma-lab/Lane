-- #153: the "No measurable impact" choice on Expected impact, with its required reason.
-- A Request either holds a measured plan (expected_impact) or the choice (no_measurable_impact_reason),
-- never both. Choosing it clears the plan. Such Requests are operational work and are excluded from totals.
-- Expected impact history (0035) keeps the choice too: a revision holds the plan or the choice, never both.
-- Existing rows are unchanged: no reason is set on any Request before this migration.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.requests
 ADD COLUMN no_measurable_impact_reason text,
 ADD CONSTRAINT requests_no_measurable_impact_check CHECK (
  no_measurable_impact_reason IS NULL OR (
   btrim(no_measurable_impact_reason) <> ''
   AND char_length(no_measurable_impact_reason) <= 1000
   AND expected_impact IS NULL
   AND measurement_draft IS NULL));

-- A revision records exactly one of: a measured plan, or the choice with its reason.
ALTER TABLE public.request_expected_impact_revisions
 ALTER COLUMN expected_impact DROP NOT NULL,
 ADD COLUMN no_measurable_impact_reason text,
 ADD CONSTRAINT request_expected_impact_revisions_one_kind_check CHECK (
  (expected_impact IS NULL) <> (no_measurable_impact_reason IS NULL)
  AND (no_measurable_impact_reason IS NULL OR (btrim(no_measurable_impact_reason) <> '' AND char_length(no_measurable_impact_reason) <= 1000)));

-- Every new Request with a plan or the choice gets revision 1 in the same write, so no path can skip it.
CREATE OR REPLACE FUNCTION public.record_created_expected_impact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.expected_impact IS NOT NULL OR NEW.no_measurable_impact_reason IS NOT NULL THEN
  INSERT INTO public.request_expected_impact_revisions (org_id, request_id, revision, expected_impact, no_measurable_impact_reason, author_id, recorded_as)
  VALUES (NEW.org_id, NEW.id, 1, NEW.expected_impact, NEW.no_measurable_impact_reason, NEW.created_by, 'created');
 END IF;
 RETURN NEW;
END $$;

COMMIT;
