-- supabase/test-seed.sql
--
-- Deterministic test fixture for Lane's user-flow tests.
-- Creates a baseline state per docs/user-flows-spec.md §15 Phase A3:
--   1 workspace, 1 owner, 1 admin, 2 members, 1 pending invite.
--
-- Consumed by:
--   - pg-tap tests (Phase B): tests starting from this baseline assert
--     RPC behavior (transfer ownership, accept invite, leave workspace).
--   - Playwright tests (Phase D): browser-driven flows starting from
--     known users + workspace, e.g., invite-accept journey.
--
-- Schema target: CURRENT db/schema/ state (pre-Phase B).
-- After Phase B migrations 0010-0013 land, this file gets a follow-up
-- to seed audit_log, waitlist_approvals, and team-scoped invites.
--
-- Idempotency: re-runnable. DELETEs target known fixture IDs and
-- @e2e.lane.test emails only — never touches non-test data. INSERTs
-- happen in FK-respecting order (organizations → profiles →
-- workspace_members → invites). DELETEs happen in reverse.
--
-- Application: this file is NOT auto-applied anywhere yet. It is a
-- shared fixture artifact that Phase B/D tests will each decide how
-- and when to apply (manually via psql, via Playwright globalSetup,
-- or via a CI step). See supabase/README.md for the full story.
--
-- Production safety: every fixture row uses test-identifiable values
--   - workspace slug starts with "test-"
--   - all emails end with "@e2e.lane.test"
--   - all UUIDs follow a predictable pattern (see scheme below)
-- The DELETEs here will never collide with real workspace data.
--
-- ── UUID scheme ────────────────────────────────────────────────────
--   00000000-0000-0000-0000-0000000000NN
--   where NN = entity number in the seed:
--     01 = workspace
--     02 = owner profile
--     03 = admin profile
--     04 = member1 profile
--     05 = member2 profile
--     06 = invite
--   Tests can reference fixtures by these known IDs without first
--   querying for them.
-- ───────────────────────────────────────────────────────────────────

BEGIN;

-- ── Idempotent cleanup (reverse FK order) ──────────────────────────
-- All DELETEs scoped by known fixture ID or test email domain.
-- No-op on first run (no matching rows); cleans state on subsequent
-- runs so re-applying never errors on UNIQUE conflicts.

DELETE FROM invites WHERE id = '00000000-0000-0000-0000-000000000006';

DELETE FROM workspace_members
  WHERE workspace_id = '00000000-0000-0000-0000-000000000001';

DELETE FROM profiles
  WHERE id IN (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000005'
  );

DELETE FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001';

-- ── auth.users rows required by 0011's FK ──────────────────────────
-- profiles.id → auth.users(id) CASCADE FK landed in migration 0011.
-- The 4 fixture profiles need matching auth.users rows to satisfy
-- the FK at INSERT time. Minimal required columns: id + email; other
-- columns have defaults (is_sso_user=false, is_anonymous=false).
--
-- ON CONFLICT (id) DO NOTHING handles normal re-runs (the DELETE
-- block above doesn't remove auth.users rows — platform data). The
-- target column is intentional: if a row exists with matching email
-- but different id (e.g., manual Supabase dashboard intervention),
-- we want the INSERT to error, not silently skip. Seed drift should
-- surface, not be papered over.

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000002', 'owner@e2e.lane.test'),
  ('00000000-0000-0000-0000-000000000003', 'admin@e2e.lane.test'),
  ('00000000-0000-0000-0000-000000000004', 'member1@e2e.lane.test'),
  ('00000000-0000-0000-0000-000000000005', 'member2@e2e.lane.test')
ON CONFLICT (id) DO NOTHING;

-- ── Insert fixture (FK-respecting order) ───────────────────────────

-- Workspace. owner_id mirrors the owner's profile id so that joins
-- between organizations.owner_id and workspace_members.user_id (where
-- role='owner') resolve consistently. Spec §4.4 calls this mirror
-- pattern out (under the column-name "owner_user_id"; actual schema
-- column is owner_id — see ROADMAP parking lot).
INSERT INTO organizations (id, name, slug, owner_id, plan)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Workspace',
  'test-workspace',
  '00000000-0000-0000-0000-000000000002',
  'free'
);

-- Profiles: 4 users, varied functional roles to give Phase D tests
-- coverage of role-gated UI/logic. profiles.role is the FUNCTIONAL
-- role (lead/pm/designer/developer/admin) per spec §3.1.
-- Distinct from workspace_members.role (the access role).
INSERT INTO profiles (id, org_id, full_name, email, role) VALUES
  (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Test Owner',
    'owner@e2e.lane.test',
    'lead'
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Test Admin',
    'admin@e2e.lane.test',
    'pm'
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000001',
    'Test Member 1',
    'member1@e2e.lane.test',
    'designer'
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'Test Member 2',
    'member2@e2e.lane.test',
    'developer'
  );

-- Workspace memberships: workspace_members.role is the ACCESS role
-- (owner/admin/member/guest) per spec §3.2. Composite PK is
-- (workspace_id, user_id). One owner, one admin, two members.
INSERT INTO workspace_members (workspace_id, user_id, role) VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'owner'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003', 'admin'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004', 'member'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005', 'member');

-- Pending invite: targets a brand-new email that is NOT one of the
-- 4 seeded users — accepting this invite should create a new profile,
-- which is the canonical invite-accept flow (spec §7).
-- accepted_at is NULL → pending. Token is predictable for tests.
INSERT INTO invites (id, org_id, email, token, role, invited_by, expires_at)
VALUES (
  '00000000-0000-0000-0000-000000000006',
  '00000000-0000-0000-0000-000000000001',
  'invitee@e2e.lane.test',
  'test-invite-token-001',
  'designer',
  '00000000-0000-0000-0000-000000000002', -- invited_by = owner profile
  '2099-12-31 23:59:59+00'
);

COMMIT;
