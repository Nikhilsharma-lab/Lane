-- =========================================================================
-- test_migration_0011.sql — pg-tap assertions for migration 0011
-- =========================================================================
-- Purpose: verify migration 0011_steady_fixer applied correctly. Covers
--   schema shape (tables, columns, CHECK, RLS enablement),
--   cross-schema FKs to auth.users,
--   audit_log append-only REVOKE,
--   RPC idempotency + check order + composition decisions,
--   spec §4.1.3 backfill invariants against synthetic data.
--
-- Run: npm run test:sql (applies to lane dev via DIRECT_DATABASE_URL).
--
-- Isolation: BEGIN ... ROLLBACK wraps the whole file. Synthetic data for
-- backfill invariant tests is seeded, tested, rolled back — lane dev state
-- is unaffected.
--
-- Composition notes:
--   - 5 cross-schema FKs tested (the 1 same-schema FK from Drizzle generate
--     is not tested here — covered indirectly by migration success).
--   - REVOKE assertion is REQUIRED, not optional — it's the sole enforcer
--     of audit_log append-only against service_role.
--   - Backfill invariant tests use inline copies of the §4.1.3 backfill
--     and collapse SQL. Any edit to 0011's backfill must also update the
--     inline copies here — a deliberate forcing function.
--   - auth.users seeds assume the test role (postgres) has INSERT
--     privilege, which lane dev's connection user does (verified via
--     has_table_privilege probe during STOP D recon).
--   - plan(19): two column-existence assertions for invites.accepted_by
--     (has_column + col_type_is) + six DO-block PERFORM ok assertions
--     (items 13-18). See STOP D deviation note from prompt's plan(18).
-- =========================================================================

BEGIN;

SELECT plan(19);

-- =========================================================================
-- 1-2. Table existence (audit_log, waitlist_approvals)
-- =========================================================================

SELECT has_table('public', 'audit_log', 'audit_log table exists');
SELECT has_table('public', 'waitlist_approvals', 'waitlist_approvals table exists');

-- =========================================================================
-- 3-4. Column existence + type (invites.accepted_by)
-- =========================================================================

SELECT has_column('public', 'invites', 'accepted_by',
  'invites.accepted_by column exists');

SELECT col_type_is('public', 'invites', 'accepted_by', 'uuid',
  'invites.accepted_by is uuid');

-- =========================================================================
-- 5. CHECK constraint on waitlist_approvals.approval_source
-- =========================================================================

SELECT throws_ok(
  $$ INSERT INTO public.waitlist_approvals (email, approval_source)
     VALUES ('test-bogus-source@example.com', 'not_a_valid_source') $$,
  '23514',
  NULL,
  'CHECK rejects non-enumerated approval_source values'
);

-- =========================================================================
-- 6-7. RLS enabled on both new tables
-- =========================================================================

SELECT is(
  (SELECT relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'audit_log'),
  true,
  'RLS enabled on audit_log'
);

SELECT is(
  (SELECT relrowsecurity FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'waitlist_approvals'),
  true,
  'RLS enabled on waitlist_approvals'
);

-- =========================================================================
-- 8-12. Cross-schema FKs to auth.users (5 authored raw in STOP C.1)
-- =========================================================================

SELECT fk_ok('public', 'profiles', 'id', 'auth', 'users', 'id',
  'profiles.id FK -> auth.users.id');
SELECT fk_ok('public', 'workspace_members', 'user_id', 'auth', 'users', 'id',
  'workspace_members.user_id FK -> auth.users.id');
SELECT fk_ok('public', 'invites', 'accepted_by', 'auth', 'users', 'id',
  'invites.accepted_by FK -> auth.users.id');
SELECT fk_ok('public', 'audit_log', 'actor_user_id', 'auth', 'users', 'id',
  'audit_log.actor_user_id FK -> auth.users.id');
SELECT fk_ok('public', 'waitlist_approvals', 'approved_by', 'auth', 'users', 'id',
  'waitlist_approvals.approved_by FK -> auth.users.id');

-- =========================================================================
-- 13. audit_log append-only REVOKE
-- =========================================================================
-- Verifies that authenticated, anon, and service_role all lack UPDATE and
-- DELETE privileges on audit_log (keeping INSERT/SELECT per spec §4.6).

SELECT is(
  (SELECT bool_or(
    has_table_privilege(r.rolname, 'public.audit_log', 'UPDATE')
    OR has_table_privilege(r.rolname, 'public.audit_log', 'DELETE'))
   FROM pg_roles r
   WHERE r.rolname IN ('authenticated', 'anon', 'service_role')),
  false,
  'audit_log append-only: no UPDATE/DELETE for authenticated/anon/service_role'
);

