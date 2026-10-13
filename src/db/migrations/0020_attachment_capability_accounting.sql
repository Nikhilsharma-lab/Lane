-- Keep cancelled signed-upload capabilities accounted for. A private zero-byte
-- object occupies a cancelled path so an already-started non-upsert upload
-- cannot recreate payload data after quota is released. These rows/objects are
-- retained as cancellation records, not exposed as Request attachments.
-- Apply after a verified backup, staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.request_attachments
  ADD COLUMN upload_expires_at timestamptz,
  ADD COLUMN discarded_at timestamptz,
  ADD COLUMN upload_blocked_at timestamptz,
  ADD CONSTRAINT request_attachments_discard_state_check CHECK (
    (discarded_at IS NULL OR uploaded_at IS NULL)
    AND (upload_blocked_at IS NULL OR discarded_at IS NOT NULL)
  );

-- Old issued URLs last two hours. Start the retirement window at migration
-- time rather than deriving it from reservation creation, which predates signing.
UPDATE public.request_attachments
SET upload_expires_at = now() + interval '2 hours'
WHERE uploaded_at IS NULL;

-- No grant, RLS, table or background-job changes.
COMMIT;
