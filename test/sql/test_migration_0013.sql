-- =========================================================================
-- test_migration_0013.sql — pg-tap assertions for migration 0013
-- =========================================================================
-- Purpose: verify migration 0013_b2_invite_team_scoping applied correctly.
-- Covers:
--   schema shape (new invites columns team_id, team_role),
--   unique partial index on (email, org_id) WHERE accepted_at IS NULL,
--   FK invites.team_id → projects.id ON DELETE CASCADE,
--   RPC behavior: Path C INSERT (team-scoped), workspace-only (no INSERT),
--   audit_log event_data key shape (Pattern ii — conditional team_id key),
--   unique index enforcement (blocks dup pending, allows post-accept),
--   idempotency: double-accept doesn't double-insert project_members.
--
-- Run: npm run test:sql
--
-- Isolation: BEGIN ... ROLLBACK wraps the whole file. Synthetic data
-- seeded per test function with fresh gen_random_uuid()s — no cross-test
-- contamination within the file, no effect on lane dev state.
--
-- Composition notes:
--   - 5 direct-helper assertions (#1-4 + #6); 10 function-wrapped
--     assertions (#5, #7-15) using the CREATE FUNCTION RETURNS SETOF
--     TEXT + RETURN NEXT ok(...) pattern from ccdf703.
--   - SQL identifiers verified via information_schema probe before
--     composition (column-name verification step 5a). invites uses
--     team_id as the column name; project_members uses project_id for
--     the same conceptual reference — the RPC bridges this asymmetry.
--   - Test functions use prefixed local vars (t_user_id, t_org_id,
--     etc.) to avoid shadowing column names in SELECT WHERE clauses.
--   - Path C contract (decision locked 2026-04-23): project_members
--     INSERT sets team_role, leaves role at default 'member'. Tests
--     assert team_role explicitly; role is not inspected.
--   - plan(15).
-- =========================================================================

BEGIN;

SELECT plan(15);

-- =========================================================================
-- 1-4. Schema shape: new columns team_id (uuid) + team_role (team_role enum)
-- =========================================================================

SELECT has_column('public', 'invites', 'team_id',
  'invites.team_id column exists');
SELECT col_type_is('public', 'invites', 'team_id', 'uuid',
  'invites.team_id is uuid');
SELECT has_column('public', 'invites', 'team_role',
  'invites.team_role column exists');
SELECT col_type_is('public', 'invites', 'team_role', 'team_role',
  'invites.team_role is team_role enum');

-- =========================================================================
-- 5. Both new columns are nullable (workspace-only invites leave both NULL)
-- =========================================================================

CREATE OR REPLACE FUNCTION test_05_new_cols_nullable() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  team_id_null boolean;
  team_role_null boolean;
BEGIN
  SELECT is_nullable = 'YES' INTO team_id_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invites'
      AND column_name = 'team_id';
  SELECT is_nullable = 'YES' INTO team_role_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invites'
      AND column_name = 'team_role';
  RETURN NEXT ok(team_id_null AND team_role_null,
    'invites.team_id and invites.team_role are both nullable');
END $$;

SELECT * FROM test_05_new_cols_nullable();

-- =========================================================================
-- 6. Unique partial index exists on (email, org_id)
-- =========================================================================

SELECT has_index('public', 'invites', 'invites_unique_pending_per_email_org',
  'invites_unique_pending_per_email_org index exists');

-- =========================================================================
-- 7. Index is UNIQUE and partial with predicate accepted_at IS NULL
-- =========================================================================

CREATE OR REPLACE FUNCTION test_07_index_is_unique_partial() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  idx_def text;
BEGIN
  SELECT indexdef INTO idx_def
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'invites'
      AND indexname = 'invites_unique_pending_per_email_org';
  RETURN NEXT ok(
    idx_def LIKE '%UNIQUE INDEX%'
      AND idx_def LIKE '%WHERE (accepted_at IS NULL)%',
    'index is UNIQUE partial with predicate accepted_at IS NULL'
  );
END $$;

SELECT * FROM test_07_index_is_unique_partial();

-- =========================================================================
-- 8. FK invites.team_id → projects.id with ON DELETE CASCADE
-- =========================================================================

CREATE OR REPLACE FUNCTION test_08_team_id_fk() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  fk_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO fk_def
    FROM pg_constraint
    WHERE contype = 'f' AND conrelid = 'public.invites'::regclass
      AND conname = 'invites_team_id_projects_id_fk';
  RETURN NEXT ok(
    fk_def LIKE '%REFERENCES projects(id)%'
      AND fk_def LIKE '%ON DELETE CASCADE%',
    'invites.team_id FK to projects.id with ON DELETE CASCADE'
  );
END $$;

SELECT * FROM test_08_team_id_fk();

-- =========================================================================
-- 9. Team-scoped accept: RPC inserts project_members row with team_role set
-- =========================================================================

CREATE OR REPLACE FUNCTION test_09_team_scoped_accept() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  t_user_id uuid := gen_random_uuid();
  t_org_id uuid := gen_random_uuid();
  t_team_id uuid := gen_random_uuid();
  t_inviter_id uuid := gen_random_uuid();
  pm_count integer;
  pm_team_role public.team_role;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (t_user_id, 'b2-test-09@example.com'),
    (t_inviter_id, 'inviter-09@example.com');
  INSERT INTO public.organizations (id, name, slug)
    VALUES (t_org_id, 'Test 09', 'b2-test-09');
  INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (t_inviter_id, t_org_id, 'Inviter 09',
            'inviter-09@example.com', 'lead');
  INSERT INTO public.projects (id, org_id, name, created_by)
    VALUES (t_team_id, t_org_id, 'Team 09', t_inviter_id);
  INSERT INTO public.invites
    (org_id, email, token, role, invited_by, expires_at, team_id, team_role)
    VALUES (t_org_id, 'b2-test-09@example.com', 'b2-test-09-token',
            'designer', t_inviter_id, now() + interval '1 day',
            t_team_id, 'pm');

  PERFORM public.accept_invite_membership(
    'b2-test-09-token', t_user_id, 'Test 09', 'b2-test-09@example.com');

  SELECT count(*), max(pm.team_role) INTO pm_count, pm_team_role
    FROM public.project_members pm
    WHERE pm.project_id = t_team_id AND pm.user_id = t_user_id;

  RETURN NEXT ok(
    pm_count = 1 AND pm_team_role = 'pm'::public.team_role,
    'team-scoped accept creates project_members row with team_role=pm'
  );
END $$;

SELECT * FROM test_09_team_scoped_accept();

-- =========================================================================
-- 10. Workspace-only accept: no project_members row inserted
-- =========================================================================

CREATE OR REPLACE FUNCTION test_10_workspace_only_accept() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  t_user_id uuid := gen_random_uuid();
  t_org_id uuid := gen_random_uuid();
  t_inviter_id uuid := gen_random_uuid();
  pm_count integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (t_user_id, 'b2-test-10@example.com'),
    (t_inviter_id, 'inviter-10@example.com');
  INSERT INTO public.organizations (id, name, slug)
    VALUES (t_org_id, 'Test 10', 'b2-test-10');
  INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (t_inviter_id, t_org_id, 'Inviter 10',
            'inviter-10@example.com', 'lead');
  -- team_id and team_role deliberately omitted (both NULL)
  INSERT INTO public.invites (org_id, email, token, role, invited_by, expires_at)
    VALUES (t_org_id, 'b2-test-10@example.com', 'b2-test-10-token',
            'designer', t_inviter_id, now() + interval '1 day');

  PERFORM public.accept_invite_membership(
    'b2-test-10-token', t_user_id, 'Test 10', 'b2-test-10@example.com');

  SELECT count(*) INTO pm_count
    FROM public.project_members pm
    WHERE pm.user_id = t_user_id;

  RETURN NEXT ok(pm_count = 0,
    'workspace-only accept creates no project_members row');
END $$;

SELECT * FROM test_10_workspace_only_accept();

-- =========================================================================
-- 11. Audit log event_data includes team_id key on team-scoped accept
-- =========================================================================

CREATE OR REPLACE FUNCTION test_11_audit_log_team_scoped() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  t_user_id uuid := gen_random_uuid();
  t_org_id uuid := gen_random_uuid();
  t_team_id uuid := gen_random_uuid();
  t_inviter_id uuid := gen_random_uuid();
  has_team_id_key boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (t_user_id, 'b2-test-11@example.com'),
    (t_inviter_id, 'inviter-11@example.com');
  INSERT INTO public.organizations (id, name, slug)
    VALUES (t_org_id, 'Test 11', 'b2-test-11');
  INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (t_inviter_id, t_org_id, 'Inviter 11',
            'inviter-11@example.com', 'lead');
  INSERT INTO public.projects (id, org_id, name, created_by)
    VALUES (t_team_id, t_org_id, 'Team 11', t_inviter_id);
  INSERT INTO public.invites
    (org_id, email, token, role, invited_by, expires_at, team_id, team_role)
    VALUES (t_org_id, 'b2-test-11@example.com', 'b2-test-11-token',
            'designer', t_inviter_id, now() + interval '1 day',
            t_team_id, 'designer');

  PERFORM public.accept_invite_membership(
    'b2-test-11-token', t_user_id, 'Test 11', 'b2-test-11@example.com');

  SELECT (event_data ? 'team_id') INTO has_team_id_key
    FROM public.audit_log
    WHERE actor_user_id = t_user_id AND event_type = 'member.joined'
    ORDER BY created_at DESC LIMIT 1;

  RETURN NEXT ok(has_team_id_key,
    'audit_log event_data includes team_id key on team-scoped accept');
END $$;

SELECT * FROM test_11_audit_log_team_scoped();

-- =========================================================================
-- 12. Audit log event_data omits team_id key on workspace-only accept
-- =========================================================================

CREATE OR REPLACE FUNCTION test_12_audit_log_workspace_only() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  t_user_id uuid := gen_random_uuid();
  t_org_id uuid := gen_random_uuid();
  t_inviter_id uuid := gen_random_uuid();
  has_team_id_key boolean;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (t_user_id, 'b2-test-12@example.com'),
    (t_inviter_id, 'inviter-12@example.com');
  INSERT INTO public.organizations (id, name, slug)
    VALUES (t_org_id, 'Test 12', 'b2-test-12');
  INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (t_inviter_id, t_org_id, 'Inviter 12',
            'inviter-12@example.com', 'lead');
  INSERT INTO public.invites (org_id, email, token, role, invited_by, expires_at)
    VALUES (t_org_id, 'b2-test-12@example.com', 'b2-test-12-token',
            'designer', t_inviter_id, now() + interval '1 day');

  PERFORM public.accept_invite_membership(
    'b2-test-12-token', t_user_id, 'Test 12', 'b2-test-12@example.com');

  SELECT (event_data ? 'team_id') INTO has_team_id_key
    FROM public.audit_log
    WHERE actor_user_id = t_user_id AND event_type = 'member.joined'
    ORDER BY created_at DESC LIMIT 1;

  RETURN NEXT ok(NOT has_team_id_key,
    'audit_log event_data omits team_id key on workspace-only accept');
END $$;

SELECT * FROM test_12_audit_log_workspace_only();

-- =========================================================================
-- 13. Unique partial index blocks duplicate pending invite
-- =========================================================================

CREATE OR REPLACE FUNCTION test_13_unique_index_blocks_dup() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  t_org_id uuid := gen_random_uuid();
  t_email text := 'b2-test-13@example.com';
  blocked boolean := false;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
    VALUES (t_org_id, 'Test 13', 'b2-test-13');
  INSERT INTO public.invites (org_id, email, token, role, expires_at)
    VALUES (t_org_id, t_email, 'b2-test-13-token-1',
            'designer', now() + interval '1 day');

  BEGIN
    INSERT INTO public.invites (org_id, email, token, role, expires_at)
      VALUES (t_org_id, t_email, 'b2-test-13-token-2',
              'designer', now() + interval '1 day');
  EXCEPTION WHEN unique_violation THEN
    blocked := true;
  END;

  RETURN NEXT ok(blocked,
    'unique partial index blocks second pending invite for same (email, org_id)');
END $$;

SELECT * FROM test_13_unique_index_blocks_dup();

-- =========================================================================
-- 14. After first invite accepts, second pending invite allowed
-- =========================================================================

CREATE OR REPLACE FUNCTION test_14_after_accept_second_allowed() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  t_org_id uuid := gen_random_uuid();
  t_email text := 'b2-test-14@example.com';
  pending_count integer;
  accepted_count integer;
BEGIN
  INSERT INTO public.organizations (id, name, slug)
    VALUES (t_org_id, 'Test 14', 'b2-test-14');
  INSERT INTO public.invites (org_id, email, token, role, expires_at)
    VALUES (t_org_id, t_email, 'b2-test-14-token-1',
            'designer', now() + interval '1 day');

  -- Simulate acceptance of invite #1 via direct UPDATE (testing the index,
  -- not the RPC). Partial index no longer covers this row after update.
  UPDATE public.invites SET accepted_at = now()
    WHERE token = 'b2-test-14-token-1';

  -- Invite #2 pending: should succeed
  INSERT INTO public.invites (org_id, email, token, role, expires_at)
    VALUES (t_org_id, t_email, 'b2-test-14-token-2',
            'designer', now() + interval '1 day');

  SELECT count(*) FILTER (WHERE accepted_at IS NULL),
         count(*) FILTER (WHERE accepted_at IS NOT NULL)
    INTO pending_count, accepted_count
    FROM public.invites
    WHERE org_id = t_org_id AND email = t_email;

  RETURN NEXT ok(pending_count = 1 AND accepted_count = 1,
    'partial index allows new pending invite after first is accepted');
END $$;

SELECT * FROM test_14_after_accept_second_allowed();

-- =========================================================================
-- 15. Double-accept team-scoped invite inserts only one project_members row
-- =========================================================================

CREATE OR REPLACE FUNCTION test_15_double_accept_idempotent() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  t_user_id uuid := gen_random_uuid();
  t_org_id uuid := gen_random_uuid();
  t_team_id uuid := gen_random_uuid();
  t_inviter_id uuid := gen_random_uuid();
  pm_count integer;
BEGIN
  INSERT INTO auth.users (id, email) VALUES
    (t_user_id, 'b2-test-15@example.com'),
    (t_inviter_id, 'inviter-15@example.com');
  INSERT INTO public.organizations (id, name, slug)
    VALUES (t_org_id, 'Test 15', 'b2-test-15');
  INSERT INTO public.profiles (id, org_id, full_name, email, role)
    VALUES (t_inviter_id, t_org_id, 'Inviter 15',
            'inviter-15@example.com', 'lead');
  INSERT INTO public.projects (id, org_id, name, created_by)
    VALUES (t_team_id, t_org_id, 'Team 15', t_inviter_id);
  INSERT INTO public.invites
    (org_id, email, token, role, invited_by, expires_at, team_id, team_role)
    VALUES (t_org_id, 'b2-test-15@example.com', 'b2-test-15-token',
            'designer', t_inviter_id, now() + interval '1 day',
            t_team_id, 'designer');

  -- Double-call: second hits the accepted_at idempotency guard and
  -- short-circuits before reaching Path C. Even if it didn't, the
  -- ON CONFLICT (project_id, user_id) would prevent a duplicate.
  PERFORM public.accept_invite_membership(
    'b2-test-15-token', t_user_id, 'Test 15', 'b2-test-15@example.com');
  PERFORM public.accept_invite_membership(
    'b2-test-15-token', t_user_id, 'Test 15', 'b2-test-15@example.com');

  SELECT count(*) INTO pm_count
    FROM public.project_members pm
    WHERE pm.project_id = t_team_id AND pm.user_id = t_user_id;

  RETURN NEXT ok(pm_count = 1,
    'double-accept inserts only one project_members row');
END $$;

SELECT * FROM test_15_double_accept_idempotent();

SELECT * FROM finish();
ROLLBACK;
