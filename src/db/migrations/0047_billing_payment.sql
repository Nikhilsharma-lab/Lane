-- #214 (spec #195, item 5, Pricing and billing): paying for Lane, and the founding discount.
--  The billing module (src/lib/billing.ts) records what the payment provider reports: the workspace's provider customer
--  and subscription, its billing period (yearly or monthly) and when it first paid. Paying sets plan_state to paying.
--  Founding discount: the first 50 paying workspaces get 40% off for two years. A workspace holds one of the 50 places
--  while its checkout with the discount is open (founding_reserved_until) and for good once it pays with it
--  (founding_starts_at, set once; the two years run from then). An expired reservation frees its place. The database
--  refuses a 51st place, under one lock, so two checkouts can't both take the last one.
--  New columns are all null for existing workspaces; nothing is backfilled.
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.workspace_billing
 ADD COLUMN billing_period text CHECK (billing_period IN ('yearly', 'monthly')),
 ADD COLUMN provider_customer_id text CHECK (char_length(provider_customer_id) <= 255),
 ADD COLUMN provider_subscription_id text CHECK (char_length(provider_subscription_id) <= 255),
 ADD COLUMN paying_since timestamptz,
 ADD COLUMN founding_starts_at timestamptz,
 ADD COLUMN founding_reserved_until timestamptz;

CREATE UNIQUE INDEX workspace_billing_provider_subscription_idx ON public.workspace_billing (provider_subscription_id)
 WHERE provider_subscription_id IS NOT NULL;

CREATE FUNCTION public.protect_founding_places() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE taken integer;
BEGIN
 IF TG_OP = 'UPDATE' AND OLD.founding_starts_at IS NOT NULL AND NEW.founding_starts_at IS DISTINCT FROM OLD.founding_starts_at THEN
  RAISE EXCEPTION 'A workspace''s founding discount starts once';
 END IF;
 IF NEW.founding_starts_at IS NULL AND (NEW.founding_reserved_until IS NULL OR NEW.founding_reserved_until <= now()) THEN
  RETURN NEW;
 END IF;
 IF TG_OP = 'UPDATE' AND (OLD.founding_starts_at IS NOT NULL OR OLD.founding_reserved_until > now()) THEN
  RETURN NEW;
 END IF;
 -- The same lock the billing module takes before it offers a place.
 PERFORM pg_advisory_xact_lock(hashtext('lane_founding_places'));
 SELECT count(*) INTO taken FROM public.workspace_billing
  WHERE org_id <> NEW.org_id AND (founding_starts_at IS NOT NULL OR founding_reserved_until > now());
 IF taken >= 50 THEN
  RAISE EXCEPTION 'The founding discount is for the first 50 paying workspaces' USING ERRCODE = '23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_founding_places BEFORE INSERT OR UPDATE OF founding_starts_at, founding_reserved_until ON public.workspace_billing
 FOR EACH ROW EXECUTE FUNCTION public.protect_founding_places();

REVOKE ALL ON FUNCTION public.protect_founding_places() FROM PUBLIC;

COMMIT;