-- =========================================================================
-- 14. bootstrap_organization_membership idempotency
-- =========================================================================
-- Create synthetic auth.users row, call bootstrap twice, verify first call
-- returns profile_created=true, second returns profile_created=false with
-- the same org_id, and exactly one workspace_members row exists.

CREATE OR REPLACE FUNCTION test_14_bootstrap_idempotency() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  test_uid uuid := gen_random_uuid();
  first_org uuid;
  second_org uuid;
  first_created boolean;
  second_created boolean;
  wm_count int;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password,
                           instance_id, aud, role,
                           email_confirmed_at, created_at, updated_at)
  VALUES (test_uid, 'bootstrap-idem-test@example.com', '',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          now(), now(), now());

  SELECT org_id, profile_created INTO first_org, first_created
  FROM public.bootstrap_organization_membership(
    test_uid,
    'Test Workspace Bootstrap Idem',
    'test-ws-bootstrap-idem-' || test_uid::text,
    'Test User',
    'bootstrap-idem-test@example.com'
  );

  SELECT org_id, profile_created INTO second_org, second_created
  FROM public.bootstrap_organization_membership(
    test_uid,
    'Test Workspace Bootstrap Idem',
    'test-ws-bootstrap-idem-' || test_uid::text,
    'Test User',
    'bootstrap-idem-test@example.com'
  );

  SELECT count(*) INTO wm_count
  FROM public.workspace_members
  WHERE user_id = test_uid;

  RETURN NEXT ok(
    first_created = true
    AND second_created = false
    AND first_org = second_org
    AND wm_count = 1,
    'bootstrap_organization_membership is idempotent on repeat call with same args'
  );
END $$;

SELECT * FROM test_14_bootstrap_idempotency();

-- =========================================================================
-- 15. accept_invite_membership check order: expiry fires before accepted_at idempotency
-- =========================================================================
CREATE OR REPLACE FUNCTION test_15_accept_check_order() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  test_uid uuid := gen_random_uuid();
  test_org uuid := gen_random_uuid();
  test_invite_id uuid := gen_random_uuid();
  test_token text := 'test-check-order-token-' || gen_random_uuid()::text;
  err_message text;
