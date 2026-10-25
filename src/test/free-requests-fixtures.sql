-- Applied only to loopback lane_test, immediately before 0046: a workspace that already filed Requests, so the test
-- can check the backfilled Free Requests count. Five Requests were created: three by a Member (one since deleted),
-- one Guest submission taken on, and one Guest submission still waiting. Four count.
INSERT INTO organizations(id,name,slug) VALUES('org_free_requests_backfill','Free Requests backfill','free-requests-backfill');
INSERT INTO profiles(id,full_name,email) VALUES
 ('free_requests_backfill_member','Member','member@free-requests-backfill.test'),
 ('free_requests_backfill_guest','Guest','guest@free-requests-backfill.test');
INSERT INTO requests(id,org_id,title,description,created_by,guest_submission,taken_on_by,taken_on_at) VALUES
 ('00000000-0000-4000-8000-000000000461','org_free_requests_backfill','One','Fixture','free_requests_backfill_member',false,null,null),
 ('00000000-0000-4000-8000-000000000462','org_free_requests_backfill','Two','Fixture','free_requests_backfill_member',false,null,null),
 ('00000000-0000-4000-8000-000000000463','org_free_requests_backfill','Deleted','Fixture','free_requests_backfill_member',false,null,null),
 ('00000000-0000-4000-8000-000000000464','org_free_requests_backfill','Taken on','Fixture','free_requests_backfill_guest',true,'free_requests_backfill_member','2026-10-24T09:00:00Z'),
 ('00000000-0000-4000-8000-000000000465','org_free_requests_backfill','Waiting','Fixture','free_requests_backfill_guest',true,null,null);
DELETE FROM requests WHERE id = '00000000-0000-4000-8000-000000000463';
-- A workspace that never filed anything.
INSERT INTO organizations(id,name,slug) VALUES('org_free_requests_backfill_empty','Free Requests backfill, empty','free-requests-backfill-empty');
