-- Drop broken SQL functions that are no longer used.
-- accept_invite_membership references a dropped "accepted_by" column and has a wrong role cast.
-- get_invite_context doesn't return the "status" column needed by the accept flow.
-- Both are bypassed: the accept flow now uses Drizzle directly.

DROP FUNCTION IF EXISTS public.accept_invite_membership(text, uuid, text, text);
DROP FUNCTION IF EXISTS public.get_invite_context(text);
