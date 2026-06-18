-- Member management: is_active column + RLS policy updates
-- Soft-deactivation pattern: removed members keep their row with is_active = false

ALTER TABLE "workspace_members" ADD COLUMN "is_active" boolean NOT NULL DEFAULT true;

-- Update is_workspace_admin to require active membership
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

-- SELECT: only show active members in the same workspace
DROP POLICY IF EXISTS "workspace_members_select_own_workspace" ON public.workspace_members;
CREATE POLICY "workspace_members_select_active"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (workspace_id = public.current_app_org_id() AND is_active = true);

-- UPDATE: owner/admin only, no self-modify
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

-- Remove overly permissive DELETE policy (we use soft-deactivation, not hard delete)
DROP POLICY IF EXISTS "workspace_members_delete_own_workspace" ON public.workspace_members;
