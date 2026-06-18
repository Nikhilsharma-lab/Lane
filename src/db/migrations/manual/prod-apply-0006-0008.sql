-- =========================================================================
-- prod-apply-0006-0008.sql
-- =========================================================================
-- Idempotent re-expression of migrations 0006, 0007, 0008 for manual
-- application in Supabase Studio BEFORE merging PR #1.
--
-- Every statement is guarded — safe to re-run against any current state.
-- Final schema state is identical to running 0006 + 0007 + 0008 once.
--
-- USAGE: paste into Supabase Studio SQL Editor and run.
-- The transaction ensures all-or-nothing: if any statement fails,
-- everything rolls back and the database is unchanged.
-- =========================================================================

BEGIN;

-- =========================================================================
-- FROM 0006: invite_status enum, status column, role conversion, cleanup
-- =========================================================================

-- 1. invite_status enum (guarded: skip if type already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'invite_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE "public"."invite_status"
      AS ENUM('pending', 'accepted', 'revoked', 'expired');
  END IF;
END $$;

-- 2. invites.status column (IF NOT EXISTS — no-op if already present)
ALTER TABLE "invites"
  ADD COLUMN IF NOT EXISTS "status" "invite_status" NOT NULL DEFAULT 'pending';

-- 3. Backfill accepted invites
--    Original: SET status = 'accepted' WHERE accepted_at IS NOT NULL
--    Idempotent: also require status = 'pending' so re-run doesn't
--    overwrite rows that have since been revoked/expired.
UPDATE "invites"
SET "status" = 'accepted'
WHERE "accepted_at" IS NOT NULL
  AND "status" = 'pending';

-- 4. Role column conversion: text -> workspace_role
--    Guard: runs ONLY if the column is still text type.
--    If already workspace_role (conversion completed), entire block is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invites'
      AND column_name = 'role'
      AND udt_name = 'text'
  ) THEN
    -- Drop the old text default before type conversion
    ALTER TABLE "invites" ALTER COLUMN "role" DROP DEFAULT;
    -- Normalize any non-workspace-role values to 'member'
    UPDATE "invites" SET "role" = 'member'
    WHERE "role" NOT IN ('owner', 'admin', 'member');
    -- Convert column type
    ALTER TABLE "invites" ALTER COLUMN "role"
      TYPE "workspace_role" USING "role"::"workspace_role";
    -- Set the new enum default
    ALTER TABLE "invites" ALTER COLUMN "role" SET DEFAULT 'member';
  END IF;
END $$;

-- 5. Drop dead column (already IF EXISTS in original)
ALTER TABLE "invites" DROP COLUMN IF EXISTS "accepted_by";

-- 6. Partial unique index (IF NOT EXISTS — no-op if already present)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_invite_pending_email_org"
  ON "invites" ("org_id", "email")
  WHERE "status" = 'pending';

-- =========================================================================
-- FROM 0007: workspace_members.is_active, updated RLS policies
-- =========================================================================

-- 7. is_active column (IF NOT EXISTS — no-op if already present)
ALTER TABLE "workspace_members"
  ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;

-- 8. Updated is_workspace_admin (now requires is_active = true)
--    CREATE OR REPLACE — inherently idempotent.
CREATE OR REPLACE FUNCTION public.is_workspace_admin(workspace_id_param uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = workspace_id_param
      AND user_id = public.current_app_user_id()
      AND role IN ('owner', 'admin')
      AND is_active = true
  );
$$;

-- 9. Replace old SELECT policy with active-only version
--    Drop both the old name and the new name so re-run is clean.
DROP POLICY IF EXISTS "workspace_members_select_own_workspace" ON public.workspace_members;
DROP POLICY IF EXISTS "workspace_members_select_active" ON public.workspace_members;
CREATE POLICY "workspace_members_select_active"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (workspace_id = public.current_app_org_id() AND is_active = true);

-- 10. Admin UPDATE policy (drop-then-create for idempotency)
DROP POLICY IF EXISTS "workspace_members_update_admin" ON public.workspace_members;
CREATE POLICY "workspace_members_update_admin"
  ON public.workspace_members
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id = public.current_app_org_id()
    AND public.is_workspace_admin(workspace_id)
    AND user_id != public.current_app_user_id()
  )
  WITH CHECK (
    workspace_id = public.current_app_org_id()
    AND public.is_workspace_admin(workspace_id)
  );

-- 11. Drop old DELETE policy (soft-deactivation replaces hard delete)
--    Already IF EXISTS in original.
DROP POLICY IF EXISTS "workspace_members_delete_own_workspace" ON public.workspace_members;

-- =========================================================================
-- FROM 0008: drop dead invite functions
-- =========================================================================

-- 12. Both already IF EXISTS in original.
DROP FUNCTION IF EXISTS public.accept_invite_membership(text, uuid, text, text);
DROP FUNCTION IF EXISTS public.get_invite_context(text);

COMMIT;


-- =========================================================================
-- VERIFICATION QUERIES (read-only)
-- =========================================================================
-- Run AFTER the apply script succeeds. Each query checks one 0006-0008
-- object. Expected results noted inline.
-- Paste and run in a separate Studio SQL Editor tab.
-- =========================================================================

-- V1. invite_status enum exists with 4 values
-- Expected: 4 rows (pending, accepted, revoked, expired)
SELECT t.typname AS enum_name, e.enumlabel AS value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'invite_status'
  AND t.typnamespace = 'public'::regnamespace
ORDER BY e.enumsortorder;

-- V2. invites: status column (invite_status) + role column (workspace_role)
-- Expected: status → udt_name = invite_status, role → udt_name = workspace_role
SELECT column_name, data_type, udt_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invites'
  AND column_name IN ('status', 'role')
ORDER BY column_name;

-- V3. invites.accepted_by column is GONE
-- Expected: 0 rows
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'invites'
  AND column_name = 'accepted_by';

-- V4. Partial unique index exists
-- Expected: 1 row with indexdef containing WHERE status = 'pending'
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'invites'
  AND indexname = 'uq_invite_pending_email_org';

-- V5. workspace_members.is_active column exists
-- Expected: 1 row, udt_name = bool, column_default = true
SELECT column_name, data_type, udt_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'workspace_members'
  AND column_name = 'is_active';

-- V6. workspace_members policies: active + update_admin present, old ones gone
-- Expected: workspace_members_select_active (SELECT),
--           workspace_members_update_admin (UPDATE)
-- NOT expected: workspace_members_select_own_workspace,
--               workspace_members_delete_own_workspace
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'workspace_members'
ORDER BY policyname;

-- V7. Dead functions are gone
-- Expected: 0 rows
SELECT p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p
WHERE p.proname IN ('accept_invite_membership', 'get_invite_context')
  AND p.pronamespace = 'public'::regnamespace;

-- V8. Drizzle migration ledger
-- If this errors with "relation __drizzle_migrations does not exist",
-- that confirms all migrations were always manual (expected).
SELECT * FROM __drizzle_migrations ORDER BY created_at;
