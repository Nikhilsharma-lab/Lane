# Manual Account and Workspace Deletion Procedure

> **For agentic workers:** This is an operating procedure. It authorizes nothing by itself. Every production write below needs Nikhil's explicit go-ahead for that run, and the SQL is a template with placeholders, never a script to execute unattended. Lane has no Clerk webhooks by design (`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md` §6.1, G11), so nothing here happens automatically.

**Goal:** When a person asks Lane to delete their account, or a workspace admin asks to delete a workspace, remove what Lane and Clerk hold about them in a known order, within the window the Privacy page promises, without breaking the workspace they leave behind.

**Authority:** Plan §6.1 row "Manual deletion procedure (no Clerk webhooks by design)", owner N+A, ref G11. Data shapes come from `src/db/migrations/0013_clerk_clean_cutover.sql`, `0015`–`0018` and `src/db/schema/*.ts`. The rule that a Request outlives its creator comes from `REQUIREMENTS.md` "Closure ownership" ("If the creator leaves or loses access, a Clerk organization admin explicitly transfers outcome ownership to another active member").

**Status:** Draft for Nikhil's approval. One decision is open (section 6). Nothing has been run against production.

---

## 1. Where a person's data lives

Clerk is the only identity and tenancy authority. Lane's Postgres holds a thin profile plus the work the person did. The two never sync back: Lane copies name, email and avatar URL from Clerk at onboarding (`src/app/(auth)/onboarding/actions.ts:33-51`) and on profile save, and Clerk never reads Lane.

### 1.1 In Clerk (production instance)

| Object | What it holds | Deleted by |
|---|---|---|
| User (`user_*`) | name, email, password hash, avatar image, OAuth links, sessions, sign-in history | Clerk Dashboard → Users → Delete user, or the Backend API `users.deleteUser` (the pattern `e2e/helpers/test-user.ts:45-53` uses on the dev instance) |
| Organization memberships | which workspaces the person is in, with `org:admin` or `org:member` | removed with the user; or Dashboard → Organizations → Members → Remove to leave one workspace only |
| Organization (`org_*`) | workspace name, slug, logo, members, pending invitations | Dashboard → Organizations → Delete, or `organizations.deleteOrganization` |
| Invitations | email address of each invitee, inviter id, status | removed with the organization; revoke individually in the Dashboard |

### 1.2 In Lane (Supabase Postgres, schema `public`)

