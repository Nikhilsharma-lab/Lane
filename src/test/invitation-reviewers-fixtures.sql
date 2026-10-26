-- Applied only to loopback lane_test, immediately before 0044: Reviewers lists that still name pending
-- invitations (email-address Reviewers) beside workspace members, so the test can check that 0044 removes
-- the invitations and keeps every member Reviewer, their order and their answers, and nothing else.
INSERT INTO organizations(id,name,slug) VALUES('org_invitation_reviewers','Invitation Reviewer fixtures','invitation-reviewers');
INSERT INTO profiles(id,full_name,email) VALUES
 ('invitation_reviewers_requester','Requester','requester@invitation-reviewers.test'),
 ('invitation_reviewers_member','Member','member@invitation-reviewers.test');
INSERT INTO requests(id,org_id,title,description,created_by,agreement_revision,updated_at) VALUES
 ('00000000-0000-4000-8000-000000000441','org_invitation_reviewers','Mixed','Fixture','invitation_reviewers_requester',3,'2026-10-20T09:00:00Z'),
 ('00000000-0000-4000-8000-000000000442','org_invitation_reviewers','Invitations only','Fixture','invitation_reviewers_requester',1,'2026-10-20T09:00:00Z'),
 ('00000000-0000-4000-8000-000000000443','org_invitation_reviewers','Members only','Fixture','invitation_reviewers_requester',2,'2026-10-20T09:00:00Z');
INSERT INTO request_agreements(org_id,request_id,reviewers) VALUES
 ('org_invitation_reviewers','00000000-0000-4000-8000-000000000441','[
   {"id":"00000000-0000-4000-8000-0000000004a1","nominee":{"kind":"invitation","invitationId":"inv_mixed_1","email":"first@invited.test"},"displayNameAtSelection":"first@invited.test","addedBy":"invitation_reviewers_requester","note":"","decision":null},
   {"id":"00000000-0000-4000-8000-0000000004a2","nominee":{"kind":"member","userId":"invitation_reviewers_member"},"displayNameAtSelection":"Member","addedBy":"invitation_reviewers_requester","note":"Can we build this?","decision":{"kind":"concern","actorId":"invitation_reviewers_member","at":"2026-10-21T09:00:00Z","reason":"No API yet"}},
   {"id":"00000000-0000-4000-8000-0000000004a3","nominee":{"kind":"invitation","invitationId":"inv_mixed_2","email":"second@invited.test"},"displayNameAtSelection":"second@invited.test","addedBy":"invitation_reviewers_requester","note":"","decision":null},
   {"id":"00000000-0000-4000-8000-0000000004a4","nominee":{"kind":"member","userId":"invitation_reviewers_other"},"displayNameAtSelection":"Other","addedBy":"invitation_reviewers_requester","note":"","decision":null}
 ]'::jsonb),
 ('org_invitation_reviewers','00000000-0000-4000-8000-000000000442','[
   {"id":"00000000-0000-4000-8000-0000000004b1","nominee":{"kind":"invitation","invitationId":"inv_only","email":"only@invited.test"},"displayNameAtSelection":"only@invited.test","addedBy":"invitation_reviewers_requester","note":"Please look","decision":null}
 ]'::jsonb),
 ('org_invitation_reviewers','00000000-0000-4000-8000-000000000443','[
   {"id":"00000000-0000-4000-8000-0000000004c1","nominee":{"kind":"member","userId":"invitation_reviewers_member"},"displayNameAtSelection":"Member","addedBy":"invitation_reviewers_requester","note":"","decision":{"kind":"looks_good","actorId":"invitation_reviewers_member","at":"2026-10-21T09:00:00Z","reason":""}}
 ]'::jsonb);
