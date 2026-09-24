-- Shared test fixtures for domain tests. Identity and membership are mocked
-- from Clerk; Postgres stores Clerk-shaped identifiers as plain text.
-- Applied by globalSetup after baseline.sql on every test run.
-- These rows mirror what existed in the live DB when the tests were written.

-- Workspace A (primary test workspace)
INSERT INTO organizations (id, name, slug)
VALUES ('org_test_a', 'Test Workspace A', 'test-workspace-a')
ON CONFLICT DO NOTHING;

-- Workspace B (cross-workspace isolation target)
INSERT INTO organizations (id, name, slug)
VALUES ('org_test_b', 'Test Workspace B', 'test-workspace-b')
ON CONFLICT DO NOTHING;

-- Clerk users. Organization membership is not duplicated here.
INSERT INTO profiles (id, full_name, email, role)
VALUES ('user_test_admin_a', 'Test Admin', 'admin-a@test.local', 'pm')
ON CONFLICT DO NOTHING;

INSERT INTO profiles (id, full_name, email, role)
VALUES ('user_test_member_a', 'Test Member', 'member-a@test.local', 'designer')
ON CONFLICT DO NOTHING;

INSERT INTO profiles (id, full_name, email, role)
VALUES ('user_test_admin_b', 'Test Admin B', 'admin-b@test.local', 'developer')
ON CONFLICT DO NOTHING;

-- Open request in workspace A (used by auth-guard, guest-isolation, isolation tests)
INSERT INTO requests (id, org_id, title, description, status, created_by)
VALUES ('de7fe180-b51b-4714-8e82-42b775fe53d4', 'org_test_a', 'Test Open Request', 'A request for forge tests', 'open', 'user_test_admin_a')
ON CONFLICT DO NOTHING;