| Table | Columns naming the person | Delete rule from the schema | Meaning |
|---|---|---|---|
| `profiles` | `id` (= Clerk user id), `full_name`, `email`, `avatar_url`, `role` | primary key | the only row that is purely about the person |
| `requests` | `created_by`, `assigned_to` | `REFERENCES profiles(id)` with no `ON DELETE` (no action) | deleting the profile fails while any Request names it |
| `comments` | `author_id` | no action | same |
| `request_attachments` | `uploaded_by` | no action; `request_id` and `org_id` cascade | same; the file itself is a storage object (1.3) |
| `projects` | `created_by` | no action (`0015`) | same |
| `notifications` | `user_id` (recipient), `actor_id` (who did the thing) | both `ON DELETE CASCADE` | these go away with the profile on their own |
| `requests.design_reviews` (jsonb, `0018`) | `requestedBy {id, name}`, `reviewers[] {id, name}`, `responses[].reviewerId`, `withdrawal.by {id, name}` | none (JSON) | name snapshots frozen at review time (`src/lib/request-review.ts:3-9`) |
| `organizations` | `owner_id` (first admin's Clerk user id) | nullable, no FK | an id, not a name |

Free-text fields (`requests.description`, `comments.body`, `expected_impact`, Intake answers) may mention people by name. They are workspace content, not account data; see section 6.

### 1.3 In Supabase Storage

Bucket `request-attachments` (private). Object path is `<org_id>/<request_id>/<attachment_id>` (`src/app/(app)/intake/attachment-actions.ts:137`). The object carries the file bytes; the file name, MIME type and uploader are only in `request_attachments`.

### 1.4 Elsewhere, transient

| Processor | What | Expires |
|---|---|---|
| Upstash Redis | rate-limit counter keyed `lane:ratelimit:ai:<user_id>` (`src/lib/rate-limit.ts:21-23`) | 60 seconds |
| Vercel | request logs with IPs and paths | Vercel's log retention for the plan; nothing to do |
| Anthropic | Intake text sent through the AI gate (`src/lib/ai/triage.ts`) | per Anthropic's API data-retention terms at the time; check the current terms when writing the Privacy page |
| Weekly `pg_dump` copies (`2026-10-10-production-cutover-runbook.md` 5.12) | a full copy of `public` | rotated: last four weekly dumps kept, so at most 28 days after the live deletion |

---

## 2. Order of deletion for one person, and why

**Clerk first, then Lane.**

1. Profile data flows one way, Clerk → Lane. `saveOnboardingRole` upserts `full_name`, `email` and `avatar_url` from Clerk every time it runs (`onboarding/actions.ts:33-51`). If Lane were cleaned first and the person could still sign in, one visit to `/onboarding` would write their name and email back.
2. Deleting the Clerk user ends every session at once. From that moment no server action can run as that user, so the Lane rows are stable while the SQL runs.
3. Nothing in Lane calls Clerk for a user that no longer exists. Profiles are read by id only; the Members page and reviewer picker list Clerk memberships and skip anyone without a profile or membership (`src/lib/request-review-members.ts:10-37`).
4. The foreign keys without `ON DELETE` (section 1.2) mean a plain `DELETE FROM profiles` fails for anyone who created a Request, a comment, an attachment or a Project. The default is therefore to **anonymise** the profile row and **keep** the person's contributions attributed to a tombstone (section 6 is the open decision). Notifications cascade when a profile is deleted; for the anonymise path they are deleted explicitly.

The e2e helper `deleteTestWorkspace` (`e2e/helpers/cleanup.ts:217-227`) deletes the Lane row before the Clerk organization. That order is fine for disposable fixtures with no live sessions. It is the wrong order for a real workspace: `ensure-workspace.ts:76-93` re-inserts the `organizations` row from Clerk on any member's next page load while the Clerk organization still exists.

---

## 3. Procedure: delete one person's account

Steps marked **[N: authorize]** are production writes.

### 3.1 Receive and verify

- [ ] The request arrives at `support@` (plan §6.1, H3) from the email address on the account, or from a signed-in session. Reply within 3 working days acknowledging it and stating the 30-day window (section 7).
- [ ] Record: Clerk user id `user_…`, the email, the date received. Keep the record outside the repo.
- [ ] Look up what the person touched, read-only, with a session-mode connection string pasted into the shell for this run only (never into an env file; see the runbook, section 2):

All SQL below is written for `psql -X -v ON_ERROR_STOP=1`. Set the id once; `:'person_id'` then expands to a correctly quoted literal everywhere.

```sql
\set person_id user_REPLACE_ME

SELECT 'requests_created', count(*) FROM public.requests WHERE created_by = :'person_id' UNION ALL
SELECT 'requests_assigned', count(*) FROM public.requests WHERE assigned_to = :'person_id' UNION ALL
SELECT 'comments', count(*) FROM public.comments WHERE author_id = :'person_id' UNION ALL
SELECT 'attachments', count(*) FROM public.request_attachments WHERE uploaded_by = :'person_id' UNION ALL
SELECT 'projects', count(*) FROM public.projects WHERE created_by = :'person_id' UNION ALL
SELECT 'notifications_received', count(*) FROM public.notifications WHERE user_id = :'person_id' UNION ALL
SELECT 'notifications_as_actor', count(*) FROM public.notifications WHERE actor_id = :'person_id' UNION ALL
SELECT 'reviews_named_in', count(*) FROM public.requests
  WHERE design_reviews::text LIKE '%' || :'person_id' || '%';
```

### 3.2 Clerk **[N: authorize]**

- [ ] If the person is the only admin of a workspace that other people still use, ask them (or promote another member) before deleting; otherwise the workspace is left without an admin. Clerk refuses to remove the last admin from an organization in some configurations; deleting the user removes the membership regardless.
- [ ] Dashboard → Users → the user → **Delete user**. Confirm the user is gone (searching the email returns nothing).

### 3.3 Lane: anonymise and remove **[N: authorize]**

Run in one transaction with the same `\set person_id` as 3.1. The tombstone keeps the opaque Clerk id as the key because every FK points at it; the id is not personal data by itself.

```sql
BEGIN;

-- 1. Their notifications. The profile stays, so the CASCADE does not fire; delete explicitly.
DELETE FROM public.notifications WHERE user_id = :'person_id' OR actor_id = :'person_id';

-- 2. Open assignments: unassign so the Request can be picked up by someone else.
UPDATE public.requests SET assigned_to = NULL
WHERE assigned_to = :'person_id' AND status <> 'done';

-- 3. Name snapshots inside design reviews (0018): requestedBy, reviewers[], withdrawal.by.
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

-- 4. The profile becomes a tombstone. updated_at moves by trigger (set_updated_at_profiles).
UPDATE public.profiles
SET full_name = 'Former member', email = '', avatar_url = NULL
WHERE id = :'person_id';

-- 5. Check before commit: no name or email left anywhere.
SELECT id, full_name, email, avatar_url FROM public.profiles WHERE id = :'person_id';
SELECT count(*) FROM public.notifications WHERE user_id = :'person_id' OR actor_id = :'person_id';  -- expect 0
SELECT count(*) FROM public.requests
  WHERE design_reviews::text LIKE '%' || :'person_id' || '%'
    AND design_reviews::text NOT LIKE '%Former member%';  -- expect 0

COMMIT;
```

Rehearse step 3 on staging (`jznepeqghjixcrpuddym`) against a Request with a review round before the first production use. The JSON shape is fixed by `src/lib/request-review.ts:3-9`; `requests_design_reviews_check` (array) and `requests_design_review_version_check` (`>= 0`) must still pass, and the review panel must still render that Request.

### 3.4 Storage (only if the section 6 decision says attachments go too)

Default: attachments the person uploaded stay with their Request. If Nikhil decides otherwise for a given request, remove the objects then the rows, in that order (the same order `attachment-actions.ts:378-388` uses):

```sql
SELECT storage_path FROM public.request_attachments WHERE uploaded_by = :'person_id';
```

Remove each path from `request-attachments` in Dashboard → Storage, or with `createServiceClient().storage.from("request-attachments").remove([...paths])` (`src/lib/supabase/admin.ts`). Then:

```sql
DELETE FROM public.request_attachments WHERE uploaded_by = :'person_id';
```

### 3.5 Close

- [ ] Reply to the person: account deleted on `<date>`; contributions kept anonymised (or deleted, per the decision); backup copies expire within 28 days.
- [ ] Note the completion date in the record from 3.1. Keep the record for the retention period the advice in plan §6.1 (DPDP/GDPR) recommends, then delete it.

---

## 4. Procedure: delete a whole workspace

Requested by a Clerk `org:admin` of that workspace. **Clerk first**, for the reason in section 2.

- [ ] Verify the requester is an admin of `org_…` (Clerk Dashboard → Organizations → Members).
- [ ] **[N: authorize]** Dashboard → Organizations → the organization → **Delete**. Members lose the active organization immediately; every Lane read and write is scoped by it, so no one can reach the rows from now on.
- [ ] **[N: authorize]** Lane rows. One statement; the cascades in 0013 and 0015 do the rest.

```sql
\set org_id org_REPLACE_ME

BEGIN;
SELECT 'requests', count(*) FROM public.requests WHERE org_id = :'org_id';   -- for the record
DELETE FROM public.organizations WHERE id = :'org_id';
-- cascades: requests → comments, request_attachments, notifications; projects; notifications by org_id
SELECT count(*) FROM public.requests WHERE org_id = :'org_id';   -- expect 0
COMMIT;
```

- [ ] **[N: authorize]** Storage: delete the folder `<org_id>/` in bucket `request-attachments` (Dashboard → Storage), or list and remove with the service client. The database rows are already gone, so every object under that prefix is orphaned.
- [ ] Profiles are not per-workspace. Members who belong to no other workspace keep a profile row (name, email) until they delete their account. Tell the requester that members' accounts are separate and each person can ask for their own deletion.

---

## 5. What is NOT deleted (defaults, pending section 6)

- **Requests the person created** stay with the workspace, attributed to "Former member". `REQUIREMENTS.md` says closure ownership transfers to another active member when the creator leaves; it does not say the Request leaves with them.
- **Comments** they wrote stay, attributed to "Former member". Other people replied to them; removing them would hollow out the thread.
- **Attachments** they uploaded stay (3.4 is the exception).
- **Projects** they created stay; a Project belongs to the workspace.
- **Design review rounds** stay, with their name replaced. Responses keep `reviewerId` (an opaque id).
- **The `profiles` row** stays as a tombstone because seven columns across five tables point at it with no `ON DELETE` rule.
- **Other people's data** that mentions the person in free text.
- **Workspace rows** when one member leaves.

---

## 6. Open decision for Nikhil

**Content versus identity.** The defaults above delete identity (Clerk account, name, email, avatar, notifications) and keep content (Requests, comments, attachments, Projects) anonymised. `REQUIREMENTS.md` and `PRODUCT.md` do not say whether a person may demand that their own content be erased from a workspace that still uses it. That is a legal and product call:

- Option A (default here): identity deleted, content anonymised and kept. Matches "Closed is permanent; corrections are append-only" and the closure-ownership transfer rule.
- Option B: identity deleted and the person's own Requests, comments and attachments deleted on request, with cascades removing other members' comments and attachments on those Requests. Simpler to promise, lossy for the workspace.
- Option C: A by default, B when the person insists and the workspace admin agrees in writing.

Get this into the DPDP/GDPR advice the plan already asks for (§6.1, "Get advice on DPDP/GDPR") and record the answer here and on the Privacy page. Until then, no content deletion runs.

---

## 7. What the Privacy page should promise

Plain language, for the page the plan requires before any non-founder data (§6.1, P1–P5):

- "To delete your account, email support@uselane.app from the address on the account. We confirm within 3 working days and complete the deletion within 30 days."
- "We delete your account in Clerk (identity) and remove your name, email and avatar from Lane. Requests, comments and files you added to a workspace stay with that workspace and are shown as from a former member." (Adjust if section 6 changes the default.)
- "Backup copies are kept for up to 28 days after deletion and then expire."
- "Workspace admins can ask us to delete a whole workspace, including all its Requests and files."
- List the processors: Clerk, Supabase, Vercel, Anthropic, Upstash, and the monitoring provider chosen under decision 8.13.

The 30-day figure is the default to promise; it leaves room for the acknowledgement, a rehearsal on staging the first time, and the weekly backup rotation. The 28-day backup line depends on the retention default in the runbook (5.12), which Nikhil still has to confirm.

---

## 8. Record of deletions

Append one dated line per request: date received, type (person or workspace), the opaque id, date completed, which option from section 6 applied. No names or emails here.

- (none yet)