BEGIN
  -- Seed org
  INSERT INTO public.organizations (id, name, slug) VALUES
    (test_org, 'Test Org Check Order', 'test-org-check-order-' || test_org::text);

  -- Seed invite: ALREADY ACCEPTED, EXPIRED, with matching email.
  -- This is the discriminating fixture:
  --   OLD order (NOT FOUND -> accepted_at -> expiry -> email):
  --     first raise is 'This invite has already been used'
  --   NEW order (NOT FOUND -> expiry -> email -> idempotency):
  --     first raise is 'This invite has expired...'
  -- Asserting 'expired' proves expiry fires before the accepted_at
  -- idempotency check — which is the specific reorder in 0011.
  INSERT INTO public.invites (id, org_id, email, token, role,
                               expires_at, accepted_at, created_at)
  VALUES (test_invite_id, test_org, 'co-invitee@example.com', test_token,
          'designer',
          now() - interval '1 day',    -- expired
          now() - interval '12 hours', -- previously accepted
          now() - interval '3 days');

  -- Seed user with MATCHING email (isolates expiry-vs-idempotency)
  INSERT INTO auth.users (id, email, encrypted_password,
                           instance_id, aud, role,
                           email_confirmed_at, created_at, updated_at)
  VALUES (test_uid, 'co-invitee@example.com', '',
          '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', now(), now(), now());

  -- Call accept; expect expiry error (proves expiry fires before
  -- the accepted_at idempotency check per 0011's new order)
  BEGIN
    PERFORM public.accept_invite_membership(
      test_token, test_uid, 'Co Invitee', 'co-invitee@example.com'
    );
    err_message := NULL;
  EXCEPTION WHEN OTHERS THEN
    err_message := SQLERRM;
  END;

  RETURN NEXT ok(
    err_message LIKE '%expired%',
    format('accept_invite check order: expiry raised before accepted_at idempotency (got: %L)', err_message)
  );
END $$;

SELECT * FROM test_15_accept_check_order();

-- =========================================================================
-- 16. accept_invite_membership idempotency: double-click returns same org
-- =========================================================================

CREATE OR REPLACE FUNCTION test_16_accept_idempotency() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  test_uid uuid := gen_random_uuid();
  test_org uuid := gen_random_uuid();
  test_invite_id uuid := gen_random_uuid();
  test_token text := 'test-idem-token-' || gen_random_uuid()::text;
  first_org uuid;
  second_org uuid;
  first_created boolean;
  second_created boolean;
  wm_count int;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (test_org, 'Test Org Idem', 'test-org-idem-' || test_org::text);

  INSERT INTO public.invites (id, org_id, email, token, role, expires_at, created_at)
  VALUES (test_invite_id, test_org, 'idem-invitee@example.com', test_token,
          'designer', now() + interval '7 days', now());

  INSERT INTO auth.users (id, email, encrypted_password,
                           instance_id, aud, role,
                           email_confirmed_at, created_at, updated_at)
  VALUES (test_uid, 'idem-invitee@example.com', '',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          now(), now(), now());

  SELECT org_id, profile_created INTO first_org, first_created
  FROM public.accept_invite_membership(test_token, test_uid,
    'Idem Invitee', 'idem-invitee@example.com');

  SELECT org_id, profile_created INTO second_org, second_created
  FROM public.accept_invite_membership(test_token, test_uid,
    'Idem Invitee', 'idem-invitee@example.com');

  SELECT count(*) INTO wm_count
  FROM public.workspace_members
  WHERE user_id = test_uid;

  RETURN NEXT ok(
    first_org = second_org
    AND first_created = true
    AND second_created = false
    AND wm_count = 1,
    'accept_invite_membership is idempotent on double-click'
  );
END $$;

SELECT * FROM test_16_accept_idempotency();

-- =========================================================================
-- 17. accept_invite_membership workspace_members.role = 'member'
-- =========================================================================
-- Composition decision verification (STOP C.2b Flag 3b option iii):
-- invite-accepted signups land as 'member' regardless of invites.role text.
-- Invite is created with 'admin' text role to prove 'member' is hardcoded.

CREATE OR REPLACE FUNCTION test_17_accept_role_member() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  test_uid uuid := gen_random_uuid();
  test_org uuid := gen_random_uuid();
  test_invite_id uuid := gen_random_uuid();
  test_token text := 'test-role-token-' || gen_random_uuid()::text;
  actual_role public.workspace_role;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (test_org, 'Test Org Role', 'test-org-role-' || test_org::text);

  INSERT INTO public.invites (id, org_id, email, token, role, expires_at, created_at)
  VALUES (test_invite_id, test_org, 'role-invitee@example.com', test_token,
          'admin', now() + interval '7 days', now());

  INSERT INTO auth.users (id, email, encrypted_password,
                           instance_id, aud, role,
                           email_confirmed_at, created_at, updated_at)
  VALUES (test_uid, 'role-invitee@example.com', '',
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          now(), now(), now());

  PERFORM public.accept_invite_membership(test_token, test_uid,
    'Role Invitee', 'role-invitee@example.com');

  SELECT role INTO actual_role
  FROM public.workspace_members
  WHERE user_id = test_uid AND workspace_id = test_org;

  RETURN NEXT ok(
    actual_role = 'member'::public.workspace_role,
    format('invite-accepted workspace_members.role is ''member'' (got: %L)', actual_role)
  );
END $$;

SELECT * FROM test_17_accept_role_member();

-- =========================================================================
-- 18. Backfill invariant A: every profile has a workspace_members row
-- =========================================================================
-- Seed 3 profiles in 1 workspace (no corresponding workspace_members),
-- run the inline backfill SQL (copied from §4.1.3), assert invariant.

CREATE OR REPLACE FUNCTION test_18_backfill_invariant_a() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  test_org uuid := gen_random_uuid();
  uid1 uuid := gen_random_uuid();
  uid2 uuid := gen_random_uuid();
  uid3 uuid := gen_random_uuid();
  orphan_count int;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (test_org, 'Test Org Backfill', 'test-org-backfill-' || test_org::text);

  INSERT INTO auth.users (id, email, encrypted_password, instance_id, aud, role,
                           email_confirmed_at, created_at, updated_at)
  VALUES
    (uid1, 'bf1@example.com', '', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', now(), now() - interval '3 days', now()),
    (uid2, 'bf2@example.com', '', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', now(), now() - interval '2 days', now()),
    (uid3, 'bf3@example.com', '', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', now(), now() - interval '1 day', now());

  INSERT INTO public.profiles (id, org_id, full_name, email, role, created_at)
  VALUES
    (uid1, test_org, 'BF User 1', 'bf1@example.com', 'lead', now() - interval '3 days'),
    (uid2, test_org, 'BF User 2', 'bf2@example.com', 'designer', now() - interval '2 days'),
    (uid3, test_org, 'BF User 3', 'bf3@example.com', 'designer', now() - interval '1 day');

  DELETE FROM public.workspace_members WHERE workspace_id = test_org;

  -- Backfill (inline copy of §4.1.3 single-query path, scoped to this org)
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
  SELECT
    p.org_id,
    p.id,
    CASE
      WHEN p.role IN ('lead', 'admin') THEN 'owner'::public.workspace_role
      ELSE 'member'::public.workspace_role
    END,
    NULL,
    p.created_at
  FROM public.profiles p
  LEFT JOIN public.workspace_members wm
    ON wm.user_id = p.id AND wm.workspace_id = p.org_id
  WHERE wm.user_id IS NULL
    AND p.org_id = test_org
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  SELECT count(*) INTO orphan_count
  FROM public.profiles p
  LEFT JOIN public.workspace_members wm
    ON wm.user_id = p.id AND wm.workspace_id = p.org_id
  WHERE p.org_id = test_org AND wm.user_id IS NULL;

  RETURN NEXT ok(
    orphan_count = 0,
    format('backfill invariant A: no profiles without workspace_members (got %s orphans)', orphan_count)
  );
END $$;

SELECT * FROM test_18_backfill_invariant_a();

-- =========================================================================
-- 19. Backfill invariant B: exactly one owner per workspace (collapse)
-- =========================================================================
-- Seed 2 'lead' profiles in same org. Backfill creates 2 owners. Collapse
-- demotes the later-joined one to admin. Assert exactly 1 owner remains.

CREATE OR REPLACE FUNCTION test_19_backfill_invariant_b() RETURNS SETOF TEXT
LANGUAGE plpgsql AS $$
DECLARE
  test_org uuid := gen_random_uuid();
  uid_early uuid := gen_random_uuid();
  uid_late uuid := gen_random_uuid();
  owner_count int;
  early_role public.workspace_role;
  late_role public.workspace_role;
BEGIN
  INSERT INTO public.organizations (id, name, slug) VALUES
    (test_org, 'Test Org Collapse', 'test-org-collapse-' || test_org::text);

  INSERT INTO auth.users (id, email, encrypted_password, instance_id, aud, role,
                           email_confirmed_at, created_at, updated_at)
  VALUES
    (uid_early, 'early-lead@example.com', '', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', now(), now() - interval '10 days', now()),
    (uid_late, 'late-lead@example.com', '', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', now(), now() - interval '5 days', now());

  INSERT INTO public.profiles (id, org_id, full_name, email, role, created_at)
  VALUES
    (uid_early, test_org, 'Early Lead', 'early-lead@example.com', 'lead',
     now() - interval '10 days'),
    (uid_late, test_org, 'Late Lead', 'late-lead@example.com', 'lead',
     now() - interval '5 days');

  DELETE FROM public.workspace_members WHERE workspace_id = test_org;

  -- Backfill (both map to 'owner' because role IN ('lead','admin'))
  INSERT INTO public.workspace_members (workspace_id, user_id, role, invited_by, created_at)
  SELECT
    p.org_id, p.id,
    CASE WHEN p.role IN ('lead','admin') THEN 'owner'::public.workspace_role
         ELSE 'member'::public.workspace_role END,
    NULL, p.created_at
  FROM public.profiles p
  LEFT JOIN public.workspace_members wm
    ON wm.user_id = p.id AND wm.workspace_id = p.org_id
  WHERE wm.user_id IS NULL AND p.org_id = test_org
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  -- Collapse (inline copy of §4.1.3 collapse, scoped to this org)
  WITH ranked_owners AS (
    SELECT workspace_id, user_id, created_at,
      ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at ASC) AS rn
    FROM public.workspace_members
    WHERE role = 'owner'::public.workspace_role
      AND workspace_id = test_org
  )
  UPDATE public.workspace_members
  SET role = 'admin'::public.workspace_role
  FROM ranked_owners
  WHERE workspace_members.workspace_id = ranked_owners.workspace_id
    AND workspace_members.user_id = ranked_owners.user_id
    AND ranked_owners.rn > 1;

  SELECT count(*) INTO owner_count
  FROM public.workspace_members
  WHERE workspace_id = test_org AND role = 'owner'::public.workspace_role;

  SELECT role INTO early_role FROM public.workspace_members
  WHERE workspace_id = test_org AND user_id = uid_early;
  SELECT role INTO late_role FROM public.workspace_members
  WHERE workspace_id = test_org AND user_id = uid_late;

  RETURN NEXT ok(
    owner_count = 1
    AND early_role = 'owner'::public.workspace_role
    AND late_role = 'admin'::public.workspace_role,
    format('backfill invariant B: multi-owner collapse leaves exactly 1 owner (early=%L, late=%L, owners=%s)',
      early_role, late_role, owner_count)
  );
END $$;

SELECT * FROM test_19_backfill_invariant_b();

SELECT * FROM finish();
ROLLBACK;
