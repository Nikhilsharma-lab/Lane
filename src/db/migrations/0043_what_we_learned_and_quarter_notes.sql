-- #209 (spec #195, item 3, Outcome report): the team's own words in the report.
--  1. What we learned: an optional one-line field stored with the closure, measured or closed without a result.
--     The closure validators now also accept a `learned` key (one trimmed line, at most 280 characters). It is set
--     only when closing; afterwards protect_request_closure keeps it unchanged, and it changes only through an
--     appended Correction with the new field `learned`, so the original stays on the Request. Closures saved before
--     this migration have no `learned` key and stay valid; no row is rewritten.
--  2. Quarter notes: one plain-text note per workspace per quarter, written and edited by Admins at any time, with
--     the last editor and edit time. `edited_by` names no profile on purpose (like slack_connections.connected_by):
--     it is shown, never used for access.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- One line of text: trimmed, not blank, no line breaks, at most 280 characters.
CREATE FUNCTION public.valid_learned_line(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 RETURN COALESCE(jsonb_typeof(value)='string' AND char_length(value#>>'{}') BETWEEN 1 AND 280
  AND value#>>'{}'=btrim(value#>>'{}') AND value#>>'{}' !~ '[\r\n]',false);
END $$;

CREATE OR REPLACE FUNCTION public.valid_outcome_closure(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE guardrail jsonb; primary_result jsonb;
 base text[] := ARRAY['version','kind','actorId','ownerId','closedAt','operationId','fingerprint','expected','release','primary','guardrails','evidence','observedFrom','observedTo','revision'];
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF NOT (public.agreement_has_keys(value,base) OR (public.agreement_has_keys(value,array_append(base,'learned')) AND public.valid_learned_line(value->'learned'))) THEN RETURN false; END IF;
 primary_result := value->'primary';
 IF NOT COALESCE(value->'version'='1'::jsonb AND value->>'kind'='measured'
  AND jsonb_typeof(value->'actorId')='string' AND length(value->>'actorId')>0
  AND jsonb_typeof(value->'ownerId')='string' AND length(value->>'ownerId')>0
  AND length(value->>'fingerprint')=64 AND (value->>'operationId')::uuid IS NOT NULL
  AND (value->>'closedAt')::timestamptz IS NOT NULL AND jsonb_typeof(value->'expected')='object'
  AND value->'release'<>'null'::jsonb AND public.valid_release_fact(value->'release')
  AND jsonb_typeof(value->'evidence')='string' AND length(trim(value->>'evidence'))>0
  AND to_char((value->>'observedFrom')::date,'YYYY-MM-DD')=value->>'observedFrom'
  AND to_char((value->>'observedTo')::date,'YYYY-MM-DD')=value->>'observedTo'
  AND value->>'observedFrom'<=value->>'observedTo'
  AND jsonb_typeof(value->'guardrails')='array'
  AND jsonb_typeof(value->'revision')='number' AND (value->>'revision')::integer>=1,false) THEN RETURN false; END IF;
 IF primary_result->>'kind'='numeric' THEN
  IF NOT public.agreement_has_keys(primary_result,ARRAY['kind','actual','unit']) OR jsonb_typeof(primary_result->'actual')<>'number' OR jsonb_typeof(primary_result->'unit')<>'string' THEN RETURN false; END IF;
 ELSIF primary_result->>'kind'='pass_fail' THEN
  IF NOT public.agreement_has_keys(primary_result,ARRAY['kind','passed']) OR jsonb_typeof(primary_result->'passed')<>'boolean' THEN RETURN false; END IF;
 ELSE RETURN false; END IF;
 FOR guardrail IN SELECT * FROM jsonb_array_elements(value->'guardrails') LOOP
  IF NOT public.agreement_has_keys(guardrail,ARRAY['metric','operator','limit','unit','actual'])
   OR COALESCE(length(trim(guardrail->>'metric')),0)=0 OR jsonb_typeof(guardrail->'unit')<>'string'
   OR guardrail->>'operator' NOT IN ('less_than','greater_than','equal_to','at_most','at_least')
   OR jsonb_typeof(guardrail->'limit')<>'number' OR jsonb_typeof(guardrail->'actual')<>'number' THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.valid_agreement_exception(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE base text[] := ARRAY['version','kind','reasonCode','reason','actorId','ownerId','closedAt','operationId','fingerprint','release','revision'];
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF NOT (public.agreement_has_keys(value,base) OR (public.agreement_has_keys(value,array_append(base,'learned')) AND public.valid_learned_line(value->'learned'))) THEN RETURN false; END IF;
 RETURN COALESCE(value->'version'='1'::jsonb AND value->>'kind'='exception' AND value->>'reasonCode' IN ('rolled_back','cannot_measure','other')
  AND jsonb_typeof(value->'reason')='string' AND (value->>'reasonCode'<>'other' OR length(trim(value->>'reason'))>0)
  AND jsonb_typeof(value->'actorId')='string' AND length(value->>'actorId')>0
  AND jsonb_typeof(value->'ownerId')='string' AND length(value->>'ownerId')>0
  AND length(value->>'fingerprint')=64 AND (value->>'operationId')::uuid IS NOT NULL
  AND (value->>'closedAt')::timestamptz IS NOT NULL AND public.valid_release_fact(value->'release')
  AND jsonb_typeof(value->'revision')='number' AND (value->>'revision')::integer>=1,false);
EXCEPTION WHEN others THEN RETURN false;
END $$;

-- Corrections gain the field `learned`, whose new wording is one line like the original.
CREATE OR REPLACE FUNCTION public.valid_closure_corrections(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF NOT public.agreement_has_keys(item,ARRAY['operationId','fingerprint','actorId','at','field','correction','reason','revision'])
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

REVOKE ALL ON FUNCTION public.valid_learned_line(jsonb), public.valid_outcome_closure(jsonb), public.valid_agreement_exception(jsonb), public.valid_closure_corrections(jsonb) FROM PUBLIC;

CREATE TABLE public.quarter_notes (
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL CONSTRAINT quarter_notes_year_check CHECK (year BETWEEN 2000 AND 2999),
  quarter smallint NOT NULL CONSTRAINT quarter_notes_quarter_check CHECK (quarter BETWEEN 1 AND 4),
  body text NOT NULL CONSTRAINT quarter_notes_body_check CHECK (char_length(body) BETWEEN 1 AND 4000 AND body = btrim(body)),
  edited_by text NOT NULL CONSTRAINT quarter_notes_edited_by_check CHECK (char_length(edited_by) > 0),
  edited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, year, quarter)
);

ALTER TABLE public.quarter_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quarter_notes FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.quarter_notes FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.quarter_notes FROM authenticated; END IF;
END $$;

COMMIT;
