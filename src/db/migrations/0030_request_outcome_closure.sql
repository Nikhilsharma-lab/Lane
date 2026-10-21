BEGIN;
-- #60: measured closure, new exception codes, append-only closure corrections and follow-up links.
-- No new table. Closures are terminal facts on the Request row; see docs/superpowers/plans/2026-10-21-outcome-closure.md.
CREATE OR REPLACE FUNCTION public.valid_agreement_exception(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF value->'version'='2'::jsonb THEN
  IF NOT public.agreement_has_keys(value,ARRAY['version','kind','reasonCode','reason','actorId','ownerId','closedAt','operationId','fingerprint','release','revision']) THEN RETURN false; END IF;
  RETURN COALESCE(value->>'kind'='exception' AND value->>'reasonCode' IN ('cancelled','rolled_back','measurement_unavailable','inconclusive')
   AND jsonb_typeof(value->'reason')='string' AND length(trim(value->>'reason'))>0
   AND jsonb_typeof(value->'actorId')='string' AND length(value->>'actorId')>0
   AND jsonb_typeof(value->'ownerId')='string' AND length(value->>'ownerId')>0
   AND length(value->>'fingerprint')=64 AND (value->>'operationId')::uuid IS NOT NULL
   AND (value->>'closedAt')::timestamptz IS NOT NULL AND public.valid_release_fact(value->'release')
   AND jsonb_typeof(value->'revision')='number' AND (value->>'revision')::integer>=1,false);
 END IF;
 -- Version 1 is the #58 Superseded record, unchanged.
 IF NOT public.agreement_has_keys(value,ARRAY['version','kind','reasonCode','reason','actorId','closedAt','replacementId']) THEN RETURN false; END IF;
 RETURN COALESCE(value->'version'='1'::jsonb AND value->>'kind'='exception' AND value->>'reasonCode'='superseded'
  AND jsonb_typeof(value->'reason')='string' AND length(trim(value->>'reason'))>0
  AND jsonb_typeof(value->'actorId')='string' AND length(value->>'actorId')>0
  AND (value->>'replacementId')::uuid IS NOT NULL AND (value->>'closedAt')::timestamptz IS NOT NULL,false);
EXCEPTION WHEN others THEN RETURN false;
END $$;
CREATE FUNCTION public.valid_outcome_closure(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE guardrail jsonb; primary_result jsonb;
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF NOT public.agreement_has_keys(value,ARRAY['version','kind','actorId','ownerId','closedAt','operationId','fingerprint','expected','release','primary','guardrails','evidence','observedFrom','observedTo','revision']) THEN RETURN false; END IF;
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
CREATE FUNCTION public.valid_closure_corrections(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb;
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF NOT public.agreement_has_keys(item,ARRAY['operationId','fingerprint','actorId','at','field','correction','reason','revision'])
   OR (item->>'operationId')::uuid IS NULL OR COALESCE(length(item->>'fingerprint'),0)<>64
   OR COALESCE(length(item->>'actorId'),0)=0 OR (item->>'at')::timestamptz IS NULL
   OR COALESCE(item->>'field','') NOT IN ('actual','guardrails','evidence','observation','reason')
   OR COALESCE(length(trim(item->>'correction')),0)=0 OR COALESCE(length(trim(item->>'reason')),0)=0
   OR jsonb_typeof(item->'revision')<>'number' OR (item->>'revision')::integer<1 THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.requests
 ADD COLUMN outcome_closure jsonb CHECK(public.valid_outcome_closure(outcome_closure)),
 ADD COLUMN closure_corrections jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(public.valid_closure_corrections(closure_corrections)),
 ADD COLUMN follow_up_of uuid,
 ADD CONSTRAINT requests_single_closure CHECK(outcome_closure IS NULL OR exception_closure IS NULL),
 ADD CONSTRAINT requests_corrections_require_closure CHECK(closure_corrections='[]'::jsonb OR outcome_closure IS NOT NULL OR exception_closure IS NOT NULL),
 ADD CONSTRAINT requests_follow_up_not_self CHECK(follow_up_of IS DISTINCT FROM id),
 ADD CONSTRAINT requests_follow_up_workspace_fk FOREIGN KEY(org_id,follow_up_of) REFERENCES public.requests(org_id,id);
CREATE INDEX requests_follow_up_of_idx ON public.requests(org_id,follow_up_of) WHERE follow_up_of IS NOT NULL;
ALTER TABLE public.request_agreement_events DROP CONSTRAINT request_agreement_events_kind_check,
 ADD CONSTRAINT request_agreement_events_kind_check CHECK(kind IN ('prepared','submitted','decided','participant_replaced','invitation_resolved','concern_resolved','correction_added','replacement_created','superseded','follow_up_created'));
-- Closed never reopens. The only later changes are one appended correction, or an appended
-- admin ownership transfer when the owner has lost access, each with a revision bump.
CREATE FUNCTION public.protect_request_closure() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prior_corrections integer;
BEGIN
 IF TG_OP='UPDATE' AND NEW.follow_up_of IS DISTINCT FROM OLD.follow_up_of THEN RAISE EXCEPTION 'Follow-up link is immutable'; END IF;
 IF OLD.exception_closure IS NULL AND OLD.outcome_closure IS NULL THEN
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Closed Request is immutable'; END IF;
 IF (to_jsonb(NEW)-'closure_corrections'-'agreement_revision'-'release_state') IS DISTINCT FROM (to_jsonb(OLD)-'closure_corrections'-'agreement_revision'-'release_state') THEN RAISE EXCEPTION 'Closed Request is immutable'; END IF;
 prior_corrections := jsonb_array_length(OLD.closure_corrections);
 IF jsonb_array_length(NEW.closure_corrections) NOT IN (prior_corrections,prior_corrections+1) OR EXISTS(SELECT 1 FROM generate_series(0,prior_corrections-1) i WHERE NEW.closure_corrections->i IS DISTINCT FROM OLD.closure_corrections->i) THEN RAISE EXCEPTION 'Closure corrections are immutable'; END IF;
 IF NEW.release_state IS DISTINCT FROM OLD.release_state AND (NEW.release_state->'history'->-1->'input'->>'kind' IS DISTINCT FROM 'transfer'
  OR NEW.release_state->'release' IS DISTINCT FROM COALESCE(OLD.release_state->'release','null'::jsonb)) THEN RAISE EXCEPTION 'Closed Request is immutable'; END IF;
 -- Superseded (#58) keeps its corrections in Agreement history.
 IF OLD.exception_closure->>'reasonCode'='superseded' AND NEW.closure_corrections IS DISTINCT FROM OLD.closure_corrections THEN RAISE EXCEPTION 'Closed Request is immutable'; END IF;
 -- 0029's protect_release_history keeps release history append-only; one appended change, one revision.
 IF NEW.agreement_revision <> OLD.agreement_revision + (CASE WHEN NEW.closure_corrections IS DISTINCT FROM OLD.closure_corrections OR NEW.release_state IS DISTINCT FROM OLD.release_state THEN 1 ELSE 0 END)
  OR (NEW.closure_corrections IS DISTINCT FROM OLD.closure_corrections AND NEW.release_state IS DISTINCT FROM OLD.release_state) THEN RAISE EXCEPTION 'Closed Request is immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER protect_request_exception ON public.requests;
CREATE TRIGGER protect_request_closure BEFORE UPDATE OR DELETE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.protect_request_closure();
DROP TRIGGER set_updated_at_requests ON public.requests;
CREATE TRIGGER set_updated_at_requests BEFORE UPDATE ON public.requests FOR EACH ROW
 WHEN ((to_jsonb(NEW)-'agreement_revision'-'release_state'-'exception_closure'-'outcome_closure'-'closure_corrections') IS DISTINCT FROM (to_jsonb(OLD)-'agreement_revision'-'release_state'-'exception_closure'-'outcome_closure'-'closure_corrections'))
 EXECUTE FUNCTION public.set_updated_at();
-- Rendering hint: any closure is terminal for advancement.
CREATE OR REPLACE FUNCTION public.request_agreement_blocked(request_uuid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT r.exception_closure IS NOT NULL OR r.outcome_closure IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.request_replacements l WHERE l.replacement_id=r.id AND l.confirmed_at IS NULL)
 OR ((r.status='open' OR a.snapshot IS NOT NULL) AND (
 a.snapshot IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.concerns) c WHERE c->'resolution'='null'::jsonb)
 OR EXISTS(SELECT 1 FROM jsonb_each(a.seats) s WHERE s.value='null'::jsonb OR s.value->'nominee'->>'kind' IS DISTINCT FROM 'member' OR s.value->'decision'->>'kind' IS DISTINCT FROM 'agree')
 OR (SELECT count(DISTINCT s.value->'nominee'->>'userId') FROM jsonb_each(a.seats) s)<>3
 )) FROM public.requests r LEFT JOIN public.request_agreements a ON a.request_id=r.id AND a.org_id=r.org_id WHERE r.id=request_uuid
$$;
REVOKE ALL ON FUNCTION public.valid_agreement_exception(jsonb), public.valid_outcome_closure(jsonb), public.valid_closure_corrections(jsonb), public.protect_request_closure(), public.request_agreement_blocked(uuid) FROM PUBLIC;
COMMIT;
