-- Tighten INSERT policies for proactive_alerts and morning_briefings.
--
-- Background: both tables previously allowed ANY org member to INSERT
-- (the "system_insert" policies). Now that all user-facing routes that
-- write proactive_alerts use withUserDb (RLS-enforced user sessions),
-- we can tighten these to match actual business rules:
--
--   proactive_alerts  → only leads/admins can insert (nudge feature)
--   morning_briefings → no user-context inserts; the cron route runs
--                       as systemDb (service role), which bypasses RLS
--                       entirely, so WITH CHECK (false) has no effect
--                       on cron — it only blocks accidental user inserts.

DROP POLICY IF EXISTS "proactive_alerts_system_insert" ON public.proactive_alerts;
DROP POLICY IF EXISTS "morning_briefings_system_insert" ON public.morning_briefings;

-- proactive_alerts: only privileged users (lead/admin) may insert
CREATE POLICY "proactive_alerts_privileged_insert"
ON public.proactive_alerts
FOR INSERT
TO public
WITH CHECK (
  public.is_current_org_member(org_id)
  AND public.is_current_org_privileged()
);

-- morning_briefings: no user-context inserts — service role (cron) only
CREATE POLICY "morning_briefings_service_insert"
ON public.morning_briefings
FOR INSERT
TO public
WITH CHECK (false);
