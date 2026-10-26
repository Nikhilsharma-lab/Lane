-- #212 (spec #195, item 4, Roles): Guest submissions taken on by a Member.
--  A Guest files a Request without a prediction. It is saved with guest_submission = true and waits, Open, until a
--  Member (or Admin) takes it on. Taking it on records who (taken_on_by) and when (taken_on_at), once; that person
--  becomes the Requester (the Requester is the release record's owner after a handover, else taken_on_by, else
--  created_by). created_by stays the Guest, who keeps seeing and commenting on their own submission.
--  - guest_submission is set only when the Request is filed and never changes.
--  - A waiting Guest submission stays Open: nobody picks it up before someone takes it on.
--  - Taking on happens once, by someone other than the Guest, and is never undone or moved.
--  Existing rows get guest_submission = false and are unchanged.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.requests
 ADD COLUMN guest_submission boolean NOT NULL DEFAULT false,
 ADD COLUMN taken_on_by text REFERENCES public.profiles(id),
 ADD COLUMN taken_on_at timestamptz,
 ADD CONSTRAINT requests_taken_on_check CHECK (
  (taken_on_by IS NULL) = (taken_on_at IS NULL)
  AND (taken_on_by IS NULL OR (guest_submission AND taken_on_by <> created_by))),
 ADD CONSTRAINT requests_guest_submission_waiting_check CHECK (
  NOT guest_submission OR taken_on_by IS NOT NULL OR status = 'open');

-- Members look for the waiting ones.
CREATE INDEX requests_guest_waiting_idx ON public.requests (org_id) WHERE guest_submission AND taken_on_by IS NULL;

CREATE FUNCTION public.protect_guest_submission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.guest_submission IS DISTINCT FROM OLD.guest_submission THEN RAISE EXCEPTION 'Guest submission is immutable'; END IF;
 IF OLD.taken_on_by IS NOT NULL AND (NEW.taken_on_by IS DISTINCT FROM OLD.taken_on_by OR NEW.taken_on_at IS DISTINCT FROM OLD.taken_on_at) THEN
  RAISE EXCEPTION 'Taking on a Guest submission is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_guest_submission BEFORE UPDATE OF guest_submission, taken_on_by, taken_on_at ON public.requests
 FOR EACH ROW EXECUTE FUNCTION public.protect_guest_submission();
REVOKE ALL ON FUNCTION public.protect_guest_submission() FROM PUBLIC;

COMMIT;
