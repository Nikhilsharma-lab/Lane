-- Versioned measurement plans use the existing JSONB column. Historical
-- Expected impact records and their constraint rules remain unchanged.
-- Apply after a verified backup, staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Pure validation only: no table reads, identity, writes or elevated privileges.
-- Keep this version's behavior immutable; future contracts need a new version.
CREATE FUNCTION public.request_measurement_valid(impact jsonb, request_type text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog AS $$
DECLARE
  metric jsonb;
  settings jsonb;
  metric_key text;
  metric_unit text;
  field_name text;
  number_value numeric;
  position integer := 0;
  trim_characters CONSTANT text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  IF NOT COALESCE(jsonb_typeof(impact) = 'object' AND impact->>'kind' = 'measurement'
    AND impact->'version' = '2'::jsonb
    AND jsonb_typeof(impact->'primary') = 'object'
    AND jsonb_typeof(impact->'measurement') = 'object'
    AND jsonb_typeof(impact->'guardrails') = 'array', false) THEN RETURN false; END IF;
  IF jsonb_array_length(impact->'guardrails') > 20 THEN RETURN false; END IF;
  settings := impact->'measurement';
  IF NOT COALESCE(settings->>'audience' IN ('all','new','returning','custom')
    AND settings->>'platform' IN ('all','web','ios','android','custom')
    AND settings->'windowDays' IN ('7'::jsonb,'14'::jsonb,'30'::jsonb,'90'::jsonb)
    AND jsonb_typeof(settings->'exactDates') = 'boolean'
    AND jsonb_typeof(settings->'startDate') = 'string' AND length(settings->>'startDate') <= 10
    AND jsonb_typeof(settings->'endDate') = 'string' AND length(settings->>'endDate') <= 10, false) THEN RETURN false; END IF;
  FOREACH field_name IN ARRAY ARRAY['audience','platform'] LOOP
    IF settings ? (field_name || 'Name') AND NOT COALESCE(
      jsonb_typeof(settings->(field_name || 'Name')) = 'string'
      AND length(btrim(settings->>(field_name || 'Name'), trim_characters)) <= 100,
      false) THEN RETURN false; END IF;
    IF settings->>field_name = 'custom' AND NOT COALESCE(
      length(btrim(settings->>(field_name || 'Name'), trim_characters)) > 0,
      false) THEN RETURN false; END IF;
  END LOOP;
  IF settings->'exactDates' = 'true'::jsonb THEN
    IF NOT COALESCE(settings->>'startDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND settings->>'endDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND settings->>'startDate' >= '0001-01-01'
      AND settings->>'endDate' >= settings->>'startDate', false) THEN RETURN false; END IF;
    -- A cast rejects nonexistent calendar dates, including invalid leap days.
    IF (settings->>'endDate')::date < (settings->>'startDate')::date THEN RETURN false; END IF;
  END IF;
  FOR metric IN SELECT value FROM jsonb_array_elements(jsonb_build_array(impact->'primary') || (impact->'guardrails')) LOOP
    metric_key := metric->>'key';
    metric_unit := metric->>'unit';
    IF NOT COALESCE(jsonb_typeof(metric) = 'object'
      AND metric_key IN ('conversion','adoption','error','support','csat','duration','events','custom','check')
      AND jsonb_typeof(metric->'name') = 'string' AND length(metric->>'name') <= 120
      AND jsonb_typeof(metric->'noBaseline') = 'boolean', false) THEN RETURN false; END IF;
    IF position = 0 THEN
      IF NOT COALESCE(metric->>'check' IN ('','keyboard','required','recovery')
        AND jsonb_typeof(metric->'check') = 'string', false) THEN RETURN false; END IF;
      IF metric->'noBaseline' = 'true'::jsonb AND NOT COALESCE(request_type = 'new_feature' AND metric->'current' = 'null'::jsonb, false) THEN RETURN false; END IF;
    ELSE
      IF NOT COALESCE(metric->'noBaseline' = 'false'::jsonb
        AND metric->>'operator' IN ('at_most','at_least'), false) THEN RETURN false; END IF;
    END IF;
    IF metric_key = 'check' THEN
      IF NOT COALESCE(position = 0 AND metric->>'check' IN ('keyboard','required','recovery')
        AND metric_unit = '' AND metric->'current' = 'null'::jsonb
        AND metric->'target' = 'null'::jsonb AND metric->'noBaseline' = 'false'::jsonb, false) THEN RETURN false; END IF;
    ELSE
      IF position = 0 AND metric->>'check' <> '' THEN RETURN false; END IF;
      IF NOT COALESCE(CASE metric_key
        WHEN 'custom' THEN length(btrim(metric->>'name', trim_characters)) > 0 AND metric_unit IN ('percent','count','seconds','minutes')
        WHEN 'duration' THEN metric_unit IN ('seconds','minutes')
        WHEN 'events' THEN metric_unit = 'count'
        ELSE metric_unit IN ('percent','count') END, false) THEN RETURN false; END IF;
      FOREACH field_name IN ARRAY CASE WHEN position = 0 THEN ARRAY['current','target'] ELSE ARRAY['current','limit'] END LOOP
        IF metric->field_name = 'null'::jsonb AND field_name <> 'limit' THEN CONTINUE; END IF;
        IF NOT COALESCE(jsonb_typeof(metric->field_name) = 'number', false) THEN RETURN false; END IF;
        number_value := (metric->>field_name)::numeric;
        IF number_value < 0 OR number_value > 1.7976931348623157e308 THEN RETURN false; END IF;
        IF metric_unit = 'percent' AND number_value > 100 THEN RETURN false; END IF;
        IF metric_unit = 'count' AND (number_value <> trunc(number_value) OR number_value > 9007199254740991) THEN RETURN false; END IF;
      END LOOP;
    END IF;
    position := position + 1;
  END LOOP;
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR numeric_value_out_of_range THEN RETURN false;
END;
$$;

CREATE FUNCTION public.request_measurement_ready(impact jsonb, request_type text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog AS $$
DECLARE guardrail jsonb;
BEGIN
  -- Existing records retain the pickup behavior they shipped with.
  IF impact IS NULL OR impact->>'kind' IN ('metric','verification') THEN RETURN true; END IF;
  IF NOT public.request_measurement_valid(impact, request_type) THEN RETURN false; END IF;
  IF impact->'primary'->>'key' <> 'check'
    AND impact->'primary'->'current' = 'null'::jsonb
    AND impact->'primary'->'noBaseline' <> 'true'::jsonb THEN RETURN false; END IF;
  FOR guardrail IN SELECT value FROM jsonb_array_elements(impact->'guardrails') LOOP
    IF guardrail->'current' = 'null'::jsonb THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE public.requests DROP CONSTRAINT requests_expected_impact_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_expected_impact_check CHECK (
  expected_impact IS NULL OR CASE WHEN expected_impact->>'kind' = 'measurement'
    THEN public.request_measurement_valid(expected_impact, request_type::text)
    ELSE COALESCE(
      CASE WHEN jsonb_typeof(expected_impact) = 'object' THEN
        (NOT (expected_impact ? 'source') OR (
          jsonb_typeof(expected_impact->'source') = 'string'
          AND char_length(btrim(expected_impact->>'source')) <= 1000
        ))
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
              ELSE false END
          WHEN 'verification' THEN
            jsonb_typeof(expected_impact->'result') = 'string'
            AND char_length(btrim(expected_impact->>'result')) BETWEEN 1 AND 2000
          ELSE false END
      ELSE false END, false)
  END
);
COMMIT;
