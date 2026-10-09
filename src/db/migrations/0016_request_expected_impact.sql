-- Expected outcome captured at creation and preserved with the signed review.
-- NULL remains valid for existing Requests; guarded new saves require a value.
-- Apply after a verified backup; staging before production.
BEGIN;

ALTER TABLE public.requests ADD COLUMN expected_impact jsonb;
ALTER TABLE public.requests ADD CONSTRAINT requests_expected_impact_check CHECK (
  expected_impact IS NULL OR COALESCE(
    CASE WHEN jsonb_typeof(expected_impact) = 'object' THEN
      jsonb_typeof(expected_impact->'source') = 'string'
      AND char_length(btrim(expected_impact->>'source')) BETWEEN 1 AND 1000
      AND CASE WHEN jsonb_typeof(expected_impact->'reviewAfterDays') = 'number' THEN
        (expected_impact->>'reviewAfterDays')::numeric BETWEEN 1 AND 3650
        AND (expected_impact->>'reviewAfterDays')::numeric = trunc((expected_impact->>'reviewAfterDays')::numeric)
      ELSE false END
      AND CASE expected_impact->>'kind'
        WHEN 'metric' THEN
          jsonb_typeof(expected_impact->'metric') = 'string'
          AND char_length(btrim(expected_impact->>'metric')) BETWEEN 1 AND 120
          AND jsonb_typeof(expected_impact->'unit') = 'string'
          AND char_length(btrim(expected_impact->>'unit')) BETWEEN 1 AND 40
          AND CASE WHEN jsonb_typeof(expected_impact->'target') = 'number' THEN
            (expected_impact->>'target')::numeric BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308
          ELSE false END
          AND CASE jsonb_typeof(expected_impact->'baseline')
            WHEN 'null' THEN true
            WHEN 'number' THEN (expected_impact->>'baseline')::numeric BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308
            ELSE false
          END
        WHEN 'verification' THEN
          jsonb_typeof(expected_impact->'result') = 'string'
          AND char_length(btrim(expected_impact->>'result')) BETWEEN 1 AND 2000
        ELSE false
      END
    ELSE false END,
    false
  )
);

-- Existing Requests RLS/grants are unchanged. No direct-client access is added.
COMMIT;
