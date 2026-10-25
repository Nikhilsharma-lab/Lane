-- #216 (spec #195, item 5, Pricing and billing): billing settings and lapsed plans.
--  The payment provider tells Lane when a workspace's plan changes: its billing period, a cancellation that runs to
--  the end of the period (plan_ends_at, shown in Settings → Billing), an unpaid or paused plan (plan_state lapsed) and a
--  plan that has ended (lapsed, and the subscription is no longer the workspace's). subscription_changed_at is when the
--  provider made the last change Lane recorded, so an older change arriving late can't undo a newer one.
--  A lapsed plan blocks only creating new Requests (and taking on Guest submissions); nothing is deleted.
--  New columns are null for existing workspaces; nothing is backfilled.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.workspace_billing
 ADD COLUMN subscription_changed_at timestamptz,
 ADD COLUMN plan_ends_at timestamptz,
 ADD CONSTRAINT workspace_billing_plan_ends_check CHECK (plan_ends_at IS NULL OR plan_state = 'paying');

COMMIT;
