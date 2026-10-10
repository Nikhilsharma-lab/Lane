-- Design feedback lives with its Request. This adds no lifecycle or alignment states.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'review_requested';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'review_responded';

ALTER TABLE public.requests
  ADD COLUMN design_reviews jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN design_review_version integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT requests_design_reviews_check CHECK (jsonb_typeof(design_reviews) = 'array'),
  ADD CONSTRAINT requests_design_review_version_check CHECK (design_review_version >= 0);

-- Reads use the existing Request ID/org indexes. No JSON containment query or
-- new grant/RLS policy is needed. Actor/recipient authorization remains in Clerk.
COMMIT;
