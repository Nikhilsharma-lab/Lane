-- #211 (spec #195, item 4): only paid seats can review.
-- Every Reviewer is an accountable teammate: an Admin or Member of the workspace. Email-address Reviewers
-- (a pending Clerk invitation named as a Reviewer, nominee kind 'invitation') are retired. The ones saved so
-- far are test data, so this removes them from every Reviewers list, keeping each member Reviewer, its order
-- and its answer. The Reviewers check then accepts member Reviewers only. Requests are not touched (no
-- revision bump), and the append-only request_agreement_events history keeps what it recorded.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

UPDATE public.request_agreements a
SET reviewers = COALESCE((
  SELECT jsonb_agg(r.item ORDER BY r.ord)
  FROM jsonb_array_elements(a.reviewers) WITH ORDINALITY AS r(item, ord)
  WHERE r.item->'nominee'->>'kind' = 'member'
), '[]'::jsonb)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements(a.reviewers) AS r(item)
  WHERE r.item->'nominee'->>'kind' IS DISTINCT FROM 'member'
);

-- Same rules as 0031, without the invitation nominee.
CREATE OR REPLACE FUNCTION public.valid_request_reviewers(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE item jsonb; keys text[] := '{}';
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'array' OR jsonb_array_length(value)>20 THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(value) LOOP
  IF NOT public.agreement_has_keys(item,ARRAY['id','nominee','displayNameAtSelection','addedBy','note','decision'])
   OR (item->>'id')::uuid IS NULL OR jsonb_typeof(item->'displayNameAtSelection') IS DISTINCT FROM 'string'
   OR jsonb_typeof(item->'addedBy') IS DISTINCT FROM 'string' OR COALESCE(length(item->>'addedBy'),0)=0
   OR jsonb_typeof(item->'note') IS DISTINCT FROM 'string' OR length(item->>'note')>500 THEN RETURN false; END IF;
  IF item->'nominee'->>'kind' IS DISTINCT FROM 'member'
   OR NOT public.agreement_has_keys(item->'nominee',ARRAY['kind','userId']) OR jsonb_typeof(item->'nominee'->'userId') IS DISTINCT FROM 'string'
   OR COALESCE(length(item->'nominee'->>'userId'),0)=0 THEN RETURN false; END IF;
  keys := keys || ('member:'||(item->'nominee'->>'userId'));
  IF item->'decision' <> 'null'::jsonb THEN
   IF NOT public.agreement_has_keys(item->'decision',ARRAY['kind','actorId','at','reason']) OR jsonb_typeof(item->'decision'->'reason') IS DISTINCT FROM 'string' OR COALESCE(length(item->'decision'->>'at'),0)=0 THEN RETURN false; END IF;
   IF item->'decision'->>'kind' NOT IN ('looks_good','concern') OR item->'decision'->>'actorId' IS DISTINCT FROM item->'nominee'->>'userId' THEN RETURN false; END IF;
   IF item->'decision'->>'kind' = 'concern' AND COALESCE(length(trim(item->'decision'->>'reason')),0)=0 THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN (SELECT count(DISTINCT k) FROM unnest(keys) k)=cardinality(keys);
EXCEPTION WHEN others THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.valid_request_reviewers(jsonb) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.valid_request_reviewers(jsonb) FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.valid_request_reviewers(jsonb) FROM authenticated;
  END IF;
END $$;
-- Replacing the function does not recheck saved rows, so check them here and stop if any still fails.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.request_agreements WHERE NOT public.valid_request_reviewers(reviewers)) THEN
    RAISE EXCEPTION 'A saved Reviewers list still names someone who is not a member';
  END IF;
END $$;
COMMIT;
