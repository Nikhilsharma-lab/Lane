-- #127 / #131: reminders in the bell, and the times a Request was picked up and marked Done.
-- Reminders reuse notifications (no new table). They have no actor: Lane, not a person, is reminding.
-- New enum values are added outside the transaction so the index and checks below can use them.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'release_reminder';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'result_due_soon';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'result_due';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'result_overdue';
BEGIN;
ALTER TABLE public.notifications ALTER COLUMN actor_id DROP NOT NULL,
 ADD CONSTRAINT notifications_actor_check CHECK(actor_id IS NOT NULL OR type IN ('release_reminder','result_due_soon','result_due','result_overdue')),
 ADD CONSTRAINT notifications_reminder_request_check CHECK(request_id IS NOT NULL OR type NOT IN ('release_reminder','result_due_soon','result_due','result_overdue'));
-- At most one reminder of a kind per Request, recipient and UTC day. A writer inserts with
-- ON CONFLICT DO NOTHING and every bell load can try again safely. timezone('UTC', timestamptz)
-- and the date cast are both immutable, so the day can be indexed without a stored column.
CREATE UNIQUE INDEX notifications_reminder_once_a_day ON public.notifications(request_id, user_id, type, ((created_at AT TIME ZONE 'UTC')::date))
 WHERE type IN ('release_reminder','result_due_soon','result_due','result_overdue');

-- When work was marked Done, for the release reminder. Who marked it is deliberately not kept.
ALTER TABLE public.requests ADD COLUMN done_at timestamptz;
-- Work already Done takes its last update as its Done time. The backfill is not an edit: with the
-- closure guard and the updated_at stamp paused, closed Requests accept it and updated_at keeps its value.
ALTER TABLE public.requests DISABLE TRIGGER protect_request_closure, DISABLE TRIGGER set_updated_at_requests;
UPDATE public.requests SET done_at = updated_at WHERE status = 'done';
ALTER TABLE public.requests ENABLE TRIGGER protect_request_closure, ENABLE TRIGGER set_updated_at_requests;
ALTER TABLE public.requests ADD CONSTRAINT requests_done_at_check CHECK((status = 'done') = (done_at IS NOT NULL));
-- Every path into Done stamps the time (single, bulk, or a row written as Done); every path out
-- (Undo Done) clears it. Saving a Done Request as Done again keeps the first time.
CREATE FUNCTION public.stamp_done_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.status <> 'done' THEN NEW.done_at := NULL;
 ELSIF NEW.status = 'done' AND (TG_OP = 'INSERT' OR OLD.status <> 'done') THEN NEW.done_at := COALESCE(NEW.done_at, now());
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_done_at() FROM PUBLIC;
CREATE TRIGGER stamp_done_at BEFORE INSERT OR UPDATE OF status ON public.requests FOR EACH ROW EXECUTE FUNCTION public.stamp_done_at();

-- When work was picked up, for the timeline's In progress step. Who picked it up is the assignee; no
-- other "who" is kept. Work picked up before this migration has no known time and stays NULL (no backfill).
ALTER TABLE public.requests ADD COLUMN picked_up_at timestamptz;
ALTER TABLE public.requests ADD CONSTRAINT requests_picked_up_at_check CHECK(status <> 'open' OR picked_up_at IS NULL);
-- Moving from Open into In progress (or a row written as In progress) stamps the time; going back to
-- Open clears it; Done and Undo Done keep it.
CREATE FUNCTION public.stamp_picked_up_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status = 'open' THEN NEW.picked_up_at := NULL;
 ELSIF NEW.status = 'in_progress' AND (TG_OP = 'INSERT' OR OLD.status = 'open') THEN NEW.picked_up_at := COALESCE(NEW.picked_up_at, now());
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stamp_picked_up_at() FROM PUBLIC;
CREATE TRIGGER stamp_picked_up_at BEFORE INSERT OR UPDATE OF status ON public.requests FOR EACH ROW EXECUTE FUNCTION public.stamp_picked_up_at();
COMMIT;
