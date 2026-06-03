-- =========================================================================
-- 0001_rls_policies.sql
-- =========================================================================
-- RLS helper functions and policies for Lane MVP.
-- Extracted from lane-archive migrations 0005, 0018, 0019.
--
-- Pattern: app.current_user_id is set via server-side DB session helper
-- (db/user.ts). Supabase client traffic resolves identity from JWT claims.
-- Bootstrap flows (signup, invite accept) use SECURITY DEFINER functions.

-- =========================================================================
-- Helper functions
-- =========================================================================

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::uuid,
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  )
$$;

CREATE OR REPLACE FUNCTION public.current_app_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.org_id
  FROM public.profiles p
  WHERE p.id = public.current_app_user_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role::text
  FROM public.profiles p
  WHERE p.id = public.current_app_user_id()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_current_org_member(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_org_id IS NOT NULL
    AND target_org_id = public.current_app_org_id()
$$;

-- =========================================================================
-- is_workspace_admin — structural admin check (from archive migration 0019)
-- =========================================================================
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
  );
$$;

REVOKE ALL ON FUNCTION public.is_workspace_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_workspace_admin(uuid) TO authenticated;

-- =========================================================================
-- Bootstrap RPC — creates workspace + profile + membership on first signup
-- =========================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_organization_membership(
  target_user_id uuid,
  target_org_name text,
  target_org_slug text,
  target_full_name text,
  target_email text
)
RETURNS TABLE (org_id uuid, profile_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_profile public.profiles%ROWTYPE;
  created_org public.organizations%ROWTYPE;
BEGIN
  SELECT *
  INTO existing_profile
  FROM public.profiles
  WHERE id = target_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT existing_profile.org_id, false;
    RETURN;
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (target_org_name, target_org_slug)
  RETURNING *
  INTO created_org;

  INSERT INTO public.profiles (id, org_id, full_name, email, role)
  VALUES (target_user_id, created_org.id, target_full_name, target_email, 'designer');

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (created_org.id, target_user_id, 'owner');

  RETURN QUERY SELECT created_org.id, true;
END;
$$;

-- =========================================================================
-- Invite helpers
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_invite_context(invite_token text)
RETURNS TABLE (
  org_id uuid,
  org_name text,
  email text,
  role text,
  invited_by uuid,
  invited_by_name text,
  accepted_at timestamptz,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.org_id,
    o.name AS org_name,
    i.email,
    i.role,
    i.invited_by,
    p.full_name AS invited_by_name,
    i.accepted_at,
    i.expires_at
  FROM public.invites i
  JOIN public.organizations o ON o.id = i.org_id
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.token = invite_token
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.accept_invite_membership(
  invite_token text,
  target_user_id uuid,
  target_full_name text,
  target_email text
)
RETURNS TABLE (org_id uuid, profile_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row public.invites%ROWTYPE;
  existing_profile public.profiles%ROWTYPE;
  created_profile boolean := false;
BEGIN
  SELECT *
  INTO invite_row
  FROM public.invites
  WHERE token = invite_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;

  IF invite_row.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invite has already been used';
  END IF;

  IF now() > invite_row.expires_at THEN
    RAISE EXCEPTION 'This invite has expired. Ask your team lead to send a new one.';
  END IF;

  IF lower(trim(target_email)) <> lower(trim(invite_row.email)) THEN
    RAISE EXCEPTION 'This invite was sent to a different email address';
  END IF;

  SELECT *
  INTO existing_profile
  FROM public.profiles
  WHERE id = target_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (
      target_user_id,
      invite_row.org_id,
      target_full_name,
      target_email,
      invite_row.role::public.role
    );

    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (invite_row.org_id, target_user_id, 'member');

    created_profile := true;
  END IF;

  UPDATE public.invites
  SET accepted_at = now(), accepted_by = target_user_id
  WHERE id = invite_row.id;

  RETURN QUERY SELECT invite_row.org_id, created_profile;
END;
$$;

-- =========================================================================
-- Enable RLS on all tables
-- =========================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- Policies: organizations
-- =========================================================================
CREATE POLICY "organizations_select_current_org"
  ON public.organizations
  FOR SELECT
  TO public
  USING (id = public.current_app_org_id());

-- =========================================================================
-- Policies: profiles
-- =========================================================================
CREATE POLICY "profiles_select_same_org"
  ON public.profiles
  FOR SELECT
  TO public
  USING (
    id = public.current_app_user_id()
    OR public.is_current_org_member(org_id)
  );

CREATE POLICY "profiles_update_self_or_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    public.is_current_org_member(org_id)
    AND (
      id = public.current_app_user_id()
      OR public.is_workspace_admin(org_id)
    )
  )
  WITH CHECK (
    public.is_current_org_member(org_id)
    AND (
      id = public.current_app_user_id()
      OR public.is_workspace_admin(org_id)
    )
  );

-- =========================================================================
-- Policies: workspace_members (from archive migration 0018)
-- =========================================================================
CREATE POLICY "workspace_members_select_own_workspace"
  ON public.workspace_members
  FOR SELECT
  TO authenticated
  USING (workspace_id = public.current_app_org_id());

CREATE POLICY "workspace_members_delete_own_workspace"
  ON public.workspace_members
  FOR DELETE
  TO authenticated
  USING (workspace_id = public.current_app_org_id());

-- =========================================================================
-- Policies: requests
-- =========================================================================
CREATE POLICY "requests_org_access"
  ON public.requests
  FOR ALL
  TO public
  USING (public.is_current_org_member(org_id))
  WITH CHECK (public.is_current_org_member(org_id));

-- =========================================================================
-- Policies: invites
-- =========================================================================
CREATE POLICY "invites_org_access"
  ON public.invites
  FOR ALL
  TO public
  USING (public.is_current_org_member(org_id))
  WITH CHECK (public.is_current_org_member(org_id));
