-- Simplify #58–#60 (decided by Nikhil, 2026-10-21):
--  * No required PM/Designer/Developer agreement and no agreement form. A Request has optional reviewers
--    (any number up to 20, none is fine). Each answers Looks good or Raise a concern (with a reason).
--    Reviews never block pickup.
--  * No frozen snapshot, concerns list, linked replacements or Superseded.
--  * Before pickup the requester deletes an unwanted Request. After pickup, work that is rolled back or
--    cannot be measured closes without a result: Rolled back, Can't be measured or Other (with a reason).
BEGIN;
-- 1. Exception closures: new reason codes, only after pickup. Convert existing rows first.
ALTER TABLE public.requests DISABLE TRIGGER protect_request_closure;
ALTER TABLE public.requests DROP CONSTRAINT requests_exception_closure_check;
-- A Superseded Request that never started goes back to Open; its requester can now delete it.
UPDATE public.requests SET exception_closure=NULL, closure_corrections='[]'::jsonb
 WHERE exception_closure IS NOT NULL AND status='open';
UPDATE public.requests SET exception_closure=jsonb_build_object(
  'version',1,'kind','exception',
  'reasonCode',CASE exception_closure->>'reasonCode' WHEN 'rolled_back' THEN 'rolled_back'
    WHEN 'measurement_unavailable' THEN 'cannot_measure' WHEN 'inconclusive' THEN 'cannot_measure' ELSE 'other' END,
  'reason',CASE WHEN exception_closure->>'reasonCode'='superseded' THEN 'Superseded: '||(exception_closure->>'reason') ELSE exception_closure->>'reason' END,
  'actorId',exception_closure->>'actorId',
  'ownerId',COALESCE(exception_closure->>'ownerId',exception_closure->>'actorId'),
  'closedAt',exception_closure->>'closedAt',
  'operationId',COALESCE(exception_closure->>'operationId',gen_random_uuid()::text),
  'fingerprint',COALESCE(exception_closure->>'fingerprint',encode(sha256(convert_to(exception_closure::text,'UTF8')),'hex')),
  'release',COALESCE(exception_closure->'release',release_state->'release','null'::jsonb),
  'revision',COALESCE((exception_closure->>'revision')::integer,GREATEST(agreement_revision,1)))
 WHERE exception_closure IS NOT NULL;
