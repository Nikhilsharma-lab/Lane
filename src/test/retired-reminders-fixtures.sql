-- Applied only to loopback lane_test, immediately before 0040: the stored bell reminders the lazy writer left
-- behind (one of each kind, written by Lane with no actor) beside ordinary notifications, so the test can check
-- that 0040 removes the reminders and keeps everything else, read state included.
INSERT INTO organizations(id,name,slug) VALUES('org_retired_reminders','Retired reminders fixtures','retired-reminders');
INSERT INTO profiles(id,full_name,email) VALUES
 ('retired_reminders_requester','Requester','requester@retired-reminders.test'),
 ('retired_reminders_teammate','Teammate','teammate@retired-reminders.test');
INSERT INTO requests(id,org_id,title,description,created_by,status) VALUES
 ('00000000-0000-4000-8000-000000000400','org_retired_reminders','Reminded','Fixture','retired_reminders_requester','done');
INSERT INTO notifications(user_id,org_id,type,request_id,actor_id,read_at,created_at) VALUES
 ('retired_reminders_requester','org_retired_reminders','release_reminder','00000000-0000-4000-8000-000000000400',NULL,NULL,'2026-10-13T09:00:00Z'),
 ('retired_reminders_requester','org_retired_reminders','result_due_soon','00000000-0000-4000-8000-000000000400',NULL,'2026-10-25T10:00:00Z','2026-10-25T09:00:00Z'),
 ('retired_reminders_requester','org_retired_reminders','result_due','00000000-0000-4000-8000-000000000400',NULL,NULL,'2026-10-28T09:00:00Z'),
 ('retired_reminders_requester','org_retired_reminders','result_overdue','00000000-0000-4000-8000-000000000400',NULL,NULL,'2026-10-29T09:00:00Z'),
 ('retired_reminders_requester','org_retired_reminders','comment_added','00000000-0000-4000-8000-000000000400','retired_reminders_teammate',NULL,'2026-10-20T09:00:00Z'),
 ('retired_reminders_requester','org_retired_reminders','request_done','00000000-0000-4000-8000-000000000400','retired_reminders_teammate','2026-10-21T09:00:00Z','2026-10-10T15:00:00Z');
