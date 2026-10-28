-- #213 (spec #195, item 5, Pricing and billing): Free Requests.
--  Each new workspace gets 4 Free Requests. The billing module (src/lib/billing.ts) reads the count; the database keeps
--  it, so no way of creating a Request can skip it:
--  - every Request created in the workspace counts, and a deleted Request stays counted (the count never goes down);
--  - a Guest submission counts once it is taken on (taken_on_at is set once, by 0045), not when it is filed.
--  The allowance belongs to the company email domain of the workspace's creator, or for a personal email domain
--  (such as gmail.com) to that one email address. The first workspace to claim an allowance holds it; a later
--  workspace with the same domain or address is told the Free Requests were already used. A workspace's allowance
--  decision is made once.
--  plan_state is the billing module's own (free, paying, lapsed); nothing sets it yet (#214 adds payment).
--  Backfill: every existing workspace's count is its Request counter (organizations.last_request_number, which already
--  includes deleted Requests) less its Guest submissions still waiting. Allowances are decided later, by the app.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.workspace_billing (
 org_id text PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
 plan_state text NOT NULL DEFAULT 'free' CHECK (plan_state IN ('free', 'paying', 'lapsed')),
 free_requests_used integer NOT NULL DEFAULT 0 CHECK (free_requests_used >= 0),
 -- The allowance this workspace claimed (null until decided), and whether it holds it.
 allowance_key text,
 holds_allowance boolean,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT workspace_billing_allowance_check CHECK ((allowance_key IS NULL) = (holds_allowance IS NULL))
);

CREATE TABLE public.free_request_allowances (
 allowance_key text PRIMARY KEY,
 kind text NOT NULL CHECK (kind IN ('company_domain', 'personal_email')),
 org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 claimed_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT free_request_allowances_key_check CHECK (
  allowance_key = lower(allowance_key)
  AND char_length(allowance_key) <= 320
  AND CASE kind
   WHEN 'company_domain' THEN allowance_key ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
   ELSE allowance_key ~ '^[^@[:space:]]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  END)
);
CREATE INDEX free_request_allowances_org_idx ON public.free_request_allowances (org_id);

CREATE TRIGGER set_updated_at_workspace_billing BEFORE UPDATE ON public.workspace_billing
 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The count never goes down, and the allowance decision is made once.
CREATE FUNCTION public.protect_workspace_billing() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.free_requests_used < OLD.free_requests_used THEN
  RAISE EXCEPTION 'Free Requests used can never go down' USING ERRCODE = '23514';
 END IF;
 IF OLD.holds_allowance IS NOT NULL AND (NEW.holds_allowance IS DISTINCT FROM OLD.holds_allowance OR NEW.allowance_key IS DISTINCT FROM OLD.allowance_key) THEN
  RAISE EXCEPTION 'A workspace''s Free Requests allowance is decided once';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_workspace_billing BEFORE UPDATE ON public.workspace_billing
 FOR EACH ROW EXECUTE FUNCTION public.protect_workspace_billing();

-- One more Request counted for the workspace, in the same write as the Request.
CREATE FUNCTION public.count_free_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO public.workspace_billing AS billing (org_id, free_requests_used) VALUES (NEW.org_id, 1)
 ON CONFLICT (org_id) DO UPDATE SET free_requests_used = billing.free_requests_used + 1;
 RETURN NULL;
END $$;
CREATE TRIGGER count_free_request_created AFTER INSERT ON public.requests
 FOR EACH ROW WHEN (NOT NEW.guest_submission) EXECUTE FUNCTION public.count_free_request();
CREATE TRIGGER count_free_request_taken_on AFTER UPDATE OF taken_on_at ON public.requests
 FOR EACH ROW WHEN (OLD.taken_on_at IS NULL AND NEW.taken_on_at IS NOT NULL) EXECUTE FUNCTION public.count_free_request();

INSERT INTO public.workspace_billing (org_id, free_requests_used)
SELECT organization.id, GREATEST(organization.last_request_number - (
  SELECT count(*) FROM public.requests AS request
  WHERE request.org_id = organization.id AND request.guest_submission AND request.taken_on_at IS NULL
 ), 0)
FROM public.organizations AS organization;

ALTER TABLE public.workspace_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.free_request_allowances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_billing, public.free_request_allowances FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.workspace_billing, public.free_request_allowances FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.workspace_billing, public.free_request_allowances FROM authenticated; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_workspace_billing(), public.count_free_request() FROM PUBLIC;

COMMIT;
