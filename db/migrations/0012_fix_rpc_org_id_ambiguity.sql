-- =========================================================================
-- 0012_fix_rpc_org_id_ambiguity.sql
-- =========================================================================
-- Forward-only fix for a plpgsql column-vs-OUT-parameter ambiguity
-- introduced by migration 0011's RPCs. Both RPCs declare
-- RETURNS TABLE (org_id uuid, profile_created boolean), which makes
-- `org_id` an implicit OUT parameter in scope inside the function body.
-- Two sites reference `org_id` bare and Postgres's default
-- plpgsql.variable_conflict behavior rejects the ambiguity at first call.
--
-- Bug surfaced at STOP F when pg-tap assertion #14 (bootstrap idempotency)
-- invoked the RPC for the first time, producing:
--   ERROR: column reference "org_id" is ambiguous
--
-- Migration 0011 applied successfully because plpgsql defers semantic
-- resolution to first execution — the bug was latent until invocation.
--
-- Fix: qualify the two bare column references with their table name
-- (Option A per STOP G triage — minimal surface, preserves return shape,
-- avoids changing resolution defaults).
--
-- This file replaces both RPC bodies verbatim with the corrected versions.
-- Diff vs 0011's versions is exactly 2 lines (1 per function).
--
-- Also required (not in this migration): patch DOCS BIG/docs/user-flows-spec.md
-- §4.1.1 and §4.1.2 to reflect the qualified references, and renumber
-- roadmap B2/B3/B4 from 0012/0013/0014 to 0013/0014/0015.
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
  existing_workspace_id uuid;
  created_org public.organizations;
BEGIN
  -- Idempotency guard: if profile already exists, return its workspace_id
  -- and heal any missing workspace_members row (partial-failure recovery)
  SELECT profiles.org_id INTO existing_workspace_id   -- FIXED: was bare `org_id`, ambiguous with OUT param
  FROM public.profiles
  WHERE id = target_user_id;

  IF existing_workspace_id IS NOT NULL THEN
    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
    VALUES (existing_workspace_id, target_user_id, 'owner'::public.workspace_role, NULL, now())
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
    RETURN QUERY SELECT existing_workspace_id, false;
    RETURN;
  END IF;

  -- Fresh bootstrap path
  INSERT INTO public.organizations (name, slug)
  VALUES (target_org_name, target_org_slug)
  RETURNING * INTO created_org;

  INSERT INTO public.profiles (id, org_id, full_name, email, role)
  VALUES (target_user_id, created_org.id, target_full_name, target_email, 'lead'::public.role);

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
  VALUES (created_org.id, target_user_id, 'owner'::public.workspace_role, NULL, now());

  INSERT INTO public.audit_log (workspace_id, actor_user_id, event_type, event_data)
  VALUES (created_org.id, target_user_id, 'workspace.created',
    jsonb_build_object('workspace_name', target_org_name, 'slug', target_org_slug));

  RETURN QUERY SELECT created_org.id, true;
END;
$$;
--> statement-breakpoint

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
  -- 1. Invite lookup
  SELECT *
  INTO invite_row
  FROM public.invites
  WHERE token = invite_token
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid invite link';
  END IF;

  -- 2. Expiry check (moved above accepted_at check per spec line 240)
  IF now() > invite_row.expires_at THEN
    RAISE EXCEPTION 'This invite has expired. Ask your team lead to send a new one.';
  END IF;

  -- 3. Email match check
  IF lower(trim(target_email)) <> lower(trim(invite_row.email)) THEN
    RAISE EXCEPTION 'This invite was sent to a different email address';
  END IF;

  -- 4. Idempotency guard (accepted_at IS NOT NULL)
  IF invite_row.accepted_at IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles
               WHERE profiles.id = target_user_id     -- FIXED: qualified for consistency
                 AND profiles.org_id = invite_row.org_id) THEN  -- FIXED: was bare `org_id`, ambiguous with OUT param
      RETURN QUERY SELECT invite_row.org_id, false;
      RETURN;
    ELSE
      RETURN QUERY SELECT NULL::uuid, false;
      RETURN;
    END IF;
  END IF;

  -- Profile: create if absent (preserves existing cast invite_row.role::public.role)
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
    created_profile := true;
  END IF;

  -- workspace_members: hardcoded 'member' for invite-accepted joins.
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
  VALUES (
    invite_row.org_id,
    target_user_id,
    'member'::public.workspace_role,
    invite_row.invited_by,
    now()
  )
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  -- Path C: team-scoping INSERT into project_members deferred to migration
  -- 0013 (B2, formerly 0012 before G.1 renumber). invites.team_id and
  -- invites.team_role columns do not exist in 0011 or 0012.

  -- Audit log (team_id key intentionally omitted; reinstate in B2 per
  -- roadmap parking lot 2026-04-22)
  INSERT INTO public.audit_log (workspace_id, actor_user_id, event_type, event_data)
  VALUES (
    invite_row.org_id,
    target_user_id,
    'member.joined',
    jsonb_build_object(
      'invite_id', invite_row.id,
      'invited_by', invite_row.invited_by,
      'role', invite_row.role
    )
  );

  -- Mark invite accepted (both timestamp and acceptor-id)
  UPDATE public.invites
  SET accepted_at = now(),
      accepted_by = target_user_id
  WHERE id = invite_row.id;

  RETURN QUERY SELECT invite_row.org_id, created_profile;
END;
$$;
