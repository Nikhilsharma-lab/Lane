-- Request priority is a triage signal shown on the Requests row. It is not a
-- lifecycle state, grants nothing and ranks no person.
-- Apply only after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TYPE public.request_priority AS ENUM ('none', 'urgent', 'high', 'medium', 'low');

ALTER TABLE public.requests
  ADD COLUMN priority public.request_priority NOT NULL DEFAULT 'none';

-- Reads use the existing Request org index. No new grant or RLS policy is
-- needed; actor authorization remains in the Clerk-backed guards.
COMMIT;
