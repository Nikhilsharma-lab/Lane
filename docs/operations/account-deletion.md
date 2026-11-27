# Manual Account and Workspace Deletion Procedure

> **For agentic workers:** This is an operating procedure. It authorizes nothing by itself. Every production write below needs Nikhil's explicit go-ahead for that run, and the SQL is a template with placeholders, never a script to execute unattended. Nothing here happens automatically. `src/db/account-deletion-procedure.test.ts` runs the blocks marked `-- step:` on a local test database; change a block and its test together.

**Goal:** When a person asks Lane to delete their account, or a workspace admin asks to delete a workspace, remove what Lane holds about them in a known order, within the window the Privacy page promises, without breaking the workspace they leave behind.

**Authority:** Plan §6.1 row G11 (a manual procedure), owner N+A, and #345 Q7: the procedure works entirely in Lane's database. Data shapes come from `src/db/migrations/` (Better Auth's tables are `0055`) and `src/db/schema/*.ts`. The rule that a Request outlives its creator comes from `REQUIREMENTS.md` "Closure ownership".

**Applies from the Better Auth cutover** (increment 6 of #349). Until then production runs the earlier build, whose procedure is this file at commit `f2045e17`.

**Status:** Nikhil approved the privacy policy and deletion/retention rules on 2026-10-20. Operator: Nikhil Sharma, India. Privacy contact: uselaneapp@gmail.com. Acknowledge within 3 working days; aim to complete verified requests within 30 days, subject to applicable legal deadlines. Remove account identity and retain shared contributions under former-member attribution, separately reviewing personal information within content and removing it where required. Attribution changes alone do not anonymize content. No real-user deletion has been run against production.

**Approved backup rule:** Nikhil owns the manual retention process. Record each archive's creation date and location (including downloaded and off-machine copies), expire ordinary copies within 28 days, and on deletion record a deadline no later than 28 days after live deletion. Remove all relevant copies by that deadline and record completion. This applies to pre-migration copies containing personal data too. If restoring an older copy, reapply completed deletion requests before reopening access. Existing pre-cutover archives contain disposable test data. No automated expiry job is implied.

---

## 1. Where a person's data lives

Lane's Postgres is the only place a Lane account lives (ADR 0008). Better Auth's user is `profiles` and its workspace is `organizations`.

### 1.1 The account (Supabase Postgres, schema `public`)

| Table | What it holds about the person | What the procedure does |
|---|---|---|
| `profiles` | `id`, `full_name`, `email`, `email_verified`, `role`, `last_workspace_id` | kept as the "Former member" tombstone, with a placeholder email |
| `session` | `user_id`: their signed-in devices (token, IP address, browser) | deleted: every device is signed out |
| `account` | `user_id`: their sign-in methods (password hash, Google account and its tokens) | deleted |
| `member` | `user_id`, `role`: which workspaces they are in | deleted |
| `invitation` | `email` (invitations to them), `inviter_id` (invitations they sent) | every invitation to their address is deleted, answered ones too because they hold the address; and the pending ones they sent |
| `verification` | `identifier` = `<type>-otp-<email>`: hashed sign-up, sign-in and reset codes | deleted |

`session`, `account`, `member` and sent invitations would cascade from a deleted profile, but the profile is kept, so each is deleted explicitly.

### 1.2 Their work

| Table | Columns naming the person | Delete rule from the schema | Meaning |
|---|---|---|---|
| `requests` | `created_by`, `assigned_to`, `taken_on_by` | `REFERENCES profiles(id)` with no `ON DELETE` (no action) | deleting the profile fails while any Request names it |
| `comments` | `author_id` | no action | same |
| `request_attachments` | `uploaded_by` | no action; `request_id` and `org_id` cascade | same; the file itself is a storage object (1.3) |
| `projects`, `workspace_labels`, `metric_definitions` | `created_by` | no action | same |
| `metric_definition_history`, `request_expected_impact_revisions` | `author_id` | no action | same; append-only records |
| `notifications` | `user_id` (recipient), `actor_id` (who did the thing) | both `ON DELETE CASCADE` | deleted explicitly, because the profile stays |
| `delivery_preferences`, `first_run_progress`, `saved_views`, `delivery_log` | `user_id`, `owner_id` | `ON DELETE CASCADE` (`delivery_log`: none) | the person's own settings, in every workspace; deleted explicitly, because the profile stays |
| `requests.design_reviews` (jsonb, `0018`) | `requestedBy {id, name}`, `reviewers[] {id, name}`, `responses[].reviewerId`, `withdrawal.by {id, name}` | none (JSON) | name snapshots from before 2026-10-18; nothing writes them now |
| `request_agreements.reviewers`, `request_agreement_events.payload` (jsonb) | `nominee.userId`, `displayNameAtSelection` | none (JSON) | a Reviewer's name when they were asked; replaced with "Former member" |
| `requests` release and closure records (jsonb), `same_problem_members`, `same_problem_events`, `quarter_notes`, `slack_connections` | ids only | none | an id, not a name |
| `organizations` | `owner_id` (who created the workspace) | nullable, no FK | an id, not a name |
| `workspace_billing`, `free_request_allowances` | `allowance_key` | none | a personal email address when the workspace's creator had one (a company domain otherwise); the address is replaced with a placeholder |

Free-text fields (`requests.description`, `comments.body`, `expected_impact`, Intake answers) may mention people by name. They are workspace content, not account data; see section 5.

### 1.3 In Supabase Storage

Bucket `request-attachments` (private). Object path is `<org_id>/<request_id>/<attachment_id>` (`src/app/(app)/intake/attachment-actions.ts:137`). The object carries the file bytes; the file name, MIME type and uploader are only in `request_attachments`.

### 1.4 Elsewhere, transient

| Where | What | Expires |
|---|---|---|
| `rate_limit` (Lane's database) | sign-in limits keyed by IP address; code limits keyed by a SHA-256 of the address | Better Auth clears old rows as it counts |
| `verification` (Lane's database) | a Google connection in progress, with the address | 10 minutes; it needs the session the procedure deletes, so it can't finish |
| Resend | Lane's emails to the person (codes, invitations, Inbox) | Resend's retention for the plan; nothing to do |
| Upstash Redis | rate-limit counter keyed `lane:ratelimit:ai:<user_id>` (`src/lib/rate-limit.ts:21-23`) | 60 seconds |
| Vercel | request logs with IPs and paths | Vercel's log retention for the plan; nothing to do |
| Anthropic | Intake text sent through the AI gate (`src/lib/ai/triage.ts`) | per Anthropic's API data-retention terms at the time; check the current terms when writing the Privacy page |
| Weekly `pg_dump` copies (`2026-10-10-production-cutover-runbook.md` 5.12) | a full copy of `public` | rotated: last four weekly dumps kept, so at most 28 days after the live deletion |

---

## 2. One transaction, and why

1. Everything that lets the person sign in goes in the same transaction as their name and email, so nobody can sign in to a half-deleted account.
2. A sign-in already under way can finish just after the commit. So the check (3.4) runs after the commit, and 3.3 runs again if the check finds anything. Running 3.3 twice for the same person is safe.
3. The foreign keys without `ON DELETE` (section 1.2) mean a plain `DELETE FROM profiles` fails for anyone who created a Request, a comment, an attachment or a Project. So the profile is **anonymised** and their contributions stay, attributed to "Former member" (section 5).
4. `profiles.email` is unique, so each tombstone gets its own placeholder: `former-member-<id>@deleted.invalid`. `.invalid` is reserved and never receives mail.
5. Their old address is free again. Someone who signs up with it, or with the same Google account, starts a new account that has nothing of the old one, new Free Requests included.
6. Two triggers refuse to change the history of reviews and a decided Free Requests key (`0031`, `0046`). The transaction turns each off only around its one statement, and a failure rolls everything back, the triggers included. While it runs, saving a review and creating a Request wait, in every workspace. If it stops on a lock timeout or a deadlock, nothing changed: run it again.

---

## 3. Procedure: delete one person's account

Steps marked **[N: authorize]** are production writes.

### 3.1 Receive and verify

- [ ] The request arrives at `support@` (plan §6.1, H3) from the email address on the account, or from a signed-in session. Reply within 3 working days acknowledging it and stating the 30-day window (section 7).
- [ ] Record: the person's Lane id (from `find-person`), the email, the date received. Keep the record outside the repo.
- [ ] Look up what the person touched, read-only, with a session-mode connection string pasted into the shell for this run only (never into an env file; see the runbook, section 2):

All SQL below is written for `psql -X -v ON_ERROR_STOP=1`. Set the variables once; `:'person_id'` then expands to a correctly quoted literal everywhere.

```
\set person_email REPLACE_ME
\set person_id REPLACE_ME
```

```sql
-- step: find-person
SELECT id, full_name, email FROM public.profiles WHERE lower(email) = lower(:'person_email');  -- expect one row; its id is person_id
```

```sql
-- step: look-up
SELECT 'requests_created', count(*) FROM public.requests WHERE created_by = :'person_id' UNION ALL
SELECT 'requests_assigned', count(*) FROM public.requests WHERE assigned_to = :'person_id' UNION ALL
SELECT 'comments', count(*) FROM public.comments WHERE author_id = :'person_id' UNION ALL
SELECT 'attachments', count(*) FROM public.request_attachments WHERE uploaded_by = :'person_id' UNION ALL
SELECT 'projects', count(*) FROM public.projects WHERE created_by = :'person_id' UNION ALL
SELECT 'workspaces', count(*) FROM public.member WHERE user_id = :'person_id' UNION ALL
SELECT 'pending_invitations_sent', count(*) FROM public.invitation WHERE inviter_id = :'person_id' AND status = 'pending' UNION ALL
SELECT 'notifications_received', count(*) FROM public.notifications WHERE user_id = :'person_id' UNION ALL
SELECT 'notifications_as_actor', count(*) FROM public.notifications WHERE actor_id = :'person_id' UNION ALL
SELECT 'reviews_named_in', count(*) FROM public.requests
  WHERE design_reviews::text LIKE '%' || :'person_id' || '%';

-- Workspaces they created whose Free Requests were never decided (no allowance_key, or no workspace_billing row yet).
-- Expect no rows.
SELECT o.id, o.name FROM public.organizations o
WHERE o.owner_id = :'person_id'
  AND NOT EXISTS (SELECT 1 FROM public.workspace_billing b WHERE b.org_id = o.id AND b.allowance_key IS NOT NULL);
```

- [ ] If the second query lists a workspace, stop. Lane decides Free Requests from the creator's address, so once 3.3 replaces it Lane would decide them from the placeholder, as a company domain called `deleted.invalid`. **[N: authorize]** Decide each one first, while the address is still on the profile: `decideFreeRequests({ orgId })` (`src/lib/billing.ts`) does it. Run `look-up` again, and go on when the second query lists none.

### 3.2 Workspaces they are the only Admin of **[N: authorize]**

A workspace always keeps an Admin (#333 Q4), and 3.3 doesn't check. Look first:

```sql
-- step: only-admin
SELECT o.id, o.name,
  (SELECT count(*) FROM public.member other WHERE other.organization_id = o.id AND other.user_id <> m.user_id) AS other_people
FROM public.member m
JOIN public.organizations o ON o.id = m.organization_id
WHERE m.user_id = :'person_id' AND m.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM public.member other_admin
    WHERE other_admin.organization_id = o.id AND other_admin.user_id <> m.user_id AND other_admin.role = 'admin'
  );
```

- [ ] For each workspace other people still use, ask the person to make someone else an Admin in Settings → Members before going on. If they can't, agree with the workspace's people who it is, `\set org_id` and `\set new_admin_id`, and run:

```sql
-- step: make-admin
UPDATE public.member SET role = 'admin' WHERE organization_id = :'org_id' AND user_id = :'new_admin_id';  -- expect UPDATE 1
```

- [ ] For each workspace nobody else is in, ask whether it should be deleted too (section 4, before this account). Otherwise nobody can open it again.
- [ ] Run `only-admin` again. Go on when every row left has no other people.
- [ ] If they sent pending invitations, tell each workspace's other Admins: those links stop working, and the people need inviting again.

### 3.3 Delete the account and anonymise the profile **[N: authorize]**

One transaction, with the same variables. The tombstone keeps the person's opaque id as its key because every FK points at it; the id is not personal data by itself.

```sql
-- step: delete-person
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1. Hold the profile while its rows go. Expect one row.
SELECT id FROM public.profiles WHERE id = :'person_id' FOR UPDATE;

-- 2. Every device, every sign-in method, every membership.
DELETE FROM public.session WHERE user_id = :'person_id';
DELETE FROM public.account WHERE user_id = :'person_id';
DELETE FROM public.member WHERE user_id = :'person_id';

-- 3. Invitations to their address, answered or not, and the pending ones they sent.
DELETE FROM public.invitation
WHERE lower(email) = (SELECT lower(email) FROM public.profiles WHERE id = :'person_id')
   OR (inviter_id = :'person_id' AND status = 'pending');

-- 4. Codes stored for their address: sign-up, sign-in and reset.
DELETE FROM public.verification v
USING public.profiles p
WHERE p.id = :'person_id'
  AND v.identifier IN ('email-verification-otp-' || lower(p.email), 'sign-in-otp-' || lower(p.email), 'forget-password-otp-' || lower(p.email));

-- 5. Their notifications and their own settings, in every workspace: how Needs-you items reach them, their first-run
--    guide, their saved views (a view has a typed name) and the record of what was sent to them. The profile stays,
--    so the CASCADEs do not fire; delete explicitly.
DELETE FROM public.notifications WHERE user_id = :'person_id' OR actor_id = :'person_id';
DELETE FROM public.delivery_preferences WHERE user_id = :'person_id';
DELETE FROM public.first_run_progress WHERE user_id = :'person_id';
DELETE FROM public.saved_views WHERE owner_id = :'person_id';
DELETE FROM public.delivery_log WHERE user_id = :'person_id';

-- 6. Open assignments: unassign so the Request can be picked up by someone else.
UPDATE public.requests SET assigned_to = NULL
WHERE assigned_to = :'person_id' AND status <> 'done';

-- 7. Name snapshots inside design reviews (0018): requestedBy, reviewers[], withdrawal.by.
--    Order is preserved. design_review_version is bumped so a stale client save (which carries
--    the old names in memory) is rejected by the conditional version update instead of winning.
UPDATE public.requests
SET design_reviews = (
      SELECT coalesce(jsonb_agg(
        review
        || jsonb_build_object('requestedBy',
             CASE WHEN review->'requestedBy'->>'id' = :'person_id'
                  THEN jsonb_build_object('id', :'person_id', 'name', 'Former member')
                  ELSE review->'requestedBy' END)
        || jsonb_build_object('reviewers',
             (SELECT coalesce(jsonb_agg(
                CASE WHEN r->>'id' = :'person_id'
                     THEN jsonb_build_object('id', :'person_id', 'name', 'Former member')
                     ELSE r END ORDER BY r_ord), '[]'::jsonb)
              FROM jsonb_array_elements(review->'reviewers') WITH ORDINALITY AS rs(r, r_ord)))
        || CASE WHEN review->'withdrawal'->'by'->>'id' = :'person_id'
                THEN jsonb_build_object('withdrawal',
                       review->'withdrawal'
                       || jsonb_build_object('by', jsonb_build_object('id', :'person_id', 'name', 'Former member')))
                ELSE '{}'::jsonb END
        ORDER BY review_ord), '[]'::jsonb)
      FROM jsonb_array_elements(design_reviews) WITH ORDINALITY AS reviews(review, review_ord)
    ),
    design_review_version = design_review_version + 1
WHERE design_reviews::text LIKE '%' || :'person_id' || '%';

-- 8. Their name as a Reviewer, on the Request and in the history of its reviews. Other people's entries stay as they
--    are. The Requests are held first, as saving a review holds them, so no review being saved writes the name back.
SELECT r.id FROM public.requests r
WHERE EXISTS (SELECT 1 FROM public.request_agreements a WHERE a.org_id = r.org_id AND a.request_id = r.id
        AND jsonb_path_exists(a.reviewers, '$[*] ? (@.nominee.userId == $id)', jsonb_build_object('id', :'person_id')))
   OR EXISTS (SELECT 1 FROM public.request_agreement_events e WHERE e.org_id = r.org_id AND e.request_id = r.id
        AND jsonb_path_exists(e.payload, '$.*.reviewers[*] ? (@.nominee.userId == $id)', jsonb_build_object('id', :'person_id')))
ORDER BY r.id
FOR UPDATE;

UPDATE public.request_agreements
SET reviewers = (
  SELECT jsonb_agg(CASE WHEN reviewer->'nominee'->>'userId' = :'person_id'
      THEN reviewer || jsonb_build_object('displayNameAtSelection', 'Former member') ELSE reviewer END ORDER BY ord)
  FROM jsonb_array_elements(reviewers) WITH ORDINALITY AS listed(reviewer, ord))
WHERE jsonb_path_exists(reviewers, '$[*] ? (@.nominee.userId == $id)', jsonb_build_object('id', :'person_id'));

ALTER TABLE public.request_agreement_events DISABLE TRIGGER protect_agreement_events;
UPDATE public.request_agreement_events
SET payload = payload || (
  SELECT coalesce(jsonb_object_agg(side.key, side.value || jsonb_build_object('reviewers', (
      SELECT coalesce(jsonb_agg(CASE WHEN reviewer->'nominee'->>'userId' = :'person_id'
          THEN reviewer || jsonb_build_object('displayNameAtSelection', 'Former member') ELSE reviewer END ORDER BY ord), '[]'::jsonb)
      FROM jsonb_array_elements(side.value->'reviewers') WITH ORDINALITY AS listed(reviewer, ord)))), '{}'::jsonb)
  FROM jsonb_each(payload) AS side
  WHERE side.key IN ('before', 'after') AND jsonb_typeof(side.value->'reviewers') = 'array')
WHERE jsonb_path_exists(payload, '$.*.reviewers[*] ? (@.nominee.userId == $id)', jsonb_build_object('id', :'person_id'));
ALTER TABLE public.request_agreement_events ENABLE TRIGGER protect_agreement_events;

-- 9. Their personal address as a Free Requests key, written as `allowanceKeyOf` (src/lib/free-request-rules.ts) writes
--    it. Every row with the key gets the same placeholder, so counts and sharing stay. A company domain has no "@" and
--    never matches. The allowance is held first, as creating a Request holds it.
SELECT allowance_key FROM public.free_request_allowances
WHERE allowance_key = (SELECT CASE WHEN domain IN ('gmail.com', 'googlemail.com') THEN replace(mailbox, '.', '') || '@gmail.com' ELSE mailbox || '@' || domain END
      FROM (SELECT split_part(split_part(address, '@', 1), '+', 1) AS mailbox, split_part(address, '@', 2) AS domain
            FROM (SELECT lower(trim((SELECT email FROM public.profiles WHERE id = :'person_id'))) AS address) given) parts)
FOR UPDATE;

ALTER TABLE public.workspace_billing DISABLE TRIGGER protect_workspace_billing;
WITH replaced AS MATERIALIZED (
  SELECT (SELECT CASE WHEN domain IN ('gmail.com', 'googlemail.com') THEN replace(mailbox, '.', '') || '@gmail.com' ELSE mailbox || '@' || domain END
      FROM (SELECT split_part(split_part(address, '@', 1), '+', 1) AS mailbox, split_part(address, '@', 2) AS domain
            FROM (SELECT lower(trim((SELECT email FROM public.profiles WHERE id = :'person_id'))) AS address) given) parts) AS old_key,
    'former-member-' || gen_random_uuid() || '@deleted.invalid' AS new_key
), allowances AS (
  UPDATE public.free_request_allowances a SET allowance_key = replaced.new_key FROM replaced WHERE a.allowance_key = replaced.old_key
)
UPDATE public.workspace_billing b SET allowance_key = replaced.new_key FROM replaced WHERE b.allowance_key = replaced.old_key;
ALTER TABLE public.workspace_billing ENABLE TRIGGER protect_workspace_billing;

-- 10. The profile becomes a tombstone. updated_at moves by trigger (set_updated_at_profiles).
UPDATE public.profiles
SET full_name = 'Former member', email = 'former-member-' || id || '@deleted.invalid', email_verified = false, last_workspace_id = NULL
WHERE id = :'person_id';

-- 11. Look before commit: "Former member" and the placeholder.
SELECT id, full_name, email FROM public.profiles WHERE id = :'person_id';

COMMIT;
```

Rehearse statement 7 on staging (`jznepeqghjixcrpuddym`) against a Request with a review round before the first production use. The JSON shape is fixed by `src/lib/request-review.ts:3-9`; `requests_design_reviews_check` (array) and `requests_design_review_version_check` (`>= 0`) must still pass, and the review panel must still render that Request.

### 3.4 Check

Run after the commit. Expect 0 in every row; if not, run 3.3 again, then this again.

```sql
-- step: check-person
SELECT 'sessions' AS what, count(*) AS left_over FROM public.session WHERE user_id = :'person_id' UNION ALL
SELECT 'sign-in methods', count(*) FROM public.account WHERE user_id = :'person_id' UNION ALL
SELECT 'memberships', count(*) FROM public.member WHERE user_id = :'person_id' UNION ALL
SELECT 'pending invitations', count(*) FROM public.invitation
  WHERE lower(email) = lower(:'person_email') OR (inviter_id = :'person_id' AND status = 'pending') UNION ALL
SELECT 'stored codes', count(*) FROM public.verification
  WHERE identifier IN ('email-verification-otp-' || lower(:'person_email'), 'sign-in-otp-' || lower(:'person_email'), 'forget-password-otp-' || lower(:'person_email')) UNION ALL
SELECT 'profiles with the address', count(*) FROM public.profiles WHERE lower(email) = lower(:'person_email') UNION ALL
SELECT 'notifications', count(*) FROM public.notifications WHERE user_id = :'person_id' OR actor_id = :'person_id' UNION ALL
SELECT 'design reviews still naming them', count(*) FROM public.requests
  WHERE design_reviews::text LIKE '%' || :'person_id' || '%' AND design_reviews::text NOT LIKE '%Former member%' UNION ALL
SELECT 'reviews still naming them',
  (SELECT count(*) FROM public.request_agreements WHERE jsonb_path_exists(reviewers,
    '$.** ? (@.nominee.userId == $id && @.displayNameAtSelection != "Former member")', jsonb_build_object('id', :'person_id')))
  + (SELECT count(*) FROM public.request_agreement_events WHERE jsonb_path_exists(payload,
    '$.** ? (@.nominee.userId == $id && @.displayNameAtSelection != "Former member")', jsonb_build_object('id', :'person_id'))) UNION ALL
SELECT 'Free Requests keys with the address',
  (SELECT count(*) FROM public.workspace_billing WHERE allowance_key = address_key)
  + (SELECT count(*) FROM public.free_request_allowances WHERE allowance_key = address_key)
  FROM (SELECT (SELECT CASE WHEN domain IN ('gmail.com', 'googlemail.com') THEN replace(mailbox, '.', '') || '@gmail.com' ELSE mailbox || '@' || domain END
      FROM (SELECT split_part(split_part(address, '@', 1), '+', 1) AS mailbox, split_part(address, '@', 2) AS domain
            FROM (SELECT lower(trim(:'person_email')) AS address) given) parts) AS address_key) keyed UNION ALL
SELECT 'protections switched off', 2 - count(*) FROM pg_trigger
  WHERE tgenabled = 'O' AND ((tgrelid = 'public.request_agreement_events'::regclass AND tgname = 'protect_agreement_events')
    OR (tgrelid = 'public.workspace_billing'::regclass AND tgname = 'protect_workspace_billing'));
```

### 3.5 Storage (only if the section 6 decision says attachments go too)

Default: attachments the person uploaded stay with their Request. If Nikhil decides otherwise for a given request, remove the objects then the rows, in that order (the same order `attachment-actions.ts:378-388` uses):

```sql
SELECT storage_path FROM public.request_attachments WHERE uploaded_by = :'person_id';
```

Remove each path from `request-attachments` in Dashboard → Storage, or with `createServiceClient().storage.from("request-attachments").remove([...paths])` (`src/lib/supabase/admin.ts`). Then:

```sql
DELETE FROM public.request_attachments WHERE uploaded_by = :'person_id';
```

### 3.6 Close

- [ ] Reply to the person: account deleted on `<date>`; contributions kept anonymised (or deleted, per the decision); backup copies expire within 28 days.
- [ ] Note the completion date in the record from 3.1. Keep the record for the retention period the advice in plan §6.1 (DPDP/GDPR) recommends, then delete it.

---

## 4. Procedure: delete a whole workspace

Requested by an Admin of that workspace.

- [ ] Find the workspace and check the requester is one of its Admins:

```sql
-- step: find-workspace
SELECT o.id, o.name, (SELECT count(*) FROM public.member people WHERE people.organization_id = o.id) AS people
FROM public.member m
JOIN public.profiles p ON p.id = m.user_id
JOIN public.organizations o ON o.id = m.organization_id
WHERE lower(p.email) = lower(:'person_email') AND m.role = 'admin';
```

- [ ] **[N: authorize]** `\set org_id` and delete the row. The cascades do the rest: its Requests and everything on them, Projects, members, invitations, settings and billing state. Two triggers refuse to delete a released or Closed Request (`0029`, `0031`), so the transaction turns them off and on again. Writing Requests waits, in every workspace, while it runs; a failure rolls everything back, the triggers included.

```sql
-- step: delete-workspace
BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT 'requests', count(*) FROM public.requests WHERE org_id = :'org_id';  -- for the record
ALTER TABLE public.requests DISABLE TRIGGER protect_request_release, DISABLE TRIGGER protect_request_closure;
DELETE FROM public.organizations WHERE id = :'org_id';  -- expect DELETE 1
ALTER TABLE public.requests ENABLE TRIGGER protect_request_release, ENABLE TRIGGER protect_request_closure;
COMMIT;
```

- [ ] Check, after the commit:

```sql
-- step: check-workspace
SELECT
  (SELECT count(*) FROM public.organizations WHERE id = :'org_id') AS workspaces,  -- expect 0
  (SELECT count(*) FROM public.requests WHERE org_id = :'org_id') AS requests,  -- expect 0
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.requests'::regclass AND tgenabled = 'O'
    AND tgname IN ('protect_request_release', 'protect_request_closure')) AS protections_on;  -- expect 2
```

- [ ] **[N: authorize]** Storage: delete the folder `<org_id>/` in bucket `request-attachments` (Dashboard → Storage), or list and remove with the service client. The database rows are already gone, so every object under that prefix is orphaned. Look again the next day: an upload already under way can still land.
- [ ] Its people stay signed in. Their next page opens another of their workspaces, or Onboarding.
- [ ] Profiles are not per-workspace. Members who belong to no other workspace keep a profile row (name, email) until they delete their account. Tell the requester that members' accounts are separate and each person can ask for their own deletion.

---

## 5. Shared contributions retained, subject to personal-information review

- **Requests the person created** stay with the workspace, attributed to "Former member". `REQUIREMENTS.md` says closure ownership transfers to another active member when the creator leaves; it does not say the Request leaves with them.
- **Comments** they wrote stay, attributed to "Former member". Other people replied to them; removing them would hollow out the thread.
- **Attachments** they uploaded stay (3.4 is the exception).
- **Projects** they created stay; a Project belongs to the workspace.
- **Reviews** stay, with their name replaced: the answer, its reason and its history are the workspace's record.
- **Design review rounds** stay, with their name replaced. Responses keep `reviewerId` (an opaque id).
- **The `profiles` row** stays as a tombstone because the columns in 1.2 point at it with no `ON DELETE` rule.
- **Other people's data** that mentions the person in free text.
- **Workspace rows** when one member leaves.

### 5.1 Not covered

Nikhil decided on 2026-11-24 that a Reviewer's name and a personal Free Requests address go too (3.3, statements 8 and 9), and on 2026-11-26 that the person's settings go (statement 5) and that a workspace they created whose Free Requests were never decided stops the deletion until they are (3.1). What the procedure still doesn't do:

- **A design review on a Closed Request.** Statement 7 of 3.3 stops with "Closed Request is immutable" if one names the person, and the whole transaction rolls back. The cutover starts from an empty database and nothing writes design reviews any more, so no such row is expected.
- **Payments.** Deleting a workspace doesn't cancel its Stripe subscription or delete its customer record (`workspace_billing`). Deferred until billing is switched on: `DEFERRED.md`, "BILLING SWITCHED ON".

---

## 6. Decision history — superseded by approval above

**Historical alternatives (not current policy).** The historical defaults below delete identity (account, name, email, notifications) and keep content (Requests, comments, attachments, Projects) anonymised. `REQUIREMENTS.md` and `PRODUCT.md` do not say whether a person may demand that their own content be erased from a workspace that still uses it. That is a legal and product call:

- Option A (default here): identity deleted, content anonymised and kept. Matches "Closed is permanent; corrections are append-only" and the closure-ownership transfer rule.
- Option B: identity deleted and the person's own Requests, comments and attachments deleted on request, with cascades removing other members' comments and attachments on those Requests. Simpler to promise, lossy for the workspace.
- Option C: A by default, B when the person insists and the workspace admin agrees in writing.

The 2026-10-20 approval adopts retention of shared contributions with separate review/removal of personal information as required. Never treat the workspace admin's preference as overriding an applicable deletion right. The options above are historical, not the current decision.

---

## 7. What the Privacy page should promise

Plain language, for the page the plan requires before any non-founder data (§6.1, P1–P5):

- "To delete your account, email uselaneapp@gmail.com from the address on the account. We confirm within 3 working days and complete the deletion within 30 days."
- "We delete your sign-in methods, sessions, workspace memberships and pending invitations, and remove your name and email from Lane's profile record. Requests, comments and files you added to a workspace stay with that workspace and are shown as from a former member." (Adjust if section 6 changes the default.)
- "Backup copies are kept for up to 28 days after deletion and then expire."
- "Workspace admins can ask us to delete a whole workspace, including all its Requests and files."
- List the processors: Supabase, Vercel, Resend, Cloudflare Turnstile, Google sign-in, Have I Been Pwned, Anthropic, Upstash, and the monitoring provider chosen under decision 8.13.

The 3-working-day acknowledgement, 30-day target and 28-day maximum backup window were approved on 2026-10-20. The published privacy page is the current wording; these older examples are not stronger guarantees. Before executing a deletion, inventory every relevant local and off-machine copy and record its expiry deadline.

---

## 8. Record of deletions

Append one dated line per request: date received, type (person or workspace), the opaque id, date completed, which option from section 6 applied. No names or emails here.

- (none yet)
