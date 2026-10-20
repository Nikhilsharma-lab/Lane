-- Guardrails are thresholds; no current value is required before pickup.
-- Preserve all historical JSON and immutable v2 validation. New plans use v3.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.request_measurement_valid_v2(impact jsonb, request_type text)
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

CREATE OR REPLACE FUNCTION public.request_measurement_valid(impact jsonb, request_type text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog AS $$
DECLARE metric jsonb; normalized jsonb := '[]'::jsonb;
BEGIN
  IF impact->'version' = '2'::jsonb THEN
    RETURN public.request_measurement_valid_v2(impact, request_type);
  END IF;
  IF NOT COALESCE(impact->'version' = '3'::jsonb AND jsonb_typeof(impact->'guardrails') = 'array', false) THEN RETURN false; END IF;
  FOR metric IN SELECT value FROM jsonb_array_elements(impact->'guardrails') LOOP
    IF NOT COALESCE(metric->>'operator' IN ('less_than','greater_than','equal_to','at_most','at_least'), false) THEN RETURN false; END IF;
    -- Validate shape, units and finite limits using the immutable v2 contract.
    -- This normalization is local only; the saved comparator is never rewritten.
    normalized := normalized || jsonb_build_array(jsonb_set(metric, '{operator}', '"at_most"'::jsonb));
  END LOOP;
  RETURN public.request_measurement_valid_v2(jsonb_set(jsonb_set(impact, '{version}', '2'::jsonb), '{guardrails}', normalized), request_type);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_measurement_ready(impact jsonb, request_type text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
SET search_path = pg_catalog AS $$
BEGIN
  IF impact IS NULL OR impact->>'kind' IN ('metric','verification') THEN RETURN true; END IF;
  IF NOT public.request_measurement_valid(impact, request_type) THEN RETURN false; END IF;
  IF impact->'primary'->>'key' <> 'check'
    AND impact->'primary'->'current' = 'null'::jsonb
    AND impact->'primary'->'noBaseline' <> 'true'::jsonb THEN RETURN false; END IF;
  RETURN true;
END;
$$;
COMMIT;
