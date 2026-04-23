# Lane — User Flows Spec

**Status:** Spec v2 (enterprise-grade rewrite), Week 7.5, April 19 2026
**Supersedes:** v1 of this document + the Week 7.5 outline in `docs/ROADMAP.md`
**Aligned with:** `CLAUDE.md`, `docs/nav-spec.md`, `docs/onboarding-spec.md`, `docs/WORKING-RULES.md`

> This document is the source of truth for signup, invites, membership, and ownership in Lane. If this spec and a prompt disagree, this spec wins. If this spec and `CLAUDE.md` disagree on vocabulary, `CLAUDE.md` wins — this spec is aligned to it.
>
> **What changed in v2:** (a) RPCs are idempotent and self-healing; (b) audit log, waitlist infrastructure, and rate limiting are now first-class; (c) §15 build order is tests-parallel with vertical slices; (d) honesty notes added where earlier sections made claims that were aspirational rather than grounded; (e) estimate adjusted to ~50-54 hours to reflect actual enterprise-grade scope.

---

## 1. Philosophy and scope

### 1.1 Philosophy A: one email = one user = one workspace

Lane is built for a single organization. A user has one account, tied to one email address, and that account owns or belongs to exactly one workspace.

A human being may choose to create multiple Lane accounts using different email addresses (for example `nikhil@gmail.com` for solo exploration and `nikhil@airtel.com` for their real team). Lane does not try to link those accounts. From Lane's perspective they are two completely separate users with two completely separate workspaces. The same pattern as Linear and Figma for non-enterprise users.

This is a deliberate simplification. Philosophy B (one user, many workspaces) is explicitly rejected for v1. See §16 for the rationale and migration path if it ever becomes necessary.

### 1.2 Why this matters

The P0 bug that prompted this spec — `workspace_members` never being populated — is a symptom of the schema half-implementing Philosophy B without ever committing to it. This spec closes that gap by fully committing to Philosophy A at the application layer while leaving the existing join-table structure intact (for future migration optionality).

### 1.3 Scope of this spec

In scope:

- Signup (self-service, any email) creating a workspace
- Invite creation and acceptance (designer and PM roles)
- Ownership transfer within a workspace
- Member removal and self-removal
- Edge cases: duplicate emails, expired invites, orphaned workspaces, user deletion
- Role model reconciliation (three role surfaces, documented jobs)
- Schema changes and backfill migration
- Test matrix (pg-tap + Playwright)

Out of scope:

- Multi-workspace UX (workspace switcher, cross-workspace notifications)
- Domain-based auto-join (Figma-style domain capture)
- SSO / SCIM provisioning
- True anonymous sandbox mode (explore without signing up)
- Merging two accounts into one
- Workspace deletion flow (separate spec)

---

## 2. Vocabulary

This spec uses CLAUDE.md's canonical vocabulary. No new terms introduced. Terms that appear here:

| Term | Meaning |
|---|---|
| **Workspace** | The top-level container for a Lane organization. Table name: `organizations`, Drizzle alias: `workspaces`. One per user. |
| **User** | An account, tied to one email address, authenticated via Supabase Auth. |
| **Profile** | The application-layer representation of a user within their workspace. Table: `profiles`. Stores functional role, name, timezone, etc. |
| **Workspace member** | The access-control row linking a user to their workspace. Table: `workspace_members`. Stores access role (owner/admin/member/guest). |
| **Team** | A group within a workspace. Table: `projects` in current schema (vocabulary drift to be cleaned up separately). A user can belong to multiple teams within their workspace. |
| **Team membership** | A user's role within a specific team. Table: `project_members`. Stores team-scoped functional role. |
| **Owner** | The single user with ultimate authority over a workspace. Every workspace has exactly one owner at all times. |
| **Invite** | A pending grant allowing a specific email to join a workspace with a predetermined role. Table: `invites`. |

---

## 3. Role model

Lane has three role surfaces. Each has a distinct job. Do not collapse them.

### 3.1 `profiles.role` — functional role

**Values:** `pm | designer | developer | lead | admin`

**Job:** Describes what kind of work this person does in the workspace. Branch product workflow logic on this.

**Examples of use:**
- PMs fill out intake forms and log impact
- Designers own Requests and move them through design stages
- Developers receive handoffs and see the Refine-phase view
- Leads see team-health signals and can approve Commitments

**Set by:** the signup RPC (default `lead` for self-signup) or the invite acceptance RPC (from `invites.role`).

### 3.2 `workspace_members.role` — access role

**Values:** `owner | admin | member | guest`

**Job:** Describes what this person is allowed to do at the workspace level. Branch access control and administration on this.

**Examples of use:**
- Only `owner` can transfer ownership or delete the workspace
- `owner` and `admin` can invite new members, change settings, see billing
- `member` can do everything the product allows for their functional role
- `guest` has read-only access to specific Requests (post-v1 feature; reserved in enum)

**Set by:** the signup RPC (always `owner` for self-signup) or the invite acceptance RPC (always `member` for v1).

### 3.3 `project_members.role` — team-scoped functional role

**Values:** `designer | pm` (extend as needed)

**Job:** Overrides `profiles.role` for a specific team. Handles the case where someone is a PM on one team but a designer on another.

**Examples of use:**
- Someone with `profiles.role = 'designer'` who is added to a team as a PM — their team view behaves as PM on that team only
- Onboarding persona detection reads this for team-specific onboarding variants

**Set by:** the invite acceptance RPC when the invite specifies a team, or manually by a workspace admin.

### 3.4 Resolution rules

When Lane needs to decide how to treat a user in a given context:

1. **Workspace-level access decisions** (invite, delete, billing) → read `workspace_members.role`
2. **Team-level workflow decisions** (who can assign this Request, who fills intake) → read `project_members.role` first; fall back to `profiles.role` if no team membership exists
3. **Global workflow decisions** (onboarding variant, morning briefing content) → read `profiles.role`

Every query that branches on role must be explicit about which role it is reading. Never silently conflate the three.

---

## 4. Schema changes

