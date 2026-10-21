BEGIN;
-- Validate these bounded, versioned records without giving JSON authority over identity.
CREATE FUNCTION public.agreement_has_keys(value jsonb, keys text[]) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
 RETURN value ?& keys AND (SELECT count(*) FROM jsonb_object_keys(value)) = cardinality(keys);
END $$;
CREATE FUNCTION public.valid_agreement_exception(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
 IF value IS NULL THEN RETURN true; END IF;
 IF NOT public.agreement_has_keys(value,ARRAY['version','kind','reasonCode','reason','actorId','closedAt','replacementId']) THEN RETURN false; END IF;
 RETURN COALESCE(value->'version'='1'::jsonb AND value->>'kind'='exception' AND value->>'reasonCode'='superseded'
  AND jsonb_typeof(value->'reason')='string' AND length(trim(value->>'reason'))>0
  AND jsonb_typeof(value->'actorId')='string' AND length(value->>'actorId')>0
  AND (value->>'replacementId')::uuid IS NOT NULL AND (value->>'closedAt')::timestamptz IS NOT NULL,false);
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.requests ADD COLUMN agreement_revision integer NOT NULL DEFAULT 0 CHECK (agreement_revision >= 0), ADD COLUMN exception_closure jsonb CHECK(public.valid_agreement_exception(exception_closure)),
  ADD CONSTRAINT requests_org_id_id_unique UNIQUE (org_id,id);
-- Agreement history has its own timestamps. Do not restart the existing Done
-- undo window (which uses requests.updated_at) for agreement-only mutations.
DROP TRIGGER set_updated_at_requests ON public.requests;
CREATE TRIGGER set_updated_at_requests BEFORE UPDATE ON public.requests FOR EACH ROW
 WHEN ((to_jsonb(NEW)-'agreement_revision') IS DISTINCT FROM (to_jsonb(OLD)-'agreement_revision'))
 EXECUTE FUNCTION public.set_updated_at();
CREATE TABLE public.request_agreements (
 request_id uuid PRIMARY KEY, org_id text NOT NULL,
 prepared jsonb NOT NULL CHECK (public.agreement_has_keys(prepared,ARRAY['version','scopeIncluded','scopeExcluded','audience','timing','constraints','feasibility','commitmentKind']) AND prepared->'version'='1'::jsonb AND prepared->>'commitmentKind' IN ('discovery','delivery')),
 snapshot jsonb, submitted_by text, submitted_at timestamptz,
 seats jsonb NOT NULL, concerns jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(concerns)='array'),
 UNIQUE(org_id,request_id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.requests(org_id,id),
 CHECK ((snapshot IS NULL AND submitted_by IS NULL AND submitted_at IS NULL) OR (snapshot IS NOT NULL AND public.agreement_has_keys(snapshot,ARRAY['version','request','prepared','attachmentIds']) AND snapshot->'version'='1'::jsonb AND jsonb_typeof(snapshot->'request')='object' AND jsonb_typeof(snapshot->'prepared')='object' AND jsonb_typeof(snapshot->'attachmentIds')='array' AND submitted_by IS NOT NULL AND submitted_at IS NOT NULL))
);
CREATE INDEX request_agreements_org_idx ON public.request_agreements(org_id);
CREATE FUNCTION public.valid_agreement_seats(value jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE seat jsonb; item record;
BEGIN
 IF NOT public.agreement_has_keys(value,ARRAY['pm','designer','developer']) THEN RETURN false; END IF;
 FOR item IN SELECT * FROM jsonb_each(value) LOOP
  seat := item.value;
  IF seat = 'null'::jsonb THEN CONTINUE; END IF;
  IF NOT public.agreement_has_keys(seat,ARRAY['generation','nominee','decision','displayNameAtSelection']) OR jsonb_typeof(seat->'displayNameAtSelection') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
  IF jsonb_typeof(seat->'generation') IS DISTINCT FROM 'number' OR COALESCE((seat->>'generation')::integer,0) < 1 THEN RETURN false; END IF;
  IF seat->'nominee'->>'kind' = 'member' THEN
   IF NOT public.agreement_has_keys(seat->'nominee',ARRAY['kind','userId']) OR jsonb_typeof(seat->'nominee'->'userId') IS DISTINCT FROM 'string' OR COALESCE(length(seat->'nominee'->>'userId'),0)=0 THEN RETURN false; END IF;
  ELSIF seat->'nominee'->>'kind' = 'invitation' THEN
   IF NOT public.agreement_has_keys(seat->'nominee',ARRAY['kind','invitationId','email']) OR COALESCE(length(seat->'nominee'->>'invitationId'),0)=0 OR COALESCE(length(seat->'nominee'->>'email'),0)=0 OR seat->'decision' <> 'null'::jsonb THEN RETURN false; END IF;
  ELSE RETURN false; END IF;
  IF seat->'decision' <> 'null'::jsonb THEN
   IF NOT public.agreement_has_keys(seat->'decision',ARRAY['kind','actorId','at','reason']) OR jsonb_typeof(seat->'decision'->'reason') IS DISTINCT FROM 'string' OR COALESCE(length(seat->'decision'->>'at'),0)=0 THEN RETURN false; END IF;
   IF seat->'decision'->>'kind' NOT IN ('agree','request_changes','withdraw') OR seat->'decision'->>'kind' IS NULL OR seat->'decision'->>'actorId' IS DISTINCT FROM seat->'nominee'->>'userId' THEN RETURN false; END IF;
   IF seat->'decision'->>'kind' <> 'agree' AND COALESCE(length(trim(seat->'decision'->>'reason')),0)=0 THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $$;
ALTER TABLE public.request_agreements ADD CONSTRAINT request_agreement_seats_valid CHECK(public.valid_agreement_seats(seats));
CREATE TABLE public.request_agreement_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text NOT NULL, request_id uuid NOT NULL,
 revision integer NOT NULL CHECK(revision>0), operation_id uuid NOT NULL, actor_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('prepared','submitted','decided','participant_replaced','invitation_resolved','concern_resolved','correction_added','replacement_created','superseded')),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,request_id) REFERENCES public.request_agreements(org_id,request_id),
 UNIQUE(request_id,revision), UNIQUE(org_id,actor_id,operation_id)
);
CREATE INDEX request_agreement_events_history_idx ON public.request_agreement_events(org_id,request_id,created_at,id);
CREATE TABLE public.request_replacements (
 original_id uuid PRIMARY KEY, replacement_id uuid NOT NULL UNIQUE, org_id text NOT NULL,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL CHECK(length(trim(reason))>0),
 changed_fields jsonb NOT NULL CHECK(jsonb_typeof(changed_fields)='array'), confirmed_by text, confirmed_at timestamptz,
 FOREIGN KEY(org_id,original_id) REFERENCES public.requests(org_id,id), FOREIGN KEY(org_id,replacement_id) REFERENCES public.requests(org_id,id),
 CHECK(original_id<>replacement_id), CHECK((confirmed_by IS NULL)=(confirmed_at IS NULL))
);
CREATE INDEX request_replacements_org_idx ON public.request_replacements(org_id,replacement_id);
CREATE FUNCTION public.protect_agreement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='request_agreement_events' THEN RAISE EXCEPTION 'Agreement events are immutable'; END IF;
 IF TG_TABLE_NAME='request_agreements' THEN
  IF OLD.snapshot IS NOT NULL AND (TG_OP='DELETE' OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at) THEN RAISE EXCEPTION 'Submitted commitment is immutable'; END IF;
 ELSE
  IF OLD.exception_closure IS NOT NULL AND (TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD) THEN RAISE EXCEPTION 'Closed exception is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_agreement_snapshot BEFORE UPDATE OR DELETE ON public.request_agreements FOR EACH ROW EXECUTE FUNCTION public.protect_agreement_history();
