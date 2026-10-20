-- Preserve incomplete edits on historical Requests without relaxing completed
-- Expected impact validation. No backfill or changes to existing saved values.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE public.requests ADD COLUMN measurement_draft jsonb;
ALTER TABLE public.requests ADD CONSTRAINT requests_measurement_draft_check CHECK (
  measurement_draft IS NULL OR (
    expected_impact IS NULL AND COALESCE(
      jsonb_typeof(measurement_draft) = 'object'
      AND measurement_draft->>'kind' = 'metric'
      AND octet_length(measurement_draft::text) <= 50000, false)
  )
);
COMMIT;
