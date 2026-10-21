-- Applied only to loopback lane_test, after 0030 and immediately before 0031: Requests that already
-- had PM / Designer / Developer seats, so the test can check how 0031 turns them into reviewers.
INSERT INTO organizations(id,name,slug) VALUES('org_agreement_seats','Seat conversion fixtures','agreement-seats');
INSERT INTO profiles(id,full_name,email) VALUES('seat_requester','Requester','requester@seat.test');
INSERT INTO requests(org_id,title,description,created_by) VALUES
 ('org_agreement_seats','Seats answered','Seat conversion','seat_requester'),
 ('org_agreement_seats','Seats partly filled','Seat conversion','seat_requester'),
 ('org_agreement_seats','Seats repeat a person','Seat conversion','seat_requester');
INSERT INTO request_agreements(request_id,org_id,prepared,seats)
SELECT r.id,r.org_id,
 '{"version":1,"scopeIncluded":"","scopeExcluded":"","audience":"","timing":"","constraints":"","feasibility":"","commitmentKind":"delivery"}'::jsonb,
 CASE r.title WHEN 'Seats answered' THEN jsonb_build_object(
  'pm',jsonb_build_object('generation',1,'nominee',jsonb_build_object('kind','member','userId','seat_requester'),'displayNameAtSelection','Requester',
    'decision',jsonb_build_object('kind','agree','actorId','seat_requester','at','2026-10-20T00:00:00Z','reason','')),
  'designer',jsonb_build_object('generation',1,'nominee',jsonb_build_object('kind','member','userId','seat_designer'),'displayNameAtSelection','Designer',
    'decision',jsonb_build_object('kind','agree','actorId','seat_designer','at','2026-10-20T01:00:00Z','reason','')),
  'developer',jsonb_build_object('generation',2,'nominee',jsonb_build_object('kind','member','userId','seat_developer'),'displayNameAtSelection','Developer',
    'decision',jsonb_build_object('kind','request_changes','actorId','seat_developer','at','2026-10-20T02:00:00Z','reason','The API cannot do this yet')))
 WHEN 'Seats repeat a person' THEN jsonb_build_object(
  'pm',jsonb_build_object('generation',1,'nominee',jsonb_build_object('kind','member','userId','seat_both'),'displayNameAtSelection','Both','decision',null),
  'designer',jsonb_build_object('generation',1,'nominee',jsonb_build_object('kind','member','userId','seat_both'),'displayNameAtSelection','Both',
    'decision',jsonb_build_object('kind','agree','actorId','seat_both','at','2026-10-20T00:00:00Z','reason','')),
  'developer',null)
 ELSE jsonb_build_object(
  'pm',jsonb_build_object('generation',1,'nominee',jsonb_build_object('kind','member','userId','seat_pm'),'displayNameAtSelection','PM',
    'decision',jsonb_build_object('kind','withdraw','actorId','seat_pm','at','2026-10-20T00:00:00Z','reason','Changed my mind')),
  'designer',null,
  'developer',jsonb_build_object('generation',1,'nominee',jsonb_build_object('kind','invitation','invitationId','inv_seat','email','invited@seat.test'),'displayNameAtSelection','invited@seat.test','decision',null))
 END
FROM requests r WHERE r.org_id='org_agreement_seats';
