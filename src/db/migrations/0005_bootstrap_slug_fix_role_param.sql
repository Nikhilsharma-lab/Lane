-- =========================================================================
-- 0005_bootstrap_slug_fix_role_param.sql
-- =========================================================================
-- Replaces bootstrap_organization_membership with a version that:
-- 1. Accepts a role parameter instead of hardcoding 'designer'
-- 2. Handles slug collisions with a suffix retry loop
-- Resolves DEFERRED.md slug-collision item.

CREATE OR REPLACE FUNCTION public.bootstrap_organization_membership(
  target_user_id uuid,
  target_org_name text,
  target_org_slug text,
  target_full_name text,
  target_email text,
  target_role text DEFAULT 'designer'
)
RETURNS TABLE (org_id uuid, profile_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_profile public.profiles%ROWTYPE;
  created_org public.organizations%ROWTYPE;
  final_slug text;
  attempt int := 0;
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

  -- Retry slug with numeric suffix on collision (max 10 attempts)
  final_slug := target_org_slug;
  LOOP
    BEGIN
      INSERT INTO public.organizations (name, slug)
      VALUES (target_org_name, final_slug)
      RETURNING *
      INTO created_org;
      EXIT; -- success
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt >= 10 THEN
        RAISE EXCEPTION 'Could not generate unique workspace slug after 10 attempts';
      END IF;
      final_slug := target_org_slug || '-' || attempt;
    END;
  END LOOP;

  INSERT INTO public.profiles (id, org_id, full_name, email, role)
  VALUES (target_user_id, created_org.id, target_full_name, target_email, target_role::public.role);

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (created_org.id, target_user_id, 'owner');

  RETURN QUERY SELECT created_org.id, true;
END;
$$;
