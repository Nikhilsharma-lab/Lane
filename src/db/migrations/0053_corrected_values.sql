-- Review of spec #195 (decision 1, 2026-10-26): Corrections count in totals.
--  A Correction of the actual result now records the corrected value beside its text: `value` is
--  {"kind":"numeric","actual":<number>} for a numeric metric or {"kind":"pass_fail","passed":<boolean>} for a
--  Pass/fail check. Quarter/year totals and the Outcome report count the latest such value, marked corrected; the
--  original closure stays as recorded on the Request. Only an `actual` Correction may carry a value. Older text-only
--  Corrections stay valid and keep counting the closing value. Corrections stay append-only (protect_request_closure is
--  unchanged), so a stored value is never rewritten. No row is rewritten.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- A corrected actual result: a number, or whether the check passed. Nothing else.
CREATE FUNCTION public.valid_corrected_value(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 RETURN COALESCE(jsonb_typeof(value)='object' AND CASE value->>'kind'
  WHEN 'numeric' THEN public.agreement_has_keys(value,ARRAY['kind','actual']) AND jsonb_typeof(value->'actual')='number'
  WHEN 'pass_fail' THEN public.agreement_has_keys(value,ARRAY['kind','passed']) AND jsonb_typeof(value->'passed')='boolean'
  ELSE false END,false);
END $$;

CREATE OR REPLACE FUNCTION public.valid_closure_corrections(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
 base text[] := ARRAY['operationId','fingerprint','actorId','at','field','correction','reason','revision'];
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF NOT (public.agreement_has_keys(item,base)
    OR (public.agreement_has_keys(item,array_append(base,'value')) AND item->>'field'='actual' AND public.valid_corrected_value(item->'value')))
   OR (item->>'operationId')::uuid IS NULL OR COALESCE(length(item->>'fingerprint'),0)<>64
   OR COALESCE(length(item->>'actorId'),0)=0 OR (item->>'at')::timestamptz IS NULL
   OR COALESCE(item->>'field','') NOT IN ('actual','guardrails','evidence','observation','reason','learned')
   OR COALESCE(length(trim(item->>'correction')),0)=0 OR COALESCE(length(trim(item->>'reason')),0)=0
   OR (item->>'field'='learned' AND NOT public.valid_learned_line(item->'correction'))
   OR jsonb_typeof(item->'revision')<>'number' OR (item->>'revision')::integer<1 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;

REVOKE ALL ON FUNCTION public.valid_corrected_value(jsonb), public.valid_closure_corrections(jsonb) FROM PUBLIC;

COMMIT;
