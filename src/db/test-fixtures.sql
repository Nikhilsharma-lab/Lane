-- Shared test fixtures for forge tests that reference hardcoded UUIDs.
-- Applied by globalSetup after baseline.sql on every test run.
-- These rows mirror what existed in the live DB when the tests were written.

-- Workspace A (primary test workspace)
INSERT INTO organizations (id, name, slug)
VALUES ('e9e3b28e-f594-4ae1-85d9-bc85e66b5a19', 'Test Workspace A', 'test-workspace-a')
ON CONFLICT DO NOTHING;

-- Workspace B (cross-workspace isolation target)
INSERT INTO organizations (id, name, slug)
VALUES ('649ace1d-14d8-40d1-9603-c91514f827cc', 'Test Workspace B', 'test-workspace-b')
ON CONFLICT DO NOTHING;

-- User A: owner of workspace A
INSERT INTO profiles (id, org_id, full_name, email, role)
VALUES ('7c683bdd-43ce-42c4-847a-3fb5663b2926', 'e9e3b28e-f594-4ae1-85d9-bc85e66b5a19', 'Test Owner', 'owner@test.local', 'pm')
ON CONFLICT DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role, is_active)
VALUES ('e9e3b28e-f594-4ae1-85d9-bc85e66b5a19', '7c683bdd-43ce-42c4-847a-3fb5663b2926', 'owner', true)
ON CONFLICT DO NOTHING;

-- User A: member of workspace A
INSERT INTO profiles (id, org_id, full_name, email, role)
VALUES ('b0784525-9e27-46c7-9bdd-066ceb776674', 'e9e3b28e-f594-4ae1-85d9-bc85e66b5a19', 'Test Member', 'member@test.local', 'designer')
ON CONFLICT DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role, is_active)
VALUES ('e9e3b28e-f594-4ae1-85d9-bc85e66b5a19', 'b0784525-9e27-46c7-9bdd-066ceb776674', 'member', true)
ON CONFLICT DO NOTHING;

-- User B: owner of workspace B, NOT a member of A
INSERT INTO profiles (id, org_id, full_name, email, role)
VALUES ('121fe28c-ae3f-4fc7-92c2-ccb195f3b97c', '649ace1d-14d8-40d1-9603-c91514f827cc', 'Test User B', 'userb@test.local', 'developer')
ON CONFLICT DO NOTHING;

INSERT INTO workspace_members (workspace_id, user_id, role, is_active)
VALUES ('649ace1d-14d8-40d1-9603-c91514f827cc', '121fe28c-ae3f-4fc7-92c2-ccb195f3b97c', 'owner', true)
ON CONFLICT DO NOTHING;

-- Open request in workspace A (used by auth-guard, guest-isolation, isolation tests)
INSERT INTO requests (id, org_id, title, description, status, created_by)
VALUES ('de7fe180-b51b-4714-8e82-42b775fe53d4', 'e9e3b28e-f594-4ae1-85d9-bc85e66b5a19', 'Test Open Request', 'A request for forge tests', 'open', '7c683bdd-43ce-42c4-847a-3fb5663b2926')
ON CONFLICT DO NOTHING;
