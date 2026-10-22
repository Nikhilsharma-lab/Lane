-- Applied only to loopback lane_test, immediately before migration 0035 (no history table exists yet).
INSERT INTO organizations(id,name,slug) VALUES('org_expected_history_legacy','Legacy impact history','expected-history-legacy');
INSERT INTO requests(org_id,title,description,status,created_by,created_at,expected_impact) VALUES
 ('org_expected_history_legacy','Legacy metric','Existing Request','open','user_test_admin_a','2026-09-01T00:00:00Z',
  '{"kind":"metric","metric":"Conversion","baseline":50,"target":80,"unit":"%","source":"Original source","reviewAfterDays":30}'::jsonb),
 ('org_expected_history_legacy','Legacy verification','Existing Request','in_progress','user_test_admin_a','2026-09-02T00:00:00Z',
  '{"kind":"verification","result":"Checkout recovery verified","source":"Original source","reviewAfterDays":14}'::jsonb),
 ('org_expected_history_legacy','Legacy without impact','Existing Request','open','user_test_admin_a','2026-09-03T00:00:00Z',NULL);
