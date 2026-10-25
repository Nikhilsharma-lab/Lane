-- Applied only to loopback lane_test, immediately before migration 0038 (moving saved metrics into the library, #200).
-- Saved predictions, guardrails, a draft, a closed result and an older Expected impact revision, typed and built in,
-- in two workspaces. src/db/metrics-migration-schema.test.ts checks what the migration makes of them.
CREATE FUNCTION pg_temp.plan(version int, main jsonb, guardrails jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('kind', 'measurement', 'version', version,
  'primary', jsonb_build_object('name', '', 'current', 10, 'target', 20, 'noBaseline', false, 'check', '') || main,
  'measurement', '{"audience":"all","platform":"all","windowDays":30,"exactDates":false,"startDate":"","endDate":""}'::jsonb,
  'guardrails', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', '', 'current', null, 'noBaseline', false, 'operator', 'at_most', 'limit', 5) || g ORDER BY o)
   FROM jsonb_array_elements(guardrails) WITH ORDINALITY AS e(g, o)), '[]'::jsonb))
$$;

INSERT INTO organizations(id,name,slug) VALUES
 ('org_metrics_migration','Metrics migration','metrics-migration'),
 ('org_metrics_migration_b','Metrics migration B','metrics-migration-b');

INSERT INTO requests(org_id,title,description,status,created_by,created_at,expected_impact) VALUES
 ('org_metrics_migration','Built-in plan','Fixture','open','user_test_admin_a','2026-09-01T00:00:00Z',
  pg_temp.plan(4, '{"key":"conversion","unit":"percent"}', '[{"key":"custom","name":"Checkout errors","unit":"count"},{"key":"error","unit":"percent"}]')),
 ('org_metrics_migration','Typed plan','Fixture','open','user_test_admin_a','2026-09-02T00:00:00Z',
  pg_temp.plan(4, '{"key":"custom","name":"Signups","unit":"count"}', '[{"key":"custom","name":"  signups ","unit":"percent"},{"key":"custom","name":"conversion rate","unit":"percent"},{"key":"custom","name":"Conversion rate","unit":"count"}]')),
 ('org_metrics_migration','Older plan','Fixture','open','user_test_admin_a','2026-09-03T00:00:00Z',
  pg_temp.plan(2, '{"key":"conversion","unit":"count"}', '[{"key":"duration","unit":"minutes"}]')),
 ('org_metrics_migration','Legacy metric','Fixture','open','user_test_admin_a','2026-09-04T00:00:00Z',
  '{"kind":"metric","metric":"Signups","baseline":50,"target":80,"unit":"users","source":"","reviewAfterDays":30,"guardrail":{"metric":"Page load time","operator":"at_most","limit":3,"unit":"s"},"additionalGuardrails":[{"metric":"Checkout  Errors","operator":"at_most","limit":9,"unit":"#"}]}'::jsonb),
 ('org_metrics_migration','Legacy verification','Fixture','open','user_test_admin_a','2026-09-05T00:00:00Z',
  '{"kind":"verification","result":"Checkout recovery verified","source":"","reviewAfterDays":14,"guardrail":{"metric":"Refund requests","operator":"at_most","limit":4,"unit":"count"}}'::jsonb),
 ('org_metrics_migration','Pass/fail plan','Fixture','open','user_test_admin_a','2026-09-06T00:00:00Z',
  pg_temp.plan(4, '{"key":"check","unit":"","current":null,"target":null,"check":"keyboard"}', '[]')),
 ('org_metrics_migration','Long names','Fixture','open','user_test_admin_a','2026-09-07T00:00:00Z',
  pg_temp.plan(4, jsonb_build_object('key', 'custom', 'name', repeat('x', 120), 'unit', 'count'), jsonb_build_array(jsonb_build_object('key', 'custom', 'name', repeat('X', 120), 'unit', 'percent')))),
 ('org_metrics_migration_b','Other workspace','Fixture','open','user_test_admin_a','2026-09-01T00:00:00Z',
  pg_temp.plan(4, '{"key":"custom","name":"Signups","unit":"count"}', '[]'));

-- A draft on an older Request: saved only as a measurement draft, with no Expected impact yet.
INSERT INTO requests(org_id,title,description,status,created_by,created_at,measurement_draft) VALUES
 ('org_metrics_migration','Draft only','Fixture','open','user_test_admin_a','2026-09-08T00:00:00Z',
  '{"kind":"metric","metric":"Activation rate","baseline":null,"target":null,"unit":"%","source":"","reviewAfterDays":null}'::jsonb);

-- A Request whose Expected impact changed: revision 1 named a metric the current version no longer has.
INSERT INTO requests(org_id,title,description,status,created_by,created_at,expected_impact) VALUES
 ('org_metrics_migration','Revised plan','Fixture','open','user_test_admin_a','2026-09-09T00:00:00Z',
  pg_temp.plan(4, '{"key":"custom","name":"Trial starts","unit":"count"}', '[]'));
UPDATE requests SET expected_impact = pg_temp.plan(4, '{"key":"adoption","unit":"percent"}', '[]') WHERE org_id = 'org_metrics_migration' AND title = 'Revised plan';
INSERT INTO request_expected_impact_revisions(org_id,request_id,revision,expected_impact,author_id,recorded_as)
 SELECT org_id, id, 2, expected_impact, created_by, 'revised' FROM requests WHERE org_id = 'org_metrics_migration' AND title = 'Revised plan';

-- A closed result: its frozen expectation names a metric found nowhere else.
INSERT INTO requests(org_id,title,description,status,created_by,created_at,expected_impact,outcome_closure) VALUES
 ('org_metrics_migration','Closed plan','Fixture','done','user_test_admin_a','2026-09-10T00:00:00Z',
  pg_temp.plan(4, '{"key":"custom","name":"Retention","unit":"percent"}', '[]'),
  jsonb_build_object('version', 1, 'kind', 'measured', 'actorId', 'user_test_admin_a', 'ownerId', 'user_test_admin_a',
   'closedAt', '2026-10-01T00:00:00.000Z', 'operationId', '6f1d2c3b-0000-4000-8000-000000000200', 'fingerprint', repeat('a', 64),
   'expected', pg_temp.plan(4, '{"key":"custom","name":"Retention","unit":"percent"}', '[{"key":"custom","name":"Repeat orders","unit":"count"}]'),
   'release', '{"exposureDate":"2026-09-15","audience":"All users","evidence":"Release note","dueDate":"2026-10-15","startDate":"2026-09-15","windowKind":"relative"}'::jsonb,
   'primary', '{"kind":"numeric","actual":42,"unit":"%"}'::jsonb,
   'guardrails', '[{"metric":"Repeat orders","operator":"at_most","limit":5,"unit":"count","actual":3}]'::jsonb,
   'evidence', 'Dashboard export', 'observedFrom', '2026-09-15', 'observedTo', '2026-10-01', 'revision', 1));

-- What every Request and Expected impact revision held before the migration, to compare with afterwards.
CREATE SCHEMA metrics_migration_before;
CREATE TABLE metrics_migration_before.requests AS SELECT r.id, to_jsonb(r) AS saved FROM requests r;
CREATE TABLE metrics_migration_before.revisions AS SELECT v.id, to_jsonb(v) AS saved FROM request_expected_impact_revisions v;