CREATE OR REPLACE FUNCTION public.valid_agreement_exception(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF NOT public.agreement_has_keys(value,ARRAY['version','kind','reasonCode','reason','actorId','ownerId','closedAt','operationId','fingerprint','release','revision']) THEN RETURN false; END IF;
 RETURN COALESCE(value->'version'='1'::jsonb AND value->>'kind'='exception' AND value->>'reasonCode' IN ('rolled_back','cannot_measure','other')
  AND jsonb_typeof(value->'reason')='string' AND (value->>'reasonCode'<>'other' OR length(trim(value->>'reason'))>0)
  AND jsonb_typeof(value->'actorId')='string' AND length(value->>'actorId')>0
  AND jsonb_typeof(value->'ownerId')='string' AND length(value->>'ownerId')>0
  AND length(value->>'fingerprint')=64 AND (value->>'operationId')::uuid IS NOT NULL
  AND (value->>'closedAt')::timestamptz IS NOT NULL AND public.valid_release_fact(value->'release')
  AND jsonb_typeof(value->'revision')='number' AND (value->>'revision')::integer>=1,false);
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.requests
 ADD CONSTRAINT requests_exception_closure_check CHECK(public.valid_agreement_exception(exception_closure)),
 ADD CONSTRAINT requests_exception_after_pickup CHECK(exception_closure IS NULL OR status<>'open');
-- Closed never reopens; Superseded no longer exists.
CREATE OR REPLACE FUNCTION public.protect_request_closure() RETURNS trigger LANGUAGE plpgsql AS $$
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
 IF NEW.agreement_revision <> OLD.agreement_revision + (CASE WHEN NEW.closure_corrections IS DISTINCT FROM OLD.closure_corrections OR NEW.release_state IS DISTINCT FROM OLD.release_state THEN 1 ELSE 0 END)
  OR (NEW.closure_corrections IS DISTINCT FROM OLD.closure_corrections AND NEW.release_state IS DISTINCT FROM OLD.release_state) THEN RAISE EXCEPTION 'Closed Request is immutable'; END IF;
 RETURN NEW;
END $$;
ALTER TABLE public.requests ENABLE TRIGGER protect_request_closure;

-- 2. Reviewers replace the three seats. Drop the form, snapshot, concerns and replacement links.
DROP TRIGGER protect_agreement_snapshot ON public.request_agreements;
DROP TRIGGER protect_agreement_events ON public.request_agreement_events;
DROP FUNCTION public.protect_agreement_history();
DROP TABLE public.request_replacements;
ALTER TABLE public.request_agreements DROP COLUMN prepared, DROP COLUMN snapshot, DROP COLUMN submitted_by,
 DROP COLUMN submitted_at, DROP COLUMN concerns, ADD COLUMN reviewers jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Each named seat becomes a reviewer and keeps its answer. The requester no longer reviews their own Request.
-- Seats never had to be different people before submission, so one person becomes one reviewer: their
-- answered seat if they have one, otherwise their first seat. Order follows PM, Designer, Developer.
UPDATE public.request_agreements a SET reviewers=COALESCE((
 SELECT jsonb_agg(jsonb_build_object(
   'id',gen_random_uuid(),'nominee',s.value->'nominee','displayNameAtSelection',s.value->'displayNameAtSelection',
   'addedBy',r.created_by,'note','',
   'decision',CASE s.value->'decision'->>'kind'
     WHEN 'agree' THEN jsonb_set(s.value->'decision','{kind}','"looks_good"')
     WHEN 'request_changes' THEN jsonb_set(s.value->'decision','{kind}','"concern"')
     ELSE 'null'::jsonb END) ORDER BY s.first_ord)
 FROM (
  SELECT DISTINCT ON (person) value, min(ord) OVER (PARTITION BY person) AS first_ord
  FROM (
   SELECT e.value, array_position(ARRAY['pm','designer','developer'],e.key) AS ord,
    COALESCE('member:'||(e.value->'nominee'->>'userId'),'invitation:'||(e.value->'nominee'->>'invitationId')) AS person
   FROM jsonb_each(a.seats) e
   WHERE e.value<>'null'::jsonb AND e.value->'nominee'->>'userId' IS DISTINCT FROM r.created_by
  ) seat
  ORDER BY person, (value->'decision'->>'kind' IN ('agree','request_changes')) IS TRUE DESC, ord
 ) s),'[]'::jsonb)
 FROM public.requests r WHERE r.id=a.request_id AND r.org_id=a.org_id;
ALTER TABLE public.request_agreements DROP CONSTRAINT request_agreement_seats_valid, DROP COLUMN seats;
DROP FUNCTION public.valid_agreement_seats(jsonb);
CREATE FUNCTION public.valid_request_reviewers(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; keys text[] := '{}';
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' OR jsonb_array_length(value)>20 THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF NOT public.agreement_has_keys(item,ARRAY['id','nominee','displayNameAtSelection','addedBy','note','decision'])
   OR (item->>'id')::uuid IS NULL OR jsonb_typeof(item->'displayNameAtSelection') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'addedBy') IS DISTINCT FROM 'string' OR COALESCE(length(item->>'addedBy'),0)=0
   OR jsonb_typeof(item->'note') IS DISTINCT FROM 'string' OR length(item->>'note')>500 THEN RETURN false; END IF;
  IF item->'nominee'->>'kind' = 'member' THEN
   IF NOT public.agreement_has_keys(item->'nominee',ARRAY['kind','userId']) OR jsonb_typeof(item->'nominee'->'userId') IS DISTINCT FROM 'string' OR COALESCE(length(item->'nominee'->>'userId'),0)=0 THEN RETURN false; END IF;
   keys := keys || ('member:'||(item->'nominee'->>'userId'));
  ELSIF item->'nominee'->>'kind' = 'invitation' THEN
   IF NOT public.agreement_has_keys(item->'nominee',ARRAY['kind','invitationId','email']) OR COALESCE(length(item->'nominee'->>'invitationId'),0)=0 OR COALESCE(length(item->'nominee'->>'email'),0)=0 OR item->'decision' <> 'null'::jsonb THEN RETURN false; END IF;
   keys := keys || ('invitation:'||(item->'nominee'->>'invitationId'));
  ELSE RETURN false; END IF;
  IF item->'decision' <> 'null'::jsonb THEN
   IF NOT public.agreement_has_keys(item->'decision',ARRAY['kind','actorId','at','reason']) OR jsonb_typeof(item->'decision'->'reason') IS DISTINCT FROM 'string' OR COALESCE(length(item->'decision'->>'at'),0)=0 THEN RETURN false; END IF;
   IF item->'decision'->>'kind' NOT IN ('looks_good','concern') OR item->'decision'->>'actorId' IS DISTINCT FROM item->'nominee'->>'userId' THEN RETURN false; END IF;
   IF item->'decision'->>'kind' = 'concern' AND COALESCE(length(trim(item->'decision'->>'reason')),0)=0 THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN (SELECT count(DISTINCT k) FROM unnest(keys) k)=cardinality(keys);
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.request_agreements ADD CONSTRAINT request_reviewers_valid CHECK(public.valid_request_reviewers(reviewers));
-- Old event kinds stay valid so existing history remains readable.
ALTER TABLE public.request_agreement_events DROP CONSTRAINT request_agreement_events_kind_check,
 ADD CONSTRAINT request_agreement_events_kind_check CHECK(kind IN ('reviewers_added','reviewer_removed','reviewed','follow_up_created',
  'participants_set','prepared','submitted','decided','participant_replaced','invitation_resolved','concern_resolved','correction_added','replacement_created','superseded'));
-- Deleting a Request before pickup takes its reviews and history with it.
ALTER TABLE public.request_agreement_events DROP CONSTRAINT request_agreement_events_org_id_request_id_fkey,
 ADD CONSTRAINT request_agreement_events_org_id_request_id_fkey FOREIGN KEY(org_id,request_id) REFERENCES public.request_agreements(org_id,request_id) ON DELETE CASCADE;
ALTER TABLE public.request_agreements DROP CONSTRAINT request_agreements_org_id_request_id_fkey,
 ADD CONSTRAINT request_agreements_org_id_request_id_fkey FOREIGN KEY(org_id,request_id) REFERENCES public.requests(org_id,id) ON DELETE CASCADE;
CREATE FUNCTION public.protect_agreement_events() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Agreement events are immutable';
END $$;
CREATE TRIGGER protect_agreement_events BEFORE UPDATE ON public.request_agreement_events FOR EACH ROW EXECUTE FUNCTION public.protect_agreement_events();

-- 3. Reviews never block pickup; only a closure stops a Request advancing.
CREATE OR REPLACE FUNCTION public.request_agreement_blocked(request_uuid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT r.exception_closure IS NOT NULL OR r.outcome_closure IS NOT NULL FROM public.requests r WHERE r.id=request_uuid
$$;
REVOKE ALL ON FUNCTION public.valid_agreement_exception(jsonb), public.protect_request_closure(), public.valid_request_reviewers(jsonb),
 public.protect_agreement_events(), public.request_agreement_blocked(uuid) FROM PUBLIC;
COMMIT;

-- #77: what pickup confirms and what the list's concern marker counts: open concerns (who and why) and
-- how many reviews are unanswered. Saved data only, so a departed reviewer's concern may still count
-- (accepted). Null when nothing is outstanding, so unchanged list rows stay equal between responses.
BEGIN;
CREATE FUNCTION public.request_review_state(request_uuid uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN s.unanswered>0 OR s.concerns<>'[]'::jsonb
  THEN jsonb_build_object('concerns',s.concerns,'unanswered',s.unanswered) END
 FROM (SELECT
  COALESCE((SELECT jsonb_agg(jsonb_build_object('name',x.value->>'displayNameAtSelection','reason',x.value->'decision'->>'reason') ORDER BY x.ordinality)
    FROM public.request_agreements a, jsonb_array_elements(a.reviewers) WITH ORDINALITY x
    WHERE a.request_id=request_uuid AND x.value->'decision'->>'kind'='concern'),'[]'::jsonb) AS concerns,
  (SELECT count(*) FROM public.request_agreements a, jsonb_array_elements(a.reviewers) x
    WHERE a.request_id=request_uuid AND x->'decision'='null'::jsonb) AS unanswered) s
$$;
REVOKE ALL ON FUNCTION public.request_review_state(uuid) FROM PUBLIC;
COMMIT;