> **Migration numbering note.** Migration numbers 0006-0009 were initially planned in spec v2 but conflict with migrations already committed to db/migrations/ (0006_alert_rls_tighten, 0007_fancy_wild_pack, 0008_ordinary_warbird, and 0009_rls_coverage_0007 which landed as PR #40 during pre-A1 work). Originally this spec numbered B1-B4 as 0010-0013; after a catch-up migration `0010_catchup_orphan_schema` shipped on 2026-04-21 (commit b067d0e) to capture 10 days of schema drift, B1-B4 were renumbered to 0011-0014. Post-B1, migration 0012 was consumed by a fix-up for RPC column-name ambiguity (commit 186ca28), shifting B2-B4 to 0013-0015. Numbers below reflect the current post-fix-up numbering.

### 4.1 Migration: `0011_steady_fixer.sql` (previously planned as 0010; suffix is drizzle-kit auto-generated since no --name flag; see §4 numbering note)

This is the core fix. The existing RPCs (`bootstrap_organization_membership`, `accept_invite_membership`) currently create `workspaces` and `profiles` rows but never touch `workspace_members`. This migration updates both RPCs to also insert a `workspace_members` row, and backfills existing users.

#### 4.1.1 Update `bootstrap_organization_membership` — idempotent

The RPC must be safe to call twice. If the auth.users row exists but the profile/workspace does not (e.g., first call failed after auth.signUp but before RPC commit, or network retry), calling again should complete the bootstrap without error.

Structure:

```sql
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
  SELECT profiles.org_id INTO existing_workspace_id   -- qualified to disambiguate from OUT param
  FROM public.profiles
  WHERE id = target_user_id;

  IF existing_workspace_id IS NOT NULL THEN
    -- Verify workspace_members row exists; heal if missing (recovery path)
    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
    VALUES (existing_workspace_id, target_user_id, 'owner', NULL, now())
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    RETURN QUERY SELECT existing_workspace_id, false;
    RETURN;
  END IF;

  -- Fresh bootstrap path
  INSERT INTO public.organizations (name, slug)
  VALUES (target_org_name, target_org_slug)
  RETURNING * INTO created_org;

  INSERT INTO public.profiles (id, org_id, full_name, email, role)
  VALUES (target_user_id, created_org.id, target_full_name, target_email, 'lead');

  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
  VALUES (created_org.id, target_user_id, 'owner', NULL, now());

  -- Audit log (see §4.6)
  INSERT INTO public.audit_log (workspace_id, actor_user_id, event_type, event_data)
  VALUES (created_org.id, target_user_id, 'workspace.created',
    jsonb_build_object('workspace_name', target_org_name, 'slug', target_org_slug));

  RETURN QUERY SELECT created_org.id, true;
END;
$$;
```

> **PL/pgSQL qualification note:** Functions declared with
> `RETURNS TABLE (org_id uuid, ...)` get implicit OUT parameters
> named for each column. Inside the function body, any bare
> reference to `org_id` is ambiguous between the OUT parameter
> and any column named `org_id` in a FROM-clause relation. Postgres
> rejects the ambiguity at first execution (not at function
> creation — plpgsql compiles function bodies lazily). The
> qualifier `profiles.org_id` disambiguates to the column. This
> applies to any RPC using `RETURNS TABLE` with column-name-matching
> OUT parameters. When authoring future RPCs with this shape, audit
> bare column references in function bodies before merging.

All writes happen in a single transaction. The `ON CONFLICT DO NOTHING` on workspace_members handles the rare case where profile exists but workspace_members row is missing (e.g., partial failure in a previous attempt).

**Why idempotency matters at enterprise grade:** network retries, double-clicks, and server restarts are normal. A non-idempotent signup RPC means any of these produces a 500 error the user can't recover from without support intervention. Idempotency makes signup self-healing. This is the standard pattern at Stripe, Supabase Auth, and every enterprise SaaS auth system.

#### 4.1.2 Update `accept_invite_membership` — idempotent

Same idempotency pattern. If the invite is already accepted (someone clicked the link twice), return success with the existing workspace_id rather than erroring.

Key additions to the existing RPC:

```sql
-- Idempotency guard
IF invite_row.accepted_at IS NOT NULL THEN
  -- Check if the acceptor matches
  IF EXISTS (SELECT 1 FROM public.profiles
             WHERE profiles.id = target_user_id     -- qualified for consistency
               AND profiles.org_id = invite_row.org_id) THEN  -- qualified to disambiguate from OUT param
    RETURN QUERY SELECT invite_row.org_id, false;
    RETURN;
  ELSE
    RETURN QUERY SELECT NULL::uuid, false;
    RETURN;
  END IF;
END IF;

-- [existing profile + workspace_members inserts]

-- Optional team membership
IF invite_row.team_id IS NOT NULL THEN
  INSERT INTO public.project_members (project_id, user_id, role, joined_at)
  VALUES (invite_row.team_id, target_user_id, invite_row.team_role::public.team_role, now())
  ON CONFLICT (project_id, user_id) DO NOTHING;
END IF;

-- Audit log
INSERT INTO public.audit_log (workspace_id, actor_user_id, event_type, event_data)
VALUES (invite_row.org_id, target_user_id, 'member.joined',
  jsonb_build_object(
    'invite_id', invite_row.id,
    'invited_by', invite_row.invited_by,
    'role', invite_row.role,
    'team_id', invite_row.team_id
  ));

-- Mark invite as accepted
UPDATE public.invites
SET accepted_at = now(), accepted_by = target_user_id
WHERE id = invite_row.id;
```

> See the PL/pgSQL qualification note in §4.1.1. The bare-column
> references here (`profiles.org_id` in the EXISTS subquery) are
> qualified for the same reason.

**Order of checks in migration 0011:** expiry first, then email match, then idempotency (the snippet above). The pre-existing `NOT FOUND` check stays at the very top, before any of these.

Note the new `invites.accepted_by uuid` column — added in migration 0011. Captures who actually accepted (not just "was accepted") which matters for audit trails when an invite email gets forwarded.

**Deferral note (Path C):** the team-scoping INSERT into `project_members` shown above is deferred to migration 0012 (B2). The `invites.team_id` and `invites.team_role` columns it reads from do not exist until migration 0012 adds them (see §4.2). B1's `accept_invite_membership` update will leave a SQL comment placeholder at this location instead of executing the INSERT.

Semantic questions about `role` / `team_role` / `is_team_admin` column population in `project_members` are also deferred to B2 alongside the INSERT itself.

#### 4.1.3 Backfill for existing users — batched, safe

At current scale (<100 profiles) the backfill is a single query. At Linear/Figma scale, this same query against 100k rows would lock the table for minutes. The spec shows both patterns; run the appropriate one based on row count at migration time.

**Small-scale (under 10k profiles):**

```sql
INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
SELECT
  p.org_id,
  p.id,
  CASE
    WHEN p.role IN ('lead', 'admin') THEN 'owner'::workspace_role
    ELSE 'member'::workspace_role
  END,
  NULL,
  p.created_at
FROM public.profiles p
LEFT JOIN public.workspace_members wm ON wm.user_id = p.id AND wm.workspace_id = p.org_id
WHERE wm.user_id IS NULL
ON CONFLICT (workspace_id, user_id) DO NOTHING;
```

**Large-scale pattern (batched, for future reference):**

```sql
-- Run via a loop in a migration script or one-off job:
DO $$
DECLARE
  batch_size int := 1000;
  processed int := 0;
  batch_count int;
BEGIN
  LOOP
    WITH to_backfill AS (
      SELECT p.id, p.org_id, p.role, p.created_at
      FROM public.profiles p
      LEFT JOIN public.workspace_members wm
        ON wm.user_id = p.id AND wm.workspace_id = p.org_id
      WHERE wm.user_id IS NULL
      LIMIT batch_size
      FOR UPDATE SKIP LOCKED
    )
    INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
    SELECT
      org_id, id,
      CASE WHEN role IN ('lead','admin') THEN 'owner'::workspace_role
           ELSE 'member'::workspace_role END,
      NULL, created_at
    FROM to_backfill
    ON CONFLICT (workspace_id, user_id) DO NOTHING;

    GET DIAGNOSTICS batch_count = ROW_COUNT;
    processed := processed + batch_count;

    RAISE NOTICE 'Processed % rows', processed;

    EXIT WHEN batch_count = 0;

    -- Give other queries breathing room
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;
```

**Post-backfill: collapse multi-owner workspaces.** (Same query as before, kept unchanged.)

```sql
WITH ranked_owners AS (
  SELECT workspace_id, user_id, created_at,
    ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at ASC) AS rn
  FROM public.workspace_members
  WHERE role = 'owner'
)
UPDATE public.workspace_members
SET role = 'admin'
FROM ranked_owners
WHERE workspace_members.workspace_id = ranked_owners.workspace_id
  AND workspace_members.user_id = ranked_owners.user_id
  AND ranked_owners.rn > 1;
```

**Verify backfill:** after migration, these invariant queries must return 0 rows:

```sql
-- Every profile should have a workspace_members row
SELECT p.id FROM profiles p
LEFT JOIN workspace_members wm ON wm.user_id = p.id AND wm.workspace_id = p.org_id
WHERE wm.user_id IS NULL;

-- Every workspace should have exactly one owner
SELECT workspace_id FROM workspace_members
WHERE role = 'owner' GROUP BY workspace_id HAVING count(*) != 1;
```

Include these invariant checks as post-deploy smoke tests.

### 4.2 Migration: `0013_b2_invite_team_scoping.sql`

The `invites` table currently carries functional role (`pm`, `designer`, etc.) but not team_id or team-scoped role. Add:

```sql
ALTER TABLE public.invites
  ADD COLUMN team_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN team_role public.team_role;
```

`team_id` and `team_role` are optional. If both are null, the invite creates a workspace-level membership only (user joins the workspace but not any team). If both are present, the acceptance RPC also creates a `project_members` row.

### 4.3 Migration: `0014_b3_ownership_transfer.sql`

New RPC for ownership transfer. See §9 for the full flow.

```sql
CREATE OR REPLACE FUNCTION public.transfer_workspace_ownership(
  target_workspace_id uuid,
  new_owner_user_id uuid,
  demote_current_owner_to text DEFAULT 'admin'
)
RETURNS TABLE (success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_owner_id uuid;
  new_owner_member_exists boolean;
BEGIN
  -- Validate caller is the current owner
  SELECT user_id INTO current_owner_id
  FROM public.workspace_members
  WHERE workspace_id = target_workspace_id AND role = 'owner';

  IF current_owner_id IS NULL THEN
    RETURN QUERY SELECT false, 'Workspace has no current owner';
    RETURN;
  END IF;

  IF current_owner_id != auth.uid() THEN
    RETURN QUERY SELECT false, 'Only the current owner can transfer ownership';
    RETURN;
  END IF;

  IF current_owner_id = new_owner_user_id THEN
    RETURN QUERY SELECT false, 'New owner is already the current owner';
    RETURN;
  END IF;

  -- Validate new owner is a workspace member
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = target_workspace_id AND user_id = new_owner_user_id
  ) INTO new_owner_member_exists;

  IF NOT new_owner_member_exists THEN
    RETURN QUERY SELECT false, 'New owner is not a member of this workspace';
    RETURN;
  END IF;

  -- Atomic swap
  UPDATE public.workspace_members
  SET role = demote_current_owner_to::workspace_role
  WHERE workspace_id = target_workspace_id AND user_id = current_owner_id;

  UPDATE public.workspace_members
  SET role = 'owner'
  WHERE workspace_id = target_workspace_id AND user_id = new_owner_user_id;

  -- Mirror to organizations.owner_id for any legacy code still reading it
  UPDATE public.organizations
  SET owner_id = new_owner_user_id
  WHERE id = target_workspace_id;

  RETURN QUERY SELECT true, 'Ownership transferred successfully';
END;
$$;
```

### 4.4 Invariants (application-enforced)

These are the invariants Lane maintains. Not schema-enforced (no UNIQUE constraints, no triggers), because enforcing at the schema level would prevent future migration to Philosophy B. Instead, enforced in application code and in tests.

1. **One workspace per user.** A user should have exactly one row in `workspace_members` and exactly one row in `profiles`. Signup and invite acceptance must never create a second row for an existing user.

2. **Exactly one owner per workspace.** At all times, a workspace has exactly one `workspace_members` row with `role = 'owner'`. Ownership transfer is the only mechanism to change who the owner is. The signup RPC creates the first (and only) owner. Invite acceptance never creates owners.

3. **Profiles and workspace_members are 1:1.** Every profile has a corresponding workspace_members row. Every workspace_members row has a corresponding profile. Creation and deletion happen together.

4. **`organizations.owner_id` mirrors `workspace_members` where `role = 'owner'`.** Two sources, one truth. Updated together. Ownership transfer updates both. (Long-term cleanup: drop `organizations.owner_id` and make `workspace_members` the sole source. Deferred.)

### 4.5 FK cascade behavior

| From | To | On delete |
|---|---|---|
| `workspace_members.workspace_id` | `organizations.id` | CASCADE — deleting a workspace removes all memberships |
| `workspace_members.user_id` | `auth.users.id` | **NEEDS TO BE ADDED**. Currently no FK. Add `REFERENCES auth.users(id) ON DELETE CASCADE` in a migration. (Once added: deleting a user removes their memberships.) |
| `profiles.id` | `auth.users.id` | **NEEDS TO BE ADDED**. Currently no FK. Add `REFERENCES auth.users(id) ON DELETE CASCADE` in a migration. |
| `profiles.org_id` | `organizations.id` | CASCADE — deleting a workspace removes all profiles |
| `project_members.user_id` | `profiles.id` | CASCADE — deleting a profile (and by extension the user) removes their team memberships |
| `project_members.project_id` | `projects.id` | CASCADE |
| `invites.org_id` | `organizations.id` | CASCADE |

The missing FKs on `profiles.id → auth.users.id` and `workspace_members.user_id → auth.users.id` are separate bugs discovered during this spec. Include both in the 0011 migration.

### 4.6 Audit log (new table, migration 0011)

Every state-changing event in the signup/invite/membership surface writes to `audit_log`. Immutable, queryable, retention-policy-ready. This is table stakes for enterprise SaaS — compliance audits, security incident response, customer support debugging all depend on having a record of "what happened and who did it."

```sql
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_workspace_time ON public.audit_log (workspace_id, created_at DESC);
CREATE INDEX audit_log_actor_time ON public.audit_log (actor_user_id, created_at DESC);
CREATE INDEX audit_log_event_type ON public.audit_log (event_type, created_at DESC);
```

**Design choices worth naming:**

- `actor_user_id` uses `ON DELETE SET NULL` rather than CASCADE. When a user is deleted, we want to preserve the audit log entry (with a null actor) rather than destroying historical evidence of actions. This is standard pattern for audit tables.
- `event_data jsonb` keeps the schema flexible — different event types have different relevant data. Enforcing a strict column schema for each event type would create migration churn for no benefit.
- No UPDATE or DELETE policies. Audit logs are append-only. This should be enforced via RLS policies: grant INSERT only, never UPDATE or DELETE to any role including service_role in normal operation. (Emergency manual fixes via superuser only, with their own audit trail.)

**Events emitted by Week 7.5 RPCs:**

| Event type | When |
|---|---|
| `workspace.created` | New workspace via signup |
| `member.joined` | Invite accepted |
| `member.left` | Self-removal |
| `member.removed` | Admin removed a member |
| `ownership.transferred` | Ownership transfer |
| `invite.created` | New invite sent |
| `invite.revoked` | Invite manually revoked |
| `invite.expired` | Invite auto-expired (logged by cleanup cron) |

Downstream features (Request changes, PM calibration, etc.) can add their own event types without schema changes.

### 4.7 Waitlist / approval gate (new table, migration 0011)

Per the decision in §5.2, Lane ships with infrastructure for approval-gating but defaults to auto-approve. This means we can turn gating on without a migration when we ever need to (regional restrictions, enterprise pilots, abuse response).

```sql
CREATE TABLE public.waitlist_approvals (
  email text PRIMARY KEY,
  approval_token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24), 'base64'),
  approved_at timestamptz,
  approval_source text NOT NULL CHECK (approval_source IN ('auto','manual','admin','campaign')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX waitlist_pending ON public.waitlist_approvals (created_at DESC)
  WHERE approved_at IS NULL;
```

**Behavior:**

- Controlled by env var `LANE_SIGNUP_AUTO_APPROVE` (default `true`).
- When `true`: signup flow inserts into `waitlist_approvals` with `approved_at = now()`, `approval_source = 'auto'`. User proceeds immediately. Founder notification email fires in parallel.
- When `false`: signup flow inserts with `approved_at = NULL`. User sees "We'll email you when approved" screen. Admin manually approves via a dashboard (deferred — Week 7.5 ships with `true` default, admin UI can wait for first actual gating need).

**Why this shape:** the table exists either way, so flipping the flag is a 1-line env change. The approval audit trail is preserved regardless of mode. Email-as-primary-key means we never get duplicate approval rows even under race conditions.

### 4.8 Rate limiting

Signup, invite creation, and invite acceptance are abuse vectors. Existing Upstash Redis rate limiter from Week 3 (`lib/rate-limit.ts`) gets extended:

```typescript
// New rate limit buckets:

export const signupRateLimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(5, "1 h"),   // 5 signups per IP per hour
  prefix: "ratelimit:signup",
});

export const inviteCreateRateLimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(20, "1 h"),  // 20 invites per user per hour
  prefix: "ratelimit:invite-create",
});

export const inviteAcceptRateLimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, "1 h"),  // 10 accept attempts per IP per hour
  prefix: "ratelimit:invite-accept",
});
```

Signup keyed by IP (no user yet). Invite create keyed by `owner_id` (prevents a compromised admin account from blasting invites). Invite accept keyed by IP (prevents token enumeration attacks).

All three return HTTP 429 with Retry-After header when exceeded. Logged to audit_log with event_type `rate_limit.exceeded` so we can spot attacks.

---

## 5. Flow: self-signup (any email)

### 5.1 Trigger

A user visits `/signup`, enters email + password + full name + workspace name, submits. This is the primary entry point for Lane. No distinction between personal email and work email — they both flow through this path.

**Signup mode (default: open with auto-approval, infrastructure for gating).**

Lane ships with `waitlist_approvals` infrastructure in place (§4.7) but defaults to auto-approve via env var `LANE_SIGNUP_AUTO_APPROVE=true`. Every signup is logged, approved instantly, and triggers a founder notification email. If we ever need to restrict signup (regional pilots, abuse response, enterprise gate), flip the env var to `false` — no migration, no code change. Admin UI for manual approval is deferred until we actually need it.

This replaces the "waitlist for first 90 days" claim in onboarding-spec.md section 2, which was aspirational and not grounded in evidence. Update onboarding-spec.md in a follow-up to remove the stale claim.

### 5.2 Preconditions

- The email address is not already registered in `auth.users`
- An `waitlist_approvals` row exists for this email with `approved_at` not null. In default (auto-approve) mode, this row is created automatically as the first step of signup. In gated mode, user sees "We'll email you when approved" until admin approves manually.
- Signup rate limit not exceeded (§4.8)

### 5.3 Database writes (in order, single transaction)

1. `auth.users` — created by `supabase.auth.signUp()`, user_id returned
2. `organizations` — new row with `name`, `slug` (derived from name, uniqueness-enforced), `owner_id = user_id`, `plan = 'trial'`
3. `profiles` — new row with `id = user_id`, `org_id = organizations.id`, `full_name`, `email`, `role = 'lead'`
4. `workspace_members` — new row with `workspace_id = organizations.id`, `user_id = user_id`, `role = 'owner'`, `invited_by = NULL`

Steps 2-4 happen inside `bootstrap_organization_membership` RPC (updated per §4.1.1). All atomic — any failure rolls back the entire transaction.

### 5.4 UI states

1. **`/signup`** — form with fields: email, password, full name, workspace name (pre-filled with "`{firstName}`'s workspace" as a suggestion). Submit button.
2. **Loading** — "Creating your workspace..." spinner
3. **Email confirmation (if enabled in Supabase)** — "Check your email to confirm your account" with resend link. Session cookie set on confirm.
4. **`/dashboard`** — first login lands here. Onboarding flow takes over (per `onboarding-spec.md` section 4, Design Head variant).

### 5.5 Error paths

| Error | User-facing message | What the system does |
|---|---|---|
| Email already registered | "An account with this email already exists. [Sign in](/login)" | No DB writes |
| Password too weak | "Password must be at least 8 characters" (or match Supabase's policy) | Form re-renders with error |
| Waitlist not approved | "Lane is invite-only right now. [Join the waitlist](/waitlist)" | No DB writes |
| Workspace name too long (>100 chars) | "Workspace name is too long" | Form re-renders |
| RPC transaction fails (DB error) | "Something went wrong. Try again in a moment." | Auth user may have been created; see §5.6 |

### 5.6 The auth-user-without-workspace edge case — idempotent self-healing

Supabase's `auth.signUp()` creates the auth.users row before our RPC runs. If the RPC then fails (network blip, DB hiccup, deploy race), we'd end up with an authenticated user who has no workspace. At enterprise grade, this state must be automatically recoverable, not "log and alert."

**Pattern: idempotent bootstrap with recovery on next sign-in.**

```typescript
// app/actions/auth.ts

export async function signup(input: SignupInput) {
  const supabase = createServerClient();

  // Step 1: Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
  });
  if (authError) throw authError;
  if (!authData.user) throw new Error("Signup returned no user");

  // Step 2: Call idempotent bootstrap RPC
  const { data, error } = await supabase.rpc('bootstrap_organization_membership', {
    target_user_id: authData.user.id,
    target_org_name: input.orgName,
    target_org_slug: slugify(input.orgName),
    target_full_name: input.fullName,
    target_email: input.email,
  });

  // Step 3: Handle bootstrap failure
  if (error) {
    // Do NOT delete the auth user. The RPC is idempotent — retry on next sign-in.
    // Log for observability; user sees a recoverable error.
    await logSignupError({
      user_id: authData.user.id,
      email: input.email,
      error: error.message,
    });
    return {
      status: 'partial_signup',
      message: 'Account created but workspace setup is still processing. Sign in again in a moment to complete.',
    };
  }

  return { status: 'success', workspace_id: data[0].workspace_id };
}

// Recovery path: called at start of every authenticated page load
export async function ensureBootstrapped(userId: string) {
  const supabase = createServerClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile) return profile;  // Already bootstrapped, nothing to do

  // Profile missing — bootstrap is incomplete. Attempt recovery.
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("No auth session");

  // Note: we need the orgName and fullName from somewhere. Options:
  // (a) Store them in auth.users.raw_user_meta_data during signup (preferred)
  // (b) Prompt the user to re-enter them
  //
  // Week 7.5 implementation: (a) — signup stashes orgName and fullName in user_metadata
  //                                 so recovery can run without user prompting.
  const metadata = user.user.user_metadata || {};
  const orgName = metadata.pending_org_name;
  const fullName = metadata.pending_full_name;

  if (!orgName || !fullName) {
    // Very rare: signup succeeded at auth but metadata wasn't stored. Fall back to prompt.
    return { status: 'needs_workspace_setup' };
  }

  const { data, error } = await supabase.rpc('bootstrap_organization_membership', {
    target_user_id: userId,
    target_org_name: orgName,
    target_org_slug: slugify(orgName),
    target_full_name: fullName,
    target_email: user.user.email,
  });

  if (error) throw error;
  return { status: 'recovered', workspace_id: data[0].workspace_id };
}
```

**Honesty note — what this pattern trades off:**

This pattern trades "destructive cleanup on failure" (my original §5.6) for "pending state with self-healing recovery" (this version). The tradeoffs are explicit:

- **Cost:** we carry a small amount of complexity (two code paths — signup and recovery) and auth.users.raw_user_meta_data holds transient state. Not zero cost.
- **Benefit:** no destructive admin.deleteUser call that can itself fail. No nightly cleanup script required. Self-healing on the user's next action. Observable as a real database state ("profile missing for this auth user") rather than a transient error.
- **Alternative rejected:** Postgres trigger on `auth.users` INSERT that auto-creates profile + workspace. Cleaner at DB layer, but: (a) WORKING-RULES.md commits Lane to app-layer patterns, (b) triggers make the signup flow less observable, (c) rollback on RPC failure would require additional trigger logic. If the app-layer pattern ever becomes a pain point, revisit with a decision doc — don't slip it in silently.

This is the standard pattern at Stripe Connect (account bootstrapping), Auth0 (first-login provisioning), and most enterprise SaaS auth systems. Self-healing is the expectation, not "call support if signup fails."

### 5.7 Events

- `auth.signup.attempted` (email domain type: personal/work heuristic)
- `auth.signup.succeeded` (user_id, workspace_id)
- `auth.signup.failed` (error_code)

---

## 6. Flow: invite creation

### 6.1 Trigger

An `owner` or `admin` in a workspace visits `/settings/members` → "Invite member" → enters email + functional role + optionally a team + optionally a team-scoped role → submits.

### 6.2 Preconditions

- Caller is `workspace_members.role IN ('owner', 'admin')` for the workspace
- The email is not already a member (check `workspace_members` joined with `profiles.email`)
- No un-expired invite already exists for this email in this workspace

### 6.3 Database writes

`invites` — new row:

```
workspace_id: workspace.id
email: lowercased, trimmed
role: functional role (pm, designer, developer, lead)
team_id: optional, references projects.id
team_role: optional, references team_role enum
created_by: caller.user_id
token: crypto-secure random, URL-safe, 32 bytes
expires_at: now() + 7 days
accepted_at: NULL
```

### 6.4 Email sent via Resend

Template: `invite_email` (new template in `lib/email/templates.ts`)

```
Subject: {inviter_name} invited you to {workspace_name} on Lane

Body:
Hey {invitee_first_name or 'there'},

{inviter_name} ({inviter_email}) invited you to join {workspace_name} on Lane as a {functional_role}.

Lane is a design operations tool for teams that want less surveillance and more support. {inviter_name} thinks you'd fit well here.

[Accept invite] → https://lane.app/invite/accept?token={invite.token}

This invite expires in 7 days.

If you weren't expecting this, you can ignore this email — the invite will expire on its own.
```

### 6.5 UI states

1. `/settings/members` — table of current members + "Invite" button
2. Invite modal — email, functional role dropdown, optional team dropdown, optional team role dropdown
3. Submit → success toast: "Invite sent to {email}"
4. Members table updates to show "Pending invites" section with the new invite + "Resend" and "Revoke" actions

### 6.6 Error paths

| Error | User-facing message |
|---|---|
| Email already a member | "{email} is already a member of this workspace." |
| Pending invite already exists | "An invite is already pending for {email}. [Resend] or [Revoke and re-invite]" |
| Caller lacks permission | "Only owners and admins can invite new members." |
| Invalid email format | "Please enter a valid email address." |
| Team specified but team_role not, or vice versa | "Specify both a team and a team role, or neither." |

### 6.7 Events

- `invite.created` (workspace_id, invited_email_domain, functional_role, team_scoped: bool)
- `invite.email_sent` (invite_id)
- `invite.email_failed` (invite_id, error)

---

## 7. Flow: invite acceptance — designer

### 7.1 Trigger

Recipient clicks the link in the invite email → lands on `/invite/accept?token={token}`.

### 7.2 Sub-path A: recipient has no Lane account

This is the default case for new users.

#### Preconditions

- Token is valid (exists in `invites`, not expired, not accepted)
- Email in invite does not already have an auth.users row

#### UI flow

1. `/invite/accept?token={token}` — server loads the invite, renders a confirmation page:
   > "{inviter_name} invited you to join {workspace_name} as a {functional_role}. Create your account to accept."
2. Form: full name, password (email is pre-filled and non-editable, pulled from invite)
3. Submit → create auth.users + profile + workspace_members + optional project_members → log in → redirect to `/dashboard`

#### Database writes (in order, single transaction on the RPC side)

1. `auth.users` — created by `supabase.auth.signUp()` with email from invite
2. `profiles` — `id = user_id`, `org_id = invite.org_id`, `full_name`, `email`, `role = invite.role`
3. `workspace_members` — `workspace_id = invite.org_id`, `user_id = user_id`, `role = 'member'`, `invited_by = invite.invited_by`
4. `project_members` — if `invite.team_id` is not null: `project_id, user_id, role = invite.team_role`
5. `invites` — UPDATE `accepted_at = now()`

Steps 2-5 happen inside `accept_invite_membership` RPC (updated per §4.1.2). The RPC takes token as input and validates it server-side — never trust client-side validation.

#### Events

- `invite.clicked` (invite_id, has_existing_account: false)
- `invite.accept.attempted` (invite_id)
- `invite.accept.succeeded` (invite_id, user_id)
- `invite.accept.failed` (invite_id, error_code)

### 7.3 Sub-path B: recipient already has a Lane account

This is unusual but possible — someone signed up for Lane previously (under a different workspace), then got invited to another workspace under the same email. Per Philosophy A, this is a conflict — one email = one workspace.

#### Resolution

**Block the invite acceptance.** Show an error page:

> You already have a Lane account at {existing_workspace_name}. Lane currently supports one workspace per account. To join {new_workspace_name}, you'd need to:
>
> 1. Leave your current workspace (which deletes your data there), or
> 2. Use a different email address for this invite, or
> 3. Ask {inviter_name} to invite you at a different email
>
> Contact support@lane.app if you need help.

This is deliberate friction. It enforces Philosophy A and gives the user agency. We don't auto-resolve by any rule because any auto-resolution could destroy data silently.

#### Events

- `invite.clicked` (invite_id, has_existing_account: true)
- `invite.accept.blocked_duplicate_user` (invite_id, existing_workspace_id)

### 7.4 Sub-path C: recipient's email doesn't match the invite

Someone forwarded the invite link to a different person, or the invitee logged in under a different email before clicking.

**Resolution:** block acceptance with a clear message:

> This invite was for {invite_email}. You're currently signed in as {session_email}. [Sign out] and sign up with {invite_email} to accept.

---

## 8. Flow: invite acceptance — PM

Identical to §7 with three differences:

1. **`invite.role = 'pm'`** on the invite row
2. **`profiles.role = 'pm'`** on the new profile row
3. **Onboarding variant = `pm`** (per `onboarding-spec.md` section 6). PM sees a welcome screen that foreshadows the intake check, then lands on the team's Intake instead of a first Request.

The RPC is the same. The UI copy and post-acceptance routing differ.

---

## 9. Flow: ownership transfer

### 9.1 Trigger

Current owner visits `/settings/workspace` → "Transfer ownership" → selects a new owner from workspace members → confirms.

### 9.2 Preconditions

- Caller is the current owner (`workspace_members.role = 'owner'`)
- New owner is a current workspace member (any access role)
- New owner is not the caller (can't transfer to yourself)

### 9.3 Database writes

Via `transfer_workspace_ownership` RPC (per §4.3). Atomic:

1. `workspace_members` — current owner's row: `role = 'admin'` (or 'member' if `demote_current_owner_to = 'member'`)
2. `workspace_members` — new owner's row: `role = 'owner'`
3. `organizations` — `owner_id = new_owner_user_id`

### 9.4 UI states

1. `/settings/workspace` — "Workspace ownership" section, showing current owner and a "Transfer ownership" link
2. Transfer modal — dropdown of workspace members (excluding self), confirmation checkbox ("I understand I will no longer be the owner of this workspace"), "Transfer" button
3. Confirmation step — second modal with explicit warning: "After transfer, {new_owner_name} will be the owner. You will become an admin and can be removed by the new owner. Are you sure?"
4. Submit → toast: "Ownership transferred to {new_owner_name}"
5. Redirect to `/dashboard` (settings page may no longer be fully accessible if the caller is demoted to member)

### 9.5 Error paths

| Error | Message |
|---|---|
| Caller is not owner | "Only the current owner can transfer ownership." |
| New owner is not a workspace member | "Select a current workspace member." |
| New owner = caller | "Select a different person." |
| No other members exist | "You need at least one other workspace member before you can transfer ownership. [Invite someone first]" |

### 9.6 Events

- `ownership.transfer.attempted` (workspace_id, from_user_id, to_user_id)
- `ownership.transfer.succeeded` (workspace_id, from_user_id, to_user_id)
- `ownership.transfer.failed` (workspace_id, error_code)
- `ownership.transfer.notification.sent` — email to new owner notifying them of the transfer

### 9.7 Notification to the new owner

Resend email, template `ownership_transferred`:

```
Subject: You're now the owner of {workspace_name}

{former_owner_name} transferred ownership of {workspace_name} to you. You now have full control over the workspace, including billing, settings, and member management.

[Open {workspace_name}] → https://lane.app/dashboard
```

---

## 10. Flow: member leaves workspace (self-removal)

### 10.1 Trigger

A member visits `/settings/profile` → "Leave workspace" → confirms.

### 10.2 Preconditions

- Caller is a workspace member with `role != 'owner'`. Owners must transfer ownership first (see §9).

### 10.3 Database writes

`workspace_members` — DELETE the caller's row
`project_members` — DELETE all rows where `user_id = caller`
`profiles` — **KEEP.** Deleting the profile would orphan historical Requests, comments, decision log entries, etc. Instead, mark the profile as "departed":
  - Add `profiles.left_at timestamptz` column (new, add in migration 0014)
  - Set `left_at = now()`
  - All UI surfaces should show a departed user's name with a subtle "(no longer on team)" marker

The auth.users row is untouched. The user still exists in Supabase Auth; they just can't log into this workspace anymore. If they want to delete their Lane account entirely, that's a separate flow (see §12.4).

### 10.4 UI states

1. `/settings/profile` — "Leave workspace" button at the bottom, red
2. Confirmation modal:
   > "Leave {workspace_name}? You'll lose access to all Requests, ideas, and comments. Your historical activity stays — teammates will see your name marked as '(no longer on team)'. You can't undo this."
3. Submit → redirect to a "You've left {workspace_name}" screen with a single CTA: "Sign up for a new workspace" or "Sign out"

### 10.5 Owner attempting to leave

Blocked at step 1 with message: "You're the workspace owner. [Transfer ownership] before leaving."

### 10.6 Events

- `member.self_remove.attempted` (workspace_id, user_id)
- `member.self_remove.succeeded` (workspace_id, user_id)
- `member.self_remove.blocked_owner` (workspace_id, user_id)

---

## 11. Flow: admin removes a member

### 11.1 Trigger

Owner or admin visits `/settings/members` → clicks "Remove" next to a member's name.

### 11.2 Preconditions

- Caller is `owner` or `admin`
- Target is a workspace member with `role != 'owner'`
- Target is not the caller (self-removal is §10)

### 11.3 Database writes

Same as self-removal (§10.3). The only difference is the action is initiated by someone else.

### 11.4 Notification to removed user

Email via Resend:

```
Subject: You've been removed from {workspace_name}

{caller_name} removed you from {workspace_name}. You no longer have access.

If this seems wrong, reach out to {caller_name} directly.
```

### 11.5 Admin removing another admin

Allowed. Admins can remove admins. Only the owner is protected.

### 11.6 Events

- `member.admin_remove.attempted` (workspace_id, actor_user_id, target_user_id)
- `member.admin_remove.succeeded`
- `member.admin_remove.blocked_owner`

---

## 12. Edge cases

### 12.1 Duplicate email signup

**Scenario:** `nikhil@gmail.com` signs up and creates "Exploration." Later, he tries to sign up again with the same email.

**Behavior:** Blocked at §5.5 row 1. Message: "An account with this email already exists. [Sign in]"

No merge, no detection, no warning. Two separate attempts, one succeeds, the second is blocked because Supabase Auth enforces email uniqueness on `auth.users.email`.

### 12.2 Same human, two different emails

**Scenario:** Nikhil signs up as `nikhil@gmail.com`, creates "Exploration." Weeks later, signs up as `nikhil@airtel.com`, creates "Airtel Design Ops."

**Behavior:** Both accounts are created normally. Lane treats them as two separate users. They have two separate workspaces. Nikhil manages the distinction himself (browser profiles, logging in/out). Lane doesn't know they're the same human and doesn't try to know.

**UX note:** there is no signal anywhere that these accounts are related. We do not:

- Detect matching names across accounts
- Warn on signup that "an account with a similar name exists"
- Offer to merge
- Provide a "switch account" UI

This is a deliberate non-feature for v1. See `parking lot` entry "Account merging for same-human multi-email users" for future reconsideration.

### 12.3 Expired invite

**Scenario:** Designer receives an invite, clicks the link 8 days later.

**Behavior:** The `/invite/accept?token={token}` page loads, the RPC checks `expires_at < now()`, and returns an "Invite expired" error.

UI:

> This invite expired on {expires_at}. Ask {inviter_name} to send a new one.

The invite row stays in the database with `accepted_at = NULL` and `expires_at` in the past. A nightly cleanup job deletes invites where `expires_at < now() - interval '30 days'`.

### 12.4 User account deletion

**Scenario:** User wants to fully delete their Lane account (not just leave a workspace).

**Behavior (v1):** Manual. User emails `support@lane.app`, we delete their auth.users row. CASCADE handles the rest:

- `profiles` — deleted (after FK added per §4.5)
- `workspace_members` — deleted
- `project_members` — deleted
- Their historical activity (Requests they created, comments they wrote) — untouched because those tables reference `profiles.id` which is now gone — **this would break FK constraints on those tables.** Need to either (a) make those FKs nullable with ON DELETE SET NULL, or (b) keep a `deleted_users` shadow table.

**Recommendation for v1:** migrate FKs on historical content tables to `ON DELETE SET NULL` where the column becomes `created_by_id`. UI shows "(deleted user)" wherever the reference resolves to null. This is a separate migration, flagged in parking lot. **Not in scope for Week 7.5 build** — just documented here so we know the state.

Self-service account deletion is a post-v1 feature.

### 12.5 Orphaned workspace (owner deleted without transfer)

**Scenario:** Owner deletes their auth.users row (via support or future self-service). The `workspace_members` row for `role = 'owner'` is CASCADE-deleted. The workspace now has no owner.

**v1 behavior:** The workspace is flagged as orphaned. A nightly script:

1. Finds workspaces where no `workspace_members` row has `role = 'owner'`
2. If any `admin` exists in the workspace, auto-promote the earliest-joined admin to owner
3. If no admin exists, flag the workspace in an `orphaned_workspaces` admin view for manual intervention

Email notification to the auto-promoted admin:

> The previous owner of {workspace_name} left Lane. You've been promoted to owner because you were the longest-serving admin.

**If no admins exist:** workspace is effectively dead. v1 doesn't auto-delete (destroying team data without human confirmation is worse than having a dead row). Manual support process picks it up.

**Honesty note — the "earliest-joined admin" rule is tentative.** I chose it for determinism and simplicity, not because user research supports it. Alternatives considered:

- Most recently active admin (requires activity tracking we're not building)
- Voting among remaining admins with a 7-day window (too much UX for an edge case)
- Manual-only, never auto-promote (risks workspaces sitting dead for days)
- Whichever admin logs in first after the orphaning (race-prone, feels arbitrary to the losers)

"Earliest-joined" was the least-bad option given v1 constraints. Validate with the first real customer who hits this scenario. If their feedback suggests a different rule, change it — nothing in this spec architecturally depends on the rule being stable. Log the event in audit_log with enough context (`event_type = 'ownership.auto_promoted'`, `event_data.alternatives`) to audit the decision retrospectively.

### 12.6 Race condition: two admins invite the same email simultaneously

**Scenario:** Admin A and Admin B both invite `newperson@acme.com` at the same second.

**Behavior:** The `invites` table should have a partial unique constraint:

```sql
CREATE UNIQUE INDEX unique_pending_invite_per_email
  ON public.invites (workspace_id, lower(email))
  WHERE accepted_at IS NULL AND expires_at > now();
```

One insert wins, the other fails with a unique violation. The losing admin sees: "An invite is already pending for that email."

### 12.7 Race condition: invite accepted and revoked simultaneously

**Scenario:** Admin clicks "Revoke" on an invite at the same moment the recipient clicks "Accept."

**Behavior:** The `accept_invite_membership` RPC checks `accepted_at IS NULL AND expires_at > now()` inside the transaction. Revoke sets `expires_at = now()`. Whichever transaction commits first wins. If revoke wins, the acceptor sees "Invite expired or revoked." If accept wins, the admin sees the member now in the members list (revoke was a no-op).

### 12.8 Workspace slug collision

**Scenario:** Two signups create workspaces named "Acme" at the same time.

**Behavior:** The slug derivation in signup is `slugify(orgName)`. If the base slug is taken, append a short random suffix: `acme-x7k2`. The user never sees the slug unless they look at the URL. The `organizations.slug` column has a unique constraint.

### 12.9 "Leave workspace" when you're the only member

**Scenario:** Owner created a workspace, invited no one, and now wants to leave.

**Behavior:** Can't leave — they're the owner, and transfer requires another member. Options:

1. Delete the workspace entirely (separate flow, out of scope for Week 7.5)
2. Invite someone, transfer, then leave

UI message when they click "Leave workspace":

> You're the only member of {workspace_name}. To leave, you'd need to transfer ownership to someone else first. Since you're the only one here, you can either:
>
> - [Invite a teammate] and transfer ownership to them before leaving
> - Contact support to delete this workspace entirely

### 12.10 Personal email exploration → team decides to use Lane

**Scenario:** Nikhil explores under `nikhil@gmail.com`. Likes it. Wants his Airtel team in Lane.

**Behavior (per Philosophy A):** Nikhil does not "upgrade" or "migrate" his Gmail workspace. Instead:

1. Signs up separately as `nikhil@airtel.com` → creates "Airtel Design Ops" workspace
2. Invites his team members to that new workspace
3. The `nikhil@gmail.com` workspace is abandoned or used as a personal sandbox; no data migrates

This is the natural consequence of the Philosophy A model. Lane doesn't provide any tooling to migrate a workspace to a new owner email. If Nikhil wants to move data, that's a support request (and v1 won't support it).

**UX nudge (optional, post-v1):** during the personal-email workspace onboarding, show a subtle note: "Using Lane for your team? We recommend signing up with your work email. You can always create a second account later for personal exploration." Don't force it — just nudge.

---

## 13. Error states and messaging

All user-facing errors in this spec should use these voice rules (from `onboarding-spec.md` section 9):

- Direct, not cute
- No exclamation marks
- One-sentence why when the action is blocked
- Treat the user as a professional
- Sentence case
- No emoji

Consolidated error table:

| Situation | Message |
|---|---|
| Duplicate email on signup | An account with this email already exists. [Sign in] |
| Weak password | Password must be at least {minLength} characters. |
| Waitlist not approved | Lane is invite-only right now. [Join the waitlist] |
| Workspace name too long | Workspace name is too long. Keep it under 100 characters. |
| Caller not owner (transfer) | Only the current owner can transfer ownership. |
| New owner not a member | Select a current workspace member. |
| New owner = self | Select a different person. |
| Only member (transfer) | You need at least one other workspace member before you can transfer ownership. [Invite someone first] |
| Owner trying to leave | You're the workspace owner. [Transfer ownership] before leaving. |
| Invite expired | This invite expired on {date}. Ask {inviter} to send a new one. |
| Invite already accepted | This invite was already used. |
| Invite email mismatch | This invite was for {invite_email}. You're signed in as {session_email}. [Sign out] and sign up with the invited address. |
| Duplicate user tries to accept invite | You already have a Lane account at {workspace_name}. Lane supports one workspace per account. To join {new_workspace_name}, leave your current workspace first, or ask {inviter} to invite you at a different email. |
| Duplicate pending invite | An invite is already pending for this email. [Resend] or [Revoke and re-invite] |

---

## 14. Test matrix

Every flow in this spec gets automated coverage. Two layers:

- **pg-tap** — tests run directly against the Postgres test database. Cheap, fast, catch schema and RPC bugs. Runs on every migration.
- **Playwright** — full browser automation against a dev Supabase instance with a throwaway email catcher. Slow, expensive, catch end-to-end flow bugs. Runs pre-deploy and nightly.

### 14.1 pg-tap coverage

One test file per RPC: `test/sql/test_bootstrap_organization_membership.sql`, `test_accept_invite_membership.sql`, `test_transfer_workspace_ownership.sql`.

| Test case | What it asserts |
|---|---|
| Fresh bootstrap creates 3 rows | After RPC: 1 row in `organizations`, 1 in `profiles`, 1 in `workspace_members` with `role = 'owner'` |
| Bootstrap is transactional | If profile insert fails (simulated), no workspace or workspace_member row remains |
| Bootstrap idempotency | Calling twice with the same `user_id` does not create a second workspace (via explicit check) |
| Accept invite creates 2 rows | After RPC: 1 row in `profiles`, 1 in `workspace_members` with `role = 'member'`, invite row updated |
| Accept invite with team creates 3 rows | Plus a `project_members` row with the correct `role` |
| Accept expired invite fails | RPC returns error, no rows inserted |
| Accept already-accepted invite fails | RPC returns error |
| Transfer ownership swaps rows atomically | Old owner → admin, new owner → owner, `organizations.owner_id` updated |
| Transfer to non-member fails | RPC returns error |
| Transfer to self fails | RPC returns error |
| Transfer when caller is not owner fails | RPC returns error |
| Backfill creates workspace_members for existing profiles | Before: profiles exist without workspace_members. After: every profile has a matching workspace_members row. |
| Backfill elects single owner per workspace | No workspace has >1 row with `role = 'owner'` after backfill |
| CASCADE on user delete | Deleting auth.users row removes profile, workspace_members, project_members |
| Invariant: one owner per workspace | Query `SELECT workspace_id FROM workspace_members WHERE role = 'owner' GROUP BY workspace_id HAVING count(*) > 1` returns 0 rows after any RPC |

~20 test cases total. Target: all pass in under 5 seconds.

### 14.2 Playwright coverage

End-to-end flows. Use a test Supabase project, a catch-all email inbox (Mailhog in CI), test user fixtures reset between tests.

| Test | Flow |
|---|---|
| `signup-personal-email.spec.ts` | Sign up with `test+personal@lane.app`, verify workspace created, verify onboarding appears |
| `signup-work-email.spec.ts` | Same flow with a domain-shaped email; verify no difference in behavior |
| `signup-duplicate-email.spec.ts` | Try to sign up with an email that already exists; verify error message |
| `invite-designer-accept.spec.ts` | Owner creates invite → email captured → recipient clicks link → creates account → lands on first Request detail |
| `invite-pm-accept.spec.ts` | Same with `role = 'pm'`; verify PM welcome screen and Intake landing |
| `invite-expired.spec.ts` | Create invite, fast-forward time (or set `expires_at` in past), try to accept; verify error |
| `invite-wrong-email.spec.ts` | Sign in as user A, click invite link for user B; verify email-mismatch error |
| `ownership-transfer.spec.ts` | Owner transfers to admin → new owner receives email → old owner is now admin → old owner cannot transfer again |
| `ownership-transfer-blocked.spec.ts` | Admin tries to transfer ownership; verify permission error |
| `leave-workspace-member.spec.ts` | Member leaves; verify cannot log into the workspace anymore; verify profile marked `left_at`; verify historical Request still shows their name with "(no longer on team)" |
| `leave-workspace-owner.spec.ts` | Owner tries to leave; verify blocked with transfer prompt |
| `admin-removes-member.spec.ts` | Admin removes member; verify email sent to removed user; verify member can't log in |

~12 Playwright tests. Target: all pass in under 5 minutes.

### 14.3 What's NOT tested automatically

- Orphaned workspace auto-promotion script (§12.5) — manually verified post-deploy via a seed + inspection script
- User deletion cascade (§12.4) — manually verified, because v1 has no self-service deletion flow
- Race conditions (§12.6, §12.7) — not easily automatable; covered by DB constraints and tested via pg-tap assertions on the constraints themselves
- Email deliverability — covered by monitoring Resend dashboard, not by Playwright

### 14.4 Test infrastructure needed

- `test/sql/` directory for pg-tap files
- `supabase/test-seed.sql` for deterministic fixtures
- `e2e/auth/` directory for Playwright auth flow tests
- `lib/email/test-inbox.ts` wrapper around Mailhog or Resend test addresses
- CI: `pg-tap` runs on every PR against a fresh Postgres container; Playwright runs on every PR against a fresh Supabase dev project
- Local: `npm run test:sql` and `npm run test:e2e` as shortcuts

**Honest cost accounting — the harness is one-time, the tests are ongoing.** Setup investment is 10-16 hours once (4-6 for pg-tap harness, 6-10 for Playwright). That's the one-time cost I originally named.

What I elided: every future feature adds roughly 1-2 hours of test writing. Over the next 6 months of Lane development (Weeks 8-32), that's 20-40 hours of ongoing test work. **Budget for it explicitly, or tests will rot the first time a feature ships under deadline pressure.** A harness that exists but isn't used is worse than no harness at all — it creates false confidence.

Enterprise-grade means committing to the ongoing cost now, not just the setup cost. Add a standing line item to the weekly ROADMAP budget: "tests for the week's features" — call it 10-20% of feature build time. If you can't afford that, you can't afford the feature.

---

## 15. Build order and estimates — tests-parallel, vertical slices

Sequence matters. **Tests are written alongside the code they verify, not after.** This contradicts the old "tests at the end" pattern. Each step is a vertical slice: write the thing, write the test, verify together, STOP for diff review.

**The rule:** no step is complete until its test is written and passing. If time pressure tempts you to skip a test, stop the session instead — the half-built state is recoverable, the half-tested codebase is not.

### Phase A — Test harnesses first (prerequisite for everything below)

**Rationale:** you cannot write tests-parallel without a harness. Build the harness once, cheaply, before writing the first test.

- **A1.** pg-tap harness setup. Install `pgtap` extension on test DB, wire `npm run test:sql` to run all `test/sql/*.sql` files, add CI step to GitHub Actions against a throwaway Postgres container. Smoke test: one trivial assertion (`SELECT ok(1=1)`). **STOP.** (~3 hours)
- **A2.** Playwright harness setup. Install `@playwright/test`, configure against a dev Supabase project, wire Mailhog (or Resend sandbox) for email interception, create `e2e/fixtures/reset.ts` to clean DB between tests. Smoke test: one browser navigating to `/`. **STOP.** (~4 hours)
- **A3.** Test fixtures. `supabase/test-seed.sql` creates deterministic baseline (one workspace, one owner, one admin, two members, one invite). Used by both pg-tap and Playwright tests. **STOP.** (~1 hour)

Phase A total: ~8 hours. One-time. Every subsequent step depends on this existing.

### Phase B — Schema and RPCs, each with pg-tap tests alongside

Every migration gets its own pg-tap test file. Test file is written *before* the migration runs — a failing test that passes only after the migration is applied is the right pattern. If the test can't be written first (e.g., table doesn't exist yet), write it after the schema but before the behavioral changes.

- **B1.** Migration 0011 — populate workspace_members + `profiles.id → auth.users(id)` FK + `invites.accepted_by` column + `audit_log` table + `waitlist_approvals` table + idempotent bootstrap RPC + idempotent accept RPC. Parallel test: `test/sql/test_migration_0011.sql` — 12 pg-tap assertions covering: idempotency of bootstrap (call twice, no second workspace), idempotency of accept (call twice with same invite, second is no-op), audit rows emitted on every event, workspace_members created with correct role, backfill invariants hold. **STOP: review migration + test together.** (~3 hours build + ~1.5 hours test = 4.5 hours)
- **B2.** Migration 0013 — `invites.team_id`, `invites.team_role`, partial unique index on pending invites. Parallel test: `test/sql/test_migration_0013.sql` — duplicate pending invite rejected, team_id + team_role required together. **STOP.** (~45 min build + ~30 min test = 1.25 hours)
- **B3.** Migration 0014 — `transfer_workspace_ownership` RPC. Parallel test: `test/sql/test_migration_0014.sql` — atomic swap, non-owner caller rejected, non-member target rejected, self-transfer rejected, `organizations.owner_id` mirrored correctly. **STOP.** (~1 hour build + ~1 hour test = 2 hours)
- **B4.** Migration 0015 — `profiles.left_at`, orphaned workspace admin view. Parallel test: `test/sql/test_migration_0015.sql` — view returns workspaces with no owner, view excludes healthy workspaces. **STOP.** (~30 min build + ~30 min test = 1 hour)

Phase B total: ~8.75 hours. After Phase B, the database layer is correct and proven. Every later step can assume the DB does the right thing.

### Phase C — Server actions, each with integration tests

Server actions call RPCs and handle errors. Each action gets an integration test that exercises it against the real DB (via the test harness) without going through the browser. These are Vitest tests, not Playwright — faster than e2e, slower than pg-tap, right layer for action-level logic.

> **ESLint constraint (PR #44):** Server actions must use `withUserSession` / `withUserDb` from `@/db/user` rather than direct `@/db` imports. The ESLint rule introduced in PR #44 warns on direct `@/db` imports in user-facing code (`app/actions`, `app/api` non-cron routes). All four action files (auth, invites, ownership, members) need to follow this convention.

> **Vitest pattern for pure helpers:** Pure helper functions (validation logic, classifier output shaping, URL selection) should have Vitest unit tests matching the pattern established by `test/user-session-url.test.ts`, `test/rate-limit-config.test.ts`, and `test/request-permissions.test.ts`. These sit alongside the integration tests already planned in Phase C. Test harness already exists — no setup needed beyond writing the test files.

- **C1.** Update `app/actions/auth.ts` with idempotent signup + recovery path per §5.6. Parallel test: `test/actions/auth.test.ts` — signup creates 4 rows (auth user, organization, profile, workspace_members), signup with pre-existing profile returns existing workspace, signup with partial state (profile exists, workspace_members missing) heals. Include rate limit tests (6th signup from same IP within hour returns 429). **STOP.** (~1 hour build + ~1.5 hours test = 2.5 hours)
- **C2.** Update `app/actions/invites.ts` with team payload and idempotent accept. Parallel test: team-scoped invite creates project_members row, accepting twice returns success second time, accepting after revoke fails, wrong-email acceptance blocked. **STOP.** (~1 hour build + ~1 hour test = 2 hours)
- **C3.** New `app/actions/ownership.ts` — `transferOwnership`. Parallel test: happy path, only-member rejected, self-transfer rejected, non-owner caller rejected. **STOP.** (~45 min build + ~45 min test = 1.5 hours)
- **C4.** New `app/actions/members.ts` — `leaveWorkspace`, `removeMember`. Parallel test: owner cannot leave, member can leave, admin cannot remove owner, admin can remove admin, profile marked `left_at`. **STOP.** (~1 hour build + ~1 hour test = 2 hours)

Phase C total: ~8 hours.

### Phase D — UI, each with Playwright flow tests

UI components ship with their Playwright flow test. The rule: don't ship a UI surface without a test that clicks through it end-to-end. If the UI is complex enough to need unit tests for individual components (edge-case validation, state transitions), add React Testing Library tests for those specific components — but Playwright coverage of the flow is non-negotiable.

- **D1.** `/settings/members` page — list + invite modal + remove action. Parallel test: `e2e/members.spec.ts` — owner invites designer, invite email received, pending state shown, invite can be revoked, member can be removed. **STOP.** (~2.5 hours build + ~1.5 hours test = 4 hours)
- **D2.** `/settings/workspace` page — ownership transfer. Parallel test: `e2e/ownership.spec.ts` — owner transfers to admin, old owner demoted, new owner email received, old owner can no longer access transfer UI. **STOP.** (~1.5 hours build + ~1 hour test = 2.5 hours)
- **D3.** `/settings/profile` page — leave workspace. Parallel test: `e2e/leave.spec.ts` — member leaves, is signed out, historical Request still shows their name with "(no longer on team)". **STOP.** (~1 hour build + ~45 min test = 1.75 hours)
- **D4.** `/invite/accept` page — full flow including new-user, existing-user-blocked, email-mismatch, expired cases. Parallel test: `e2e/invite-accept.spec.ts` — all four paths. **STOP.** (~2 hours build + ~1.5 hours test = 3.5 hours)
- **D5.** `/signup` page — form + idempotent error UI ("sign in to complete setup"). Parallel test: `e2e/signup.spec.ts` — personal email, work email, duplicate email, partial state recovery on re-signin. **STOP.** (~1.5 hours build + ~1 hour test = 2.5 hours)

Phase D total: ~14.25 hours.

### Phase E — Supporting infrastructure, each with a test

- **E1.** Resend email templates: `invite`, `ownership_transferred`, `member_removed`, `auto_promoted_to_owner`, `signup_notification` (founder alert). Parallel test: a single integration test that calls each template with sample data and asserts the output contains the right substitutions. Smoke test, not comprehensive. **STOP.** (~1.25 hours build + ~30 min test = 1.75 hours)
- **E2.** Cron `/api/cron/cleanup-invites` — delete invites where `expires_at < now() - interval '30 days'`. Parallel test: seed expired invites, run the handler, assert deletion. **STOP.** (~30 min build + ~30 min test = 1 hour)
- **E3.** Cron `/api/cron/resolve-orphans` — auto-promote earliest-joined admin in owner-less workspaces. Parallel test: create orphan state, run handler, assert promotion + audit log row + email sent. Also test the "no admins exist" branch (workspace stays orphaned, admin-view row created). **STOP.** (~1 hour build + ~1 hour test = 2 hours)
- **E4.** Rate limiting on signup, invite-create, invite-accept endpoints (§4.8). Parallel test: each endpoint returns 429 after N requests. **STOP.** (~30 min build + ~45 min test = 1.25 hours)

Phase E total: ~6 hours.

### Phase F — Verification and ship

- **F1.** Manual QA against all 10 flows in §5-§11 on dev environment. Use a checklist derived from the spec. Log every issue found. (~2 hours)
- **F2.** Fix any issues found in F1. If >2 issues, stop and run a retro — something about the spec or the build missed a case. (~1-4 hours, estimate generously)
- **F3.** Production deploy. Run migration 0011 backfill verification queries (§4.1.3) immediately after deploy. If any invariant query returns rows, roll back. (~1 hour)
- **F4.** Smoke test in production: sign up with a test email, invite a second test email, accept, transfer ownership, leave. (~30 min)
- **F5.** Update ROADMAP.md. Mark Week 7.5 complete. Unblock Week 8 GTM. (~30 min)

Phase F total: ~5-8 hours.

### 15.1 Total estimate

| Phase | Purpose | Hours |
|---|---|---|
| A — Test harnesses | Prereq for everything | ~8 |
| B — Schema + RPCs with pg-tap | Database layer proven | ~8.75 |
| C — Server actions with integration tests | Action layer proven | ~8 |
| D — UI with Playwright | User-facing flows proven | ~14.25 |
| E — Supporting infra | Emails, crons, rate limits | ~6 |
| F — Verification and ship | Confidence + deploy | ~5-8 |
| **Total** | | **~50-54 hours** |

**Honest reality check — this is ~2× the previous estimate (27 hours).** Where the growth came from:

1. Test harness setup (Phase A) was folded as "parallel with tests" in the previous estimate; pulling it out explicitly adds 8 hours
2. Tests-parallel means each of 17 substantive steps gets its own test, which is 30-90 min each on top of the build time
3. Enterprise-grade additions (audit log, waitlist infra, idempotent patterns, rate limiting) add ~3 hours of build and ~2 hours of tests
4. Verification phase (F) is now explicit instead of hand-waved

**Compared to the "Week 7.5 budget of 10-15 hours":** that budget was fiction. It assumed a trivial bug-fix. The real scope is "close the P0 blocker at enterprise grade with test coverage," which is a week-of-focused-work project.

**How to actually execute this at 15 hrs/week:**

- Week 7.5a: Phase A + Phase B (~17 hours) → 1.5 weeks
- Week 7.5b: Phase C + Phase D first two items (~12 hours) → ~1 week
- Week 7.5c: Phase D remainder + Phase E (~14 hours) → ~1 week
- Week 7.5d: Phase F (~5-8 hours) → half a week

**Total: ~4 weeks of calendar time at 15 hrs/week.** This pushes Week 8 GTM to late May. That is the honest cost of enterprise-grade user flow foundation.

**The only cut that makes sense if the timeline is unacceptable:** defer Playwright (Phase D tests) to a post-launch hardening session. That saves ~6 hours (the tests themselves, not the UI builds). pg-tap stays non-negotiable — it's the safety net for the database layer where silent bugs become support fires. Revised total with Playwright deferred: ~44-48 hours, ~3 weeks calendar. Ship Week 8 GTM mid-May.

**My recommendation:** do not defer Playwright. You told me "enterprise-grade, Linear/Figma-scale." Playwright on auth flows is table stakes at that bar. The timeline cost is real but the alternative — shipping auth flows to paying customers without end-to-end test coverage — is worse.

### 15.2 Risk register

Things that could blow the estimate up. Watch for these during build:

- **Supabase Auth quirks on idempotent retry** — if `auth.signUp` behaves weirdly when called twice for the same email (it should return an error but the error shape varies by version), §5.6 recovery path needs adjustment. Budget 1-2 hours for this discovery.
- **`supabase.auth.admin.deleteUser` not needed** — we removed it from the spec, but if we accidentally keep it in the action code, it's a risk vector. Grep after C1 to confirm.
- **RLS policies for `audit_log`** — getting append-only right is fiddly. Budget 1 hour extra in B1.
- **Playwright + Mailhog in CI** — email interception in CI can be flaky. Budget 1-2 hours extra in A2 if you hit container networking issues.
- **Production backfill** — at current scale (<10 profiles) this is trivial. If the dev/staging environments have accumulated test data unexpectedly, the "collapse multi-owner" step may surface more conflicts than anticipated. Pre-check with: `SELECT org_id, count(*) FROM profiles WHERE role IN ('lead','admin') GROUP BY org_id HAVING count(*) > 1;` before deploy.

### 15.3 Session log pattern

Per WORKING-RULES.md, after every shipped step, update `docs/ROADMAP.md` with: commit hash, actual hours, any deviations from spec, any parking lot items surfaced. This is the difference between a spec that guided the work and a spec that got ignored.

If 27 feels too steep, the cut to make is Playwright (defer to a separate post-Week-8 session) — pg-tap alone catches 80% of the bugs this spec is designed to prevent.

---

## 16. What's explicitly NOT in this spec

Things deliberately rejected for v1. Do not re-open without explicit discussion.

### 16.1 Philosophy B (multi-workspace)

A user belonging to multiple workspaces. The rationale for rejection:

1. Lane's value compounds within one team over time (weekly digests, PM calibration, team health) — multi-workspace dilutes this
2. Linear and Figma both default to single-workspace for individual users; multi-workspace is an escape valve, not the primary flow
3. The schema already supports it structurally (join table exists); if the customer evidence demands it later, the migration path is cheap (drop `profiles.org_id`, enforce multi-row-per-user in `workspace_members`, add a workspace switcher UI)
4. Not doing it now saves an entire layer of session state, RLS complexity, and UX decisions

**Trigger for reconsideration:** 3+ customers explicitly request multi-workspace within the first 6 months, or acquisition conversations surface it as a blocker.

### 16.2 Account merging

Combining two Lane accounts (same human, different emails) into one. Complex, data-destructive, low-demand. Handled manually via support if it comes up.

### 16.3 Domain-based auto-join

Like Figma's domain capture — "anyone with an `@acme.com` email auto-joins Acme's workspace." Not built because:

1. Requires domain verification infrastructure (MX records, verification tokens)
2. Creates security edge cases (what about ex-employees whose email is still active?)
3. Not requested by any stated ICP persona

Deferred to v2+ when enterprise customers ask for it.

### 16.4 SSO / SCIM

Enterprise auth. Supabase Auth supports it natively but integrating with customer IdPs is a significant project. Post-Series-A.

### 16.5 True anonymous sandbox

"Try Lane without signing up" — no auth, no workspace, fake data. A legitimate feature but orthogonal to this spec. A possible post-launch acquisition tactic.

### 16.6 Self-service account deletion

Users deleting their own auth.users row. Requires handling of created_by references on historical content (Requests, comments, etc.), which needs a separate migration to make those FKs nullable. Manual via support for v1.

### 16.7 Workspace deletion

Owner deleting the workspace entirely. Separate spec. Not needed for Week 7.5's P0 fix.

---

## 17. How this spec maps to ROADMAP.md

This spec supersedes the Week 7.5 outline in `docs/ROADMAP.md`. Week 7.5 expands into four sub-weeks (7.5a-d) totaling ~50-54 hours at enterprise grade with tests-parallel sequencing.

Update ROADMAP.md to replace the Week 7.5 checklist with:

```
Week 7.5a — Test harness + database foundation (~17 hours)
- [ ] A1. pg-tap harness setup + smoke test
- [ ] A2. Playwright harness setup + smoke test
- [ ] A3. Test fixtures (supabase/test-seed.sql)
- [ ] B1. Migration 0011 (workspace_members + FK + audit_log + waitlist + idempotent RPCs) + pg-tap
- [ ] B2. Migration 0012 (invite team scoping + unique pending index) + pg-tap
- [ ] B3. Migration 0013 (transfer_workspace_ownership RPC) + pg-tap
- [ ] B4. Migration 0014 (profiles.left_at + orphan view) + pg-tap

Week 7.5b — Server actions + first UI surfaces (~12 hours)
- [ ] C1. app/actions/auth.ts (idempotent signup + recovery) + integration tests
- [ ] C2. app/actions/invites.ts (team payload + idempotent accept) + integration tests
- [ ] C3. app/actions/ownership.ts (transferOwnership) + integration tests
- [ ] C4. app/actions/members.ts (leave + remove) + integration tests

Week 7.5c — UI + supporting infrastructure (~14 hours)
- [ ] D1. /settings/members + Playwright
- [ ] D2. /settings/workspace + Playwright
- [ ] D3. /settings/profile + Playwright
- [ ] D4. /invite/accept + Playwright
- [ ] D5. /signup + Playwright
- [ ] E1. Resend templates (5 new) + smoke test
- [ ] E2. Cron cleanup-invites + test
- [ ] E3. Cron resolve-orphans + test
- [ ] E4. Rate limiting (signup, invite-create, invite-accept) + test

Week 7.5d — Verification + ship (~5-8 hours)
- [ ] F1. Manual QA against the 10 flows in spec §5-§11
- [ ] F2. Fix issues found in F1 (budget 1-4 hours generously)
- [ ] F3. Production deploy with invariant verification queries
- [ ] F4. Production smoke test (full signup→invite→transfer→leave cycle)
- [ ] F5. Update ROADMAP.md — mark Week 7.5 complete, unblock Week 8

Parallel work (do in parking-lot session before 7.5d):
- [ ] Update docs/onboarding-spec.md §2 — remove "waitlist for 90 days" stale claim
- [ ] Update docs/WORKING-RULES.md — note idempotent RPC pattern as Lane's standard
```

Also update the "Next session" pointer in ROADMAP.md to point at Week 7.5a step A1.

---

*Last updated: April 19, 2026. v2 enterprise-grade rewrite: idempotent RPCs, audit log, waitlist infra, rate limiting, tests-parallel build order. Supersedes v1 and the Week 7.5 outline in ROADMAP.md. Next: execute the build order starting with Phase A (test harnesses) in §15.*
