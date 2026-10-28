-- #205 (spec #195, item 2): retire the stored bell reminders.
-- Needs-you items in the Inbox (Record the release 3 days after Done, Result due on the due date) are worked
-- out from Request state each time and never stored, so they clear themselves and never repeat. The lazy
-- writer that stored release_reminder, result_due_soon, result_due and result_overdue rows when the bell was
-- checked is removed in the same change. This migration deletes the rows it left (the Inbox has not shown
-- them since #204), forbids the four types, drops their once-a-day key, and puts back the rule that every
-- notification names who caused it. Postgres cannot drop enum values in place; the values stay in
-- public.notification_type and the check refuses them.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DELETE FROM public.notifications WHERE type IN ('release_reminder','result_due_soon','result_due','result_overdue');

DROP INDEX public.notifications_reminder_once_a_day;
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_actor_check,
  DROP CONSTRAINT notifications_reminder_request_check,
  ADD CONSTRAINT notifications_retired_reminder_check CHECK (type NOT IN ('release_reminder','result_due_soon','result_due','result_overdue')),
  ALTER COLUMN actor_id SET NOT NULL;
COMMIT;
