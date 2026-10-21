-- Applied only to loopback lane_test, immediately before migration 0028.
INSERT INTO organizations(id,name,slug) VALUES('org_agreement_legacy','Legacy agreement fixtures','agreement-legacy');
INSERT INTO requests(org_id,title,description,status,created_by,created_at,updated_at,expected_impact)
SELECT 'org_agreement_legacy','Legacy '||n,'Original saved context',
 (ARRAY['open','in_progress','done'])[1+(n%3)]::request_status,'user_test_admin_a',
 '2026-09-01T00:00:00Z'::timestamptz,'2026-09-02T00:00:00Z'::timestamptz,
 CASE WHEN n=0 THEN NULL
 WHEN n=1 THEN '{"kind":"metric","metric":"Conversion","baseline":50,"target":80,"unit":"%","source":"Original source","reviewAfterDays":30}'::jsonb
 WHEN n=2 THEN '{"kind":"verification","result":"Checkout recovery verified","source":"Original source","reviewAfterDays":14}'::jsonb
 ELSE jsonb_build_object('kind','measurement','version',n-1,
 'primary',jsonb_build_object('key','conversion','name','','unit','percent','current',50,'target',80,'noBaseline',false,'check',''),
 'measurement',jsonb_build_object('audience','all','platform','web','windowDays',30,'exactDates',false,'startDate','','endDate',''),'guardrails','[]'::jsonb)
 END
FROM generate_series(0,5) n;
INSERT INTO comments(request_id,author_id,body,created_at)
SELECT id,created_by,'Original comment','2026-09-02T00:00:00Z'::timestamptz FROM requests WHERE org_id='org_agreement_legacy';
