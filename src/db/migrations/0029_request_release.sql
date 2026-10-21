BEGIN;
CREATE FUNCTION public.valid_release_fact(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF value='null'::jsonb THEN RETURN true; END IF;
 IF NOT public.agreement_has_keys(value,ARRAY['exposureDate','audience','evidence','dueDate','startDate','windowKind']) THEN RETURN false; END IF;
 RETURN COALESCE(value->>'windowKind' IN ('fixed','relative')
  AND length(trim(value->>'audience'))>0 AND length(trim(value->>'evidence'))>0
  AND to_char((value->>'exposureDate')::date,'YYYY-MM-DD')=value->>'exposureDate'
  AND to_char((value->>'dueDate')::date,'YYYY-MM-DD')=value->>'dueDate'
  AND to_char((value->>'startDate')::date,'YYYY-MM-DD')=value->>'startDate',false);
EXCEPTION WHEN others THEN RETURN false;
END $$;
CREATE FUNCTION public.valid_release_state(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE event jsonb; last_event jsonb;
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF NOT public.agreement_has_keys(value,ARRAY['version','ownerId','release','history']) THEN RETURN false; END IF;
 IF value->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(value->'ownerId') IS DISTINCT FROM 'string'
  OR COALESCE(length(value->>'ownerId'),0)=0 OR jsonb_typeof(value->'history') IS DISTINCT FROM 'array'
  OR NOT public.valid_release_fact(value->'release') THEN RETURN false; END IF;
 IF jsonb_array_length(value->'history')<1 THEN RETURN false; END IF;
 FOR event IN SELECT * FROM jsonb_array_elements(value->'history') LOOP
  IF NOT public.agreement_has_keys(event,ARRAY['operationId','fingerprint','actorId','at','input','previousRelease','release','previousOwnerId','ownerId','revision']) THEN RETURN false; END IF;
  IF COALESCE(length(event->>'actorId'),0)=0 OR COALESCE(length(event->>'fingerprint'),0)<>64
   OR COALESCE(length(event->>'ownerId'),0)=0 OR COALESCE(length(event->>'previousOwnerId'),0)=0
   OR (event->>'operationId')::uuid IS NULL OR (event->>'at')::timestamptz IS NULL
   OR COALESCE((event->>'revision')::integer,0)<1
   OR NOT public.valid_release_fact(event->'release') OR NOT public.valid_release_fact(event->'previousRelease')
   OR COALESCE(event->'input'->>'kind','') NOT IN ('release','correct','void','transfer') THEN RETURN false; END IF;
 END LOOP;
 last_event := value->'history'->-1;
 RETURN last_event->'release'=value->'release' AND last_event->>'ownerId'=value->>'ownerId';
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.requests ADD COLUMN release_state jsonb CHECK(public.valid_release_state(release_state));
REVOKE ALL ON FUNCTION public.valid_release_fact(jsonb), public.valid_release_state(jsonb) FROM PUBLIC;
CREATE FUNCTION public.protect_release_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
 IF OLD.release_state IS NOT NULL THEN
  IF TG_OP='DELETE' OR NEW.release_state IS NULL THEN RAISE EXCEPTION 'Release history is immutable'; END IF;
  n := jsonb_array_length(OLD.release_state->'history');
  IF EXISTS(SELECT 1 FROM generate_series(0,n-1) i WHERE NEW.release_state->'history'->i IS DISTINCT FROM OLD.release_state->'history'->i)
   OR jsonb_array_length(NEW.release_state->'history')<n THEN RAISE EXCEPTION 'Release history is immutable'; END IF;
  IF NEW.release_state IS DISTINCT FROM OLD.release_state AND jsonb_array_length(NEW.release_state->'history')<>n+1 THEN RAISE EXCEPTION 'Release changes require an appended event'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND NEW.release_state->'release' IS NOT NULL AND NEW.release_state->'release'<>'null'::jsonb AND NEW.status<>'done' THEN RAISE EXCEPTION 'Released work must remain Done'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_request_release BEFORE UPDATE OR DELETE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.protect_release_history();
REVOKE ALL ON FUNCTION public.protect_release_history() FROM PUBLIC;
DROP TRIGGER set_updated_at_requests ON public.requests;
CREATE TRIGGER set_updated_at_requests BEFORE UPDATE ON public.requests FOR EACH ROW
 WHEN ((to_jsonb(NEW)-'agreement_revision'-'release_state') IS DISTINCT FROM (to_jsonb(OLD)-'agreement_revision'-'release_state'))
 EXECUTE FUNCTION public.set_updated_at();
COMMIT;
