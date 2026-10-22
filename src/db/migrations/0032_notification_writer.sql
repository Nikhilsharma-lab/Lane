-- One writer for every in-app notification (architecture review A3, 2026-10-22).
-- Comments, pickup and Mark Done, reviewer requests and answers, and review resets each inserted their own
-- rows, and only two of the five checked that the recipient still has a profile. public.notify is called
-- inside the statement or transaction that makes the change, so a notification and its change commit or
-- fail together (decision 8.17). It never notifies the actor, a null recipient, the same person twice, or
-- anyone without a profile, and writes nothing when the actor has none.
BEGIN;
CREATE FUNCTION public.notify(recipients text[], org text, kind public.notification_type, request uuid, actor text, detail text DEFAULT NULL)
RETURNS integer LANGUAGE sql VOLATILE AS $$
  WITH sent AS (
    INSERT INTO public.notifications(user_id, org_id, type, request_id, actor_id, detail)
    SELECT DISTINCT recipient, org, kind, request, actor, NULLIF(detail, '')
    FROM unnest(recipients) AS recipient
    WHERE recipient IS NOT NULL AND recipient <> actor
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = recipient)
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = actor)
    RETURNING 1
  )
  SELECT count(*)::integer FROM sent
$$;
REVOKE ALL ON FUNCTION public.notify(text[], text, public.notification_type, uuid, text, text) FROM PUBLIC;

-- Unchanged from 0031 except that the reset notification goes through public.notify.
CREATE OR REPLACE FUNCTION public.reset_reviews_on_edit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text := COALESCE(NULLIF(current_setting('lane.actor_id',true),''),NEW.created_by);
BEGIN
 IF EXISTS(SELECT 1 FROM public.request_agreements a, jsonb_array_elements(a.reviewers) x
   WHERE a.request_id=NEW.id AND a.org_id=NEW.org_id AND x->'decision'<>'null'::jsonb) THEN
  PERFORM public.notify(ARRAY(
    SELECT x->'nominee'->>'userId' FROM public.request_agreements a, jsonb_array_elements(a.reviewers) x
    WHERE a.request_id=NEW.id AND a.org_id=NEW.org_id AND x->'decision'<>'null'::jsonb
   ), NEW.org_id, 'review_reset', NEW.id, actor);
  UPDATE public.request_agreements a SET reviewers=(SELECT jsonb_agg(jsonb_set(x,'{decision}','null'::jsonb) ORDER BY i) FROM jsonb_array_elements(a.reviewers) WITH ORDINALITY t(x,i))
   WHERE a.request_id=NEW.id AND a.org_id=NEW.org_id;
  NEW.agreement_revision := OLD.agreement_revision + 1;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.reset_reviews_on_edit() FROM PUBLIC;
COMMIT;