CREATE TRIGGER protect_agreement_events BEFORE UPDATE OR DELETE ON public.request_agreement_events FOR EACH ROW EXECUTE FUNCTION public.protect_agreement_history();
CREATE TRIGGER protect_request_exception BEFORE UPDATE OR DELETE ON public.requests FOR EACH ROW EXECUTE FUNCTION public.protect_agreement_history();
ALTER TABLE public.request_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_agreement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_replacements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.request_agreements, public.request_agreement_events, public.request_replacements FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.agreement_has_keys(jsonb,text[]), public.valid_agreement_exception(jsonb), public.valid_agreement_seats(jsonb), public.protect_agreement_history() FROM PUBLIC;
-- A rendering hint only. Server actions additionally verify current Clerk membership.
CREATE FUNCTION public.request_agreement_blocked(request_uuid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT r.exception_closure IS NOT NULL
 OR EXISTS(SELECT 1 FROM public.request_replacements l WHERE l.replacement_id=r.id AND l.confirmed_at IS NULL)
 OR ((r.status='open' OR a.snapshot IS NOT NULL) AND (
 a.snapshot IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(a.concerns) c WHERE c->'resolution'='null'::jsonb)
 OR EXISTS(SELECT 1 FROM jsonb_each(a.seats) s WHERE s.value='null'::jsonb OR s.value->'nominee'->>'kind' IS DISTINCT FROM 'member' OR s.value->'decision'->>'kind' IS DISTINCT FROM 'agree')
 OR (SELECT count(DISTINCT s.value->'nominee'->>'userId') FROM jsonb_each(a.seats) s)<>3
 )) FROM public.requests r LEFT JOIN public.request_agreements a ON a.request_id=r.id AND a.org_id=r.org_id WHERE r.id=request_uuid
$$;
REVOKE ALL ON FUNCTION public.request_agreement_blocked(uuid) FROM PUBLIC;

COMMIT;
