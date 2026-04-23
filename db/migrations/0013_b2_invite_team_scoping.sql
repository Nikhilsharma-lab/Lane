ALTER TABLE "invites" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "team_role" "team_role";--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_team_id_projects_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Unique partial index: one pending invite per (email, org_id) pair.
-- Spec §4.2 invariant. Partial because accepted invites are historical
-- and shouldn't block new invites for the same email+org.
--
-- Note: predicate is `accepted_at IS NULL` only, not `... AND expires_at > now()`.
-- Postgres requires partial index WHERE clauses to be IMMUTABLE; `now()`
-- is STABLE, not IMMUTABLE, so expires_at-based filtering can't go in
-- the index itself. Expired-but-unaccepted invites will still block
-- new invites for the same (email, org_id) until the cleanup cron
-- (Phase E's cleanup-invites) removes them. 30-day surprise window
-- bounded by cron cadence.
CREATE UNIQUE INDEX "invites_unique_pending_per_email_org"
  ON "invites" ("email", "org_id")
  WHERE "accepted_at" IS NULL;
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
               WHERE profiles.id = target_user_id
                 AND profiles.org_id = invite_row.org_id) THEN
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
  -- Decision locked 2026-04-23: invites don't encode workspace-level
  -- authorization; promotion is a separate explicit action.
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
  VALUES (
    invite_row.org_id,
    target_user_id,
    'member'::public.workspace_role,
    invite_row.invited_by,
    now()
  )
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  -- Path C: team-scoping INSERT into project_members. Fires only when
  -- invite is team-scoped (team_id IS NOT NULL). Writes team_role only;
  -- omits `role` (defaults to 'member', unused by readers per the
  -- 2026-04-23 column-contract audit). Omits is_team_admin (default
  -- false) and joined_at (default now()).
  --
  -- SQL identifier note: invites.team_id (invite_row.team_id) is the
  -- source of the team reference, but the destination column on
  -- project_members is named "project_id" (Drizzle teamId → SQL
  -- project_id per the dual-naming pattern, db/schema/project_members.ts
  -- line 10). ON CONFLICT targets the PK (project_id, user_id).
  IF invite_row.team_id IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, team_role)
    VALUES (
      invite_row.team_id,
      target_user_id,
      invite_row.team_role
    )
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Audit log. team_id + team_role keys included only when invite is
  -- team-scoped (Pattern ii — cleaner per-row shape, queryable with
  -- `event_data ? 'team_id'` to find team-scoped accepts). Workspace-
  -- only accepts omit the keys entirely.
  INSERT INTO public.audit_log (workspace_id, actor_user_id, event_type, event_data)
  VALUES (
    invite_row.org_id,
    target_user_id,
    'member.joined',
    CASE WHEN invite_row.team_id IS NOT NULL
      THEN jsonb_build_object(
        'invite_id', invite_row.id,
        'invited_by', invite_row.invited_by,
        'role', invite_row.role,
        'team_id', invite_row.team_id,
        'team_role', invite_row.team_role
      )
      ELSE jsonb_build_object(
        'invite_id', invite_row.id,
        'invited_by', invite_row.invited_by,
        'role', invite_row.role
      )
    END
  );

  -- Mark invite accepted (both timestamp and acceptor-id)
  UPDATE public.invites
  SET accepted_at = now(),
      accepted_by = target_user_id
  WHERE id = invite_row.id;

  RETURN QUERY SELECT invite_row.org_id, created_profile;
END;
$$;