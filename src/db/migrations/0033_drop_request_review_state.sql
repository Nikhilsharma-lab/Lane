-- The list and detail loaders work out review state in the app since 2026-10-22 (#111), so a reviewer who
-- left the workspace no longer counts (REQUIREMENTS §4.4); the database cannot see who left. Nothing calls
-- request_review_state any more. The two notification_type values nothing writes stay: PostgreSQL cannot drop
-- an enum value without rebuilding the type.
BEGIN;
DROP FUNCTION public.request_review_state(uuid);
COMMIT;
