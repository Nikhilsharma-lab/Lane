-- Evidence-rich Intake v0: optional context stays on the Request and private
-- file metadata stays in Lane-owned tables. Storage objects live in the
-- private `request-attachments` bucket, which is configured through the
-- Supabase Storage API rather than by writing to the internal storage schema.

ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS affected_people text,
  ADD COLUMN IF NOT EXISTS desired_change text,
  ADD COLUMN IF NOT EXISTS observed_evidence text,
  ADD COLUMN IF NOT EXISTS uncertainty text,
  ADD COLUMN IF NOT EXISTS useful_link text;

CREATE TABLE IF NOT EXISTS public.request_attachments (
  id            uuid PRIMARY KEY,
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id    uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  uploaded_by   uuid NOT NULL REFERENCES public.profiles(id),
  storage_path  text NOT NULL,
  file_name     text NOT NULL,
  mime_type     text NOT NULL,
  size_bytes    integer NOT NULL,
  uploaded_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT request_attachments_size_check
    CHECK (size_bytes > 0 AND size_bytes <= 10485760)
);

CREATE UNIQUE INDEX IF NOT EXISTS request_attachments_storage_path_unique
  ON public.request_attachments (storage_path);
CREATE INDEX IF NOT EXISTS request_attachments_request_id_idx
  ON public.request_attachments (request_id);
CREATE INDEX IF NOT EXISTS request_attachments_org_id_idx
  ON public.request_attachments (org_id);

-- There is intentionally no direct-client policy. Lane reads and mutates
-- attachment metadata through guarded server actions. Browser uploads use
-- one-time signed upload URLs; downloads use short-lived signed URLs.
ALTER TABLE public.request_attachments ENABLE ROW LEVEL SECURITY;
