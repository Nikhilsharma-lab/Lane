-- #206 (spec #195, item 2): Needs-you items reach people outside Lane, once per item.
-- delivery_preferences: each person's choice per workspace. No row means Email (the default); Off sends
-- nothing except Result due; Slack DM is offered only once Slack is connected (#207), and falls back to Email
-- while it is not. delivery_log: each person, item (the Inbox read model's per-occurrence key) and time it went
-- out, unique per person and item, so an item is sent at most once however often delivery runs. `outcome` is
-- 'would_send' while the Email switch is off (the recording stand-in sends nothing) and 'sent' once it is on.
-- The log names no profile on purpose: a Reviewer picked from the live Clerk roster may not have opened Lane yet.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE public.delivery_preferences (
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel text NOT NULL CONSTRAINT delivery_preferences_channel_check CHECK (channel IN ('email', 'slack', 'off')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX delivery_preferences_user_idx ON public.delivery_preferences (user_id);

CREATE TABLE public.delivery_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  request_id uuid NOT NULL,
  item_key text NOT NULL CONSTRAINT delivery_log_item_key_check CHECK (char_length(item_key) BETWEEN 1 AND 300),
  channel text NOT NULL CONSTRAINT delivery_log_channel_check CHECK (channel IN ('email', 'slack')),
  outcome text NOT NULL CONSTRAINT delivery_log_outcome_check CHECK (outcome IN ('sent', 'would_send')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_log_once UNIQUE (org_id, user_id, item_key),
  CONSTRAINT delivery_log_request_fk FOREIGN KEY (org_id, request_id) REFERENCES public.requests(org_id, id) ON DELETE CASCADE
);
CREATE INDEX delivery_log_request_idx ON public.delivery_log (org_id, request_id);

-- A recorded delivery is never rewritten. Deleting is allowed: a send that failed releases its row so a later
-- run can try again, and the Request's or workspace's cascade clears it.
CREATE FUNCTION public.protect_delivery_log() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'delivery_log rows are immutable' USING ERRCODE = '55000';
END $$;
CREATE TRIGGER protect_delivery_log BEFORE UPDATE ON public.delivery_log
 FOR EACH ROW EXECUTE FUNCTION public.protect_delivery_log();

ALTER TABLE public.delivery_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.delivery_preferences, public.delivery_log FROM PUBLIC;
-- Guarded like 0028: Supabase has these roles, a plain Postgres (CI, fresh local) does not.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.delivery_preferences, public.delivery_log FROM anon; END IF;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.delivery_preferences, public.delivery_log FROM authenticated; END IF;
END $$;
REVOKE ALL ON FUNCTION public.protect_delivery_log() FROM PUBLIC;

COMMIT;
