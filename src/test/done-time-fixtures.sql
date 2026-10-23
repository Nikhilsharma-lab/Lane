-- Applied only to loopback lane_test, immediately before 0034: a Request marked Done before Lane kept a
-- Done time, so the test can check that 0034 takes it from updated_at without restamping updated_at.
INSERT INTO organizations(id,name,slug) VALUES('org_done_time','Done time fixtures','done-time');
INSERT INTO profiles(id,full_name,email) VALUES('done_time_requester','Requester','requester@done-time.test');
INSERT INTO requests(org_id,title,description,created_by,status,updated_at) VALUES
 ('org_done_time','Done before 0034','Backfill','done_time_requester','done','2026-10-01T09:30:00Z'),
 ('org_done_time','Open before 0034','Backfill','done_time_requester','open','2026-10-01T09:30:00Z');
