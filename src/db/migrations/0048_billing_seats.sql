-- #215 (spec #195, item 5, Pricing and billing): automatic seat counting.
--  Seats are a workspace's Admins plus Members, at least 3; Guests and Viewers are free. Clerk keeps who is in the
--  workspace and as what; Lane stores no membership. The billing module (src/lib/billing.ts) counts the seats live
--  from Clerk and keeps only the number the payment provider bills now (billed_seats) and when it last compared the
--  two (seats_checked_at), so a paying workspace's seats follow its Clerk memberships: an added seat is charged
--  part-month from that day, a removed one lowers the next bill.
--  New columns are null for existing workspaces; nothing is backfilled (no workspace pays yet).
-- Apply after a verified backup; staging before production.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.workspace_billing
 ADD COLUMN billed_seats integer CHECK (billed_seats >= 3),
 ADD COLUMN seats_checked_at timestamptz;

COMMIT;
