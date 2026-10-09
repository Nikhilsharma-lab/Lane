# Clerk clean-cutover implementation plan

## Outcome

Replace Supabase Auth and Lane-owned tenancy/invitation state with Clerk. Clerk is the only authority for users, sessions, organizations, memberships, organization roles, and invitations. Supabase remains the Postgres host and private attachment store. All current Lane users and application data are disposable test data and will be reset instead of migrated.

## Product decisions locked by this cutover

- No Supabase Auth compatibility layer and no user/password import.
- No local `workspace_members` or `invites` tables.
- Clerk user IDs (`user_*`) and organization IDs (`org_*`) are stored directly as Lane's ownership keys.
- `profiles.role` remains the non-permission PM / Designer / Developer label.
- **Approved 2026-09-24:** sign up → create/join Clerk workspace → choose functional label → Requests;
  Clerk Organizations remains **Membership required**.
- Clerk's built-in `org:admin` and `org:member` roles are the production roles on the free B2B tier.
- Lane's `guest` permission remains represented in code only if Clerk supplies `org:guest`; enabling that custom role in production requires Clerk Enhanced B2B. Lane will not recreate guest authorization in Postgres.
- Existing sessions end at cutover and all people create fresh Clerk accounts.

## Safety gates

1. Preserve the current dirty working tree; do not overwrite unrelated documentation work.
2. Create and verify a database export immediately before every staging or production migration.
3. Apply the canonical migration to Lane Staging first.
4. Verify sign-up, organization creation, active-organization enforcement, invitation acceptance, request isolation, and attachment authorization on staging.
5. Only after staging evidence passes, export production and apply the same migration there.
6. Never print or request Clerk, Supabase, or database secrets in chat or command output.

## Schema cutover

Create one destructive canonical migration that:

1. Empties test application data in dependency order.
2. Drops Supabase-auth-dependent policies/functions and the local `invites` and `workspace_members` tables.
3. Changes organization and user ownership columns from UUID to text.
4. Removes `profiles.org_id`; a Clerk user profile is global while organization context comes from the active Clerk organization.
5. Keeps `organizations` as a non-authoritative domain projection keyed by Clerk organization ID for relational integrity and request display data.
6. Keeps `profiles` as a non-authoritative domain projection keyed by Clerk user ID for Lane's functional-role label and request/comment attribution.
7. Updates every request, comment, notification, and attachment foreign key to the new text identifiers.
8. Revokes public Data API access to application tables; server-side Drizzle remains the application data path.

## Application cutover

### Authentication shell

- Install `@clerk/nextjs` and `@clerk/ui` through the official Clerk initializer.
- Mount `ClerkProvider` inside `<body>` and apply Clerk's shadcn theme.
- Replace Supabase session middleware with `clerkMiddleware` in `src/proxy.ts`.
- Replace login, signup, password recovery, callback, and sign-out behavior with Clerk components/helpers.
- Remove Supabase browser/server auth clients; retain only the service-role storage client.

### Tenant context and guards

- Rebuild `getWorkspace()` from awaited Clerk `auth()` plus `currentUser()`.
- Require an active Clerk organization for every application screen.
- Upsert only the current Clerk organization and user projection needed by Lane data.
- Rebuild shared guards from Clerk's `userId`, `orgId`, and `orgRole`; reject a client-passed organization that differs from the active Clerk organization.
- Preserve the rule that identity is always derived on the server and never accepted from action arguments.

### Onboarding

- Clerk's authentication components handle the pending `choose-organization` task before Lane onboarding:
  create a workspace or join through a Clerk invitation, then activate the organization.
- Resume interrupted organization setup through the existing `/login` route. Do not create a second Lane
  organization-setup route or treat a pending session as authorized app access.
- Require a valid active Clerk organization before reading Lane's onboarding profile or saving its label.
- Preserve Lane's role choice (PM / Designer / Developer) as the final onboarding step at `/onboarding`;
  it grants no permissions. Existing labels skip this step after organization activation.
- After both organization activation and label selection, project the organization/user needed by Lane's
  domain data and enter Requests. No organization-less Requests access.

### Members and invitations

- Replace Lane's invite/member CRUD with Clerk's Organization management component/API.
- Clerk sends and accepts invitation emails; remove Resend-based workspace invitation email code.
- Keep the Lane Members route as the product entry point while Clerk owns the underlying state and mutations.

### Existing domain actions

- Convert database ownership identifiers and Zod validation from UUID to Clerk string IDs.
- Preserve request lifecycle and notification behavior.
- Keep Supabase Storage service-role operations, but authorize every operation with the Clerk guard before issuing a signed URL.

## Test-first sequence

1. Add failing unit tests for Clerk guard identity/org mismatch/admin/guest behavior.
2. Add failing tests for workspace-first onboarding, pending/no-active-organization denial, interrupted task
   recovery through `/login`, label-save authorization, and workspace projection.
3. Add failing contract tests proving no production file imports Supabase Auth or local membership/invite schema.
4. Implement the minimum auth/context changes to pass them.
5. Update action and page tests to mock Clerk server APIs.
6. Update Playwright helpers to create/delete Clerk test users and organizations without exposing secrets.
7. Run focused tests after each slice, then full lint, TypeScript, unit suite, production build, and staging browser E2E.

## Rollback

- Code rollback: redeploy the last Supabase-Auth commit.
- Data rollback: restore the verified pre-migration export. Because the cutover intentionally destroys test data and changes identifier types, there is no forward compatibility bridge.
- Clerk objects created during a failed staging rehearsal are test objects and can be deleted before retrying.

## Checkpoint — 2026-09-24

- Local implementation is on `codex/clerk-clean-cutover`; no commit, push, or deployment has been made.
- Lane Staging was resumed. The pre-cutover dump was created and its archive listing verified before
  migration `0013_clerk_clean_cutover.sql` was applied. Production has not been migrated or deployed.
- Clerk Organizations remains **Membership required**. An interrupted organization-selection task resumes
  at `/login`; neither Lane role selection nor Requests is available without an active recognized membership.
- Final local checks passed: 33 test files / 189 tests, TypeScript, ESLint, production build, and
  `git diff --check`.
- Focused browser checks used the local application with staging services: existing-member onboarding,
  organization-first onboarding and refresh recovery, workspace isolation, role-save retry, and role-selector
  keyboard/visual checks. The full browser suite has not been run.
- Intake recovery passed desktop/mobile in light/dark: real Clerk sign-in returned to the saved draft and
  Request creation succeeded. The expired-session fixture reloads the recovery URL to discard its stale
  in-memory Clerk session. Signed Intake reviews now accept opaque Clerk IDs while preserving signature,
  expiry, user, and organization binding.
- **Next gate:** deploy this branch to staging, then verify actual signup, emailed invitation acceptance,
  and attachment authorization on the deployed application. The old staging deployment is not compatible
  with the migrated schema; redeploying old `main` is not a cutover. Production remains blocked on this gate.

## Release attempt — 2026-09-24

- The user authorized completing staging deployment/verification and then the production cutover.
- Live Git inspection found commit `8490730` already pushed on `codex/clerk-clean-cutover`; `main` remains
  `826e509`. Vercel has a Ready preview for that commit in the separate `lane-staging` project:
  `dpl_BibXBgxWNZZc3Qmwz4dG7ky81aHw`. It has not been promoted to `lane-staging.vercel.app`.
- Release review found the three timestamp triggers absent after 0013. Live staging inspection also
  found RLS disabled on all six recreated tables (the local baseline's hosted auto-RLS helper had masked
  that difference); table grants remained revoked. Added canonical, non-destructive migration
  `0014_restore_clerk_table_safeguards.sql` and real database regressions.
- Before applying 0014, exported staging's public schema/data to
  `backups/lane-staging-pre-0014-2026-09-24T09-53-03-209Z.dump` (24,389 bytes, mode 0600).
  Verified its archive listing and a full archive read. Applied 0014 only to staging; verified all six
  RLS flags, denied anon/authenticated SELECT privileges, and all three restored timestamp triggers.
- Fresh local verification passed: 34 files / 205 tests, TypeScript, full ESLint, and diff checks.
  The production build passed before the database-only follow-up; no runtime application code changed.
- Added `e2e/clerk-attachments.spec.ts` for real upload/finalization/exact-byte download plus anonymous,
  foreign-workspace, forged-context, and public-storage denial. Its live deployed run is still pending.
- Dashboard automation safety review blocked the staging project's action named **Promote to Production**.
  Requested explicit confirmation that this is a staging-only promotion to `lane-staging.vercel.app`,
  with staging credentials, and does not affect `app.uselane.app`. Do not work around that pending approval.
- Production's Clerk live instance has not been created. The development instance has an unlimited-members
  paid feature selected; do not clone that into production or purchase an add-on without approval. Production
  requires its own live keys/domain configuration after staging gates pass. No production changes were made.

## Staging-only promotion — 2026-09-24

- The user explicitly approved **staging-only promotion**. The Vercel confirmation listed only
  `lane-staging.vercel.app`; the separate `lane` project and `app.uselane.app` were not changed.
- Deployment `dpl_2CbhmNwtWKgeQoyMWVgtaoai2dtd` is **Ready** on the stable staging domain, built from
  `codex/clerk-clean-cutover` commit `8490730`. Clerk login and signup render there.
- Follow-up commit `28259f5` was pushed on the same branch. It contains migration 0014, database
  regression checks, attachment E2E coverage, and this release record; runtime application source is
  unchanged from the promoted commit. `main` remains `826e509`.
- Fresh release checks passed: 34 files / 205 unit tests, TypeScript, full ESLint, production build,
  and `git diff --check`.
- Live staging attachment verification passed (2 tests including Clerk setup): real Intake review,
  Request creation, private upload/finalization, exact-byte download, anonymous and cross-workspace
  denial, forged organization-context denial, and unsigned public-storage denial. Disposable fixtures
  were cleaned up.
- Live staging signup verification passed (2 tests including Clerk setup): visible email/password
  signup, test email OTP, required organization creation, PM label selection, and Requests. No API-created
  user shortcut was used; Lane had no profile before membership. Disposable fixtures were cleaned up.
  The first run exposed only an overly strict test selector; the corrected accessible-name selector
  passed without changing application code.
- Live staging onboarding/isolation verification passed (4 tests including Clerk setup, 1.9 minutes):
  existing-organization role selection, organization-first interrupted-sign-in and refresh recovery,
  and two-workspace board/detail isolation. No application or test-harness changes were needed.
- The user approved one real invitation to their test alias. Clerk's development Backend API created a
  Member invitation without a custom redirect, matching the shipped OrganizationProfile invitation
  defaults. The Members button itself was not exercised by this backend send.
- Gmail verified delivery on 2026-09-24 at 10:50 UTC, but classified the message as **Spam**, not Inbox.
  Subject: `[Development] Invitation to join Lane Staging Invite Test`. SPF, DKIM, and DMARC passed;
  no cause of the spam classification is established. Sender branding is still
  `My Application <invitations@accounts.dev>` and needs review before production.
- The disposable `Lane Staging Invite Test` workspace remains available for acceptance verification:
  organization `org_3JlsYOqN0uI0uKzYHtmZqAZZ9Rt`, invitation `orginv_3JlsYR9yx0beWPDmkDrihWWafBF`,
  test inviter `user_3JlsYJ4IAnmSXgDUxgBtsGhksor`. No invitation token or password is recorded here.
- The user accepted the emailed invitation. A fresh Clerk Backend API read verified status `accepted`
  and the invited alias's membership in the expected organization with role `org:member`.
- The end-to-end return to Lane failed: after organization selection the hosted portal displayed
  `Clerk cannot redirect to your application`. Live dashboard inspection found **Fallback development
  host blank** under Configure → Paths; Account Portal sign-in/sign-up fallbacks use `$DEVHOST` with
  empty relative paths. Lane's embedded component props do not supply this separately hosted fallback.
- The user explicitly approved the minimal staging-only correction. Saved the development instance's
  fallback development host as `https://lane-staging.vercel.app` and verified the value persisted after
  reloading Clerk's Paths page. Existing root paths, password settings, and production were unchanged.
  Lane's existing root guard sends members without a profile to `/onboarding`.
- The real invited session's automatic return to Lane, role-label step, and Requests still require
  verification after this setting change. No full-browser-suite or Inbox-placement claim is made.
- **Production is still untouched.** Do not merge `main` or cut over production before the staging
  gates pass and production-specific Clerk configuration is ready.

## Reliability audit — 2026-09-25

- `/forgot-password` and `/reset-password` no longer bounce to `/login`. They use Clerk's custom
  `useSignIn` + `reset_password_email_code` flow (not `<SignIn>` on those routes — that fights
  `signInUrl=/login`). `/reset-password` still resumes the `reset-password` session task.
  `ClerkProvider` now lists Lane origins and the reset-password task URL so hosted invitation/reset
  returns are not rejected as unknown.
- Playwright Clerk mutations refuse anything except `pk_test_` / `sk_test_`. Local/dev database
  connections refuse a hosted URL that is not Lane Staging unless `LANE_ALLOW_HOSTED_DB=1`.
- The earlier invitation was accepted in Clerk. Automatic return after the hosted portal still needs
  a repeat live check; a later `/onboarding` visit is not that evidence.
- Production remains on `main` and is unchanged.

## Reliability audit — 2026-09-28 (repair approval pending)

### Scope and environment evidence

- Audited the existing Requests implementation, not the unimplemented alignment/outcome contract.
  Branch: `codex/clerk-clean-cutover`; HEAD: `c165c565d14399ba98b5cb840fbb8662733d63ea`.
  Existing tracked and untracked changes, including password-recovery work, belong to the user/parallel work.
- Read-only Vercel inspection: stable staging is Ready at `8490730`, deployment
  `2CbhmNwtWKgeQoyMWVgtaoai2dtd`; production is Ready on `main` at `826e509`, deployment
  `5Wz85bAKY8XCx8NA3fucLk9BdLqG`. Local source findings are not claims of reproductions on either deployment.
- No application repairs, provider changes, hosted database writes, emails, commits, pushes or deployments.
  No Clerk E2E setup ran. Two independent read-only audits covered auth and domain data paths; the
  destructive-test findings received a separate review.

### Fresh baseline

| Check | Result and limitation |
|---|---|
| `pnpm lint` | Passed, exit 0. Package-manager update lookup warned about network access; ESLint completed. |
| `pnpm exec tsc --noEmit` | Initial baseline passed, exit 0. A post-build repeat was stopped by pnpm's automatic install check requesting a modules purge (no TTY); no purge was approved. Running the already-installed compiler directly with `node node_modules/typescript/bin/tsc --noEmit` then passed, exit 0. Package manifest/lockfile unchanged. |
| `pnpm test` | 37 files / 217 tests passed, exit 0. PostgreSQL was first queried to verify loopback `127.0.0.1:5432`, database `lane_test`, and only the known fixture organizations/profiles. Ran with a clean environment, explicit local `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE`; only this disposable database was reset. |
| `pnpm build` | Passed with inert provider credentials, local-only database URL, `LANE_ENV_FILE=/dev/null`, and `.next-audit` output. All keys found in Next's production env-file candidates were overridden to prevent loading real secrets. First sandbox attempt failed only fetching Google Fonts; authorized network retry compiled and generated 13 static pages. Not proof of live provider configuration. |
| `git diff --check` | Passed. Next's automatically added `.next-audit` TypeScript include entries were removed; the pre-audit tracked diff hash was restored exactly before this record was appended. |
| Clerk/browser E2E | Not run: destructive setup and remote fixture ownership need a safety repair and explicit execution approval. Existing Vercel metadata was inspected without exercising application journeys. |
| Dependency advisory lookup | Not completed. Initial network attempt failed; security review blocked sending the locked dependency inventory to npm. Explicit disclosure approval requested; no workaround or package upgrade. |

The baseline contains both behavioral/database tests and source-string contract tests; 217 passing tests are
not 217 end-to-end journeys. The production build already uses Next's minification. Aggregate emitted static
JavaScript: 34 chunks, 1,740,314 bytes raw / 516,033 bytes independently gzip-compressed. This is all emitted
chunks, not one route's transfer, real-user latency, or a before/after improvement. No source compression,
dead-code deletion, speculative caching or dependency changes are recommended before the defects below.

### Prioritized findings

**A1 — P1: unit-test reset can target a different database connection from the one validated.**

- Evidence: `src/test/global-setup.ts:42–68` checks only the URL hostname, then calls `dropdb`, `createdb`
  and `psql` without connection arguments. It does not require the URL database to be `lane_test`.
- Reproduction: a memory-only VM ran the actual setup with subprocess calls intercepted. Both
  `localhost/lane_test` and `localhost/not_a_test_database` were accepted; generated destructive commands
  had no host/port/user while inherited `PGHOST`/`PGSERVICE` pointed at nonlocal sentinels. No such command
  was executed. In ordinary execution, CLI defaults can target another server, or tests can write to a
  local database different from the reset target.
- Repair: validate one exact disposable PostgreSQL target; bind every subprocess to it using argv and a
  sanitized environment. Reject service/host overrides and non-test database names. Use `psql -X` and
  `ON_ERROR_STOP=1` for every script. This run's manually pinned environment is containment, not a fix.
- Regression/risk: wrong database, alternate routing and hostile inherited PG variables must yield zero
  destructive subprocesses; the valid local fixture run must still pass. Risk is accidental data deletion.

**A2 — P1: browser-test cleanup does not establish staging identity or disposable ownership.**

- Evidence: `playwright.config.ts:7–22` loads environment files without a mandatory target check;
  `e2e/helpers/cleanup.ts:7–31,75–86` uses a raw database URL and creates a Clerk organization before
  checking database configuration; `e2e/helpers/test-user.ts:45–80` deletes every organization in which a
  matching test user is admin. `e2e/clerk.setup.ts:5–7` runs this broad cleanup automatically.
- Reproduction by source trace: absent staging overlay leaves the other database URL available; a fixture
  user that is also admin of an unrelated development organization causes that organization to be selected
  for deletion. Development key prefixes do not prove exact instance or fixture ownership. Not executed.
- Repair: fail-closed preflight for exact staging database identity, approved base URL and intended Clerk
  development instance before any mutation, repeated in helpers. Delete only recorded, ownership-verified
  fixtures; remove the automatic broad sweep. Do not reuse the app guard's production/bypass allowance.
- Regression/risk: mocked wrong-instance/wrong-database/base-URL cases and mixed fixture/nonfixture
  memberships must perform zero unintended writes/deletes. Operational P1; no observed deletion claimed.

**A3 — P1: guest downgrade does not revoke notification access to other people's Requests.**

- Evidence: `src/app/(app)/notifications/actions.ts:13–54` returns Request titles and actor identities,
  filtered only by recipient/workspace; count has the same gap. `requests/[id]/actions.ts:164–181`
  continues notifying a stored assignee. `src/lib/notifications-read.test.ts:109–117` tests only an
  already-authorized guest notification, not a downgrade.
- Reproduction scenario: B picks up A's Request; A comments and B receives a notification; B becomes `org:guest`;
  board/detail deny A's Request but notification reads still disclose its title/actor, including later
  comment notifications. Confirmed query omission; not exercised with a live user. Production guest
  availability remains plan-gated, so current real-user exposure is not established.
- Repair: apply current Request/org visibility, including guest creator ownership, consistently to list
  and unread count. Specify non-Request notification behavior without expanding guest access.
- Regression/risk: downgraded guest sees only their own Request-linked entries/count; member, foreign-org
  and non-Request controls remain correct. Low–medium query risk; no new membership authority needed.

**A4 — P2: retrying one attachment can abandon other failed uploads.**

- Evidence: `src/app/(app)/intake/intake-form.tsx:890–913` navigates when the attempted subset succeeds;
  the per-file control at `:1917` passes one file. Draft recovery is cleared at `:858–860`.
- Reproduction: actual retry function extracted/transpiled into a memory-only VM; two failed files,
  successful retry of A → A uploaded, B still failed, navigation fired. No services called.
- Repair: decide completion from the whole retained upload queue; stay in recovery until every retained
  file succeeds or the person explicitly removes/skips it. Avoid checking stale React state after updates.
- Regression/risk: one of two failures succeeds → no navigation; final failure succeeds → one navigation;
  explicit skip/remove remains possible. Low risk, bounded attachment-recovery interaction change.

**A5 — P2: thrown Storage errors leak attachment reservations and exhaust quota.**

- Evidence: `src/app/(app)/intake/attachment-actions.ts:164–216` commits a reservation before Storage
  client creation/signing. Returned errors delete it; the exception path does not and returns no cleanup ID.
- Reproduction: actual action module with in-memory dependencies, Storage client creation throwing after
  reservation → five `storage_unavailable` results then `limit_reached`, five rows retained, zero deletes.
- Repair: track reservation ownership and perform scoped best-effort cleanup on pre-response signing
  exceptions, preserving the original failure if cleanup also fails. No schema or cron required.
- Regression/risk: thrown client/signing failures leave no quota row; unrelated rows untouched; next healthy
  attempt succeeds. Low server-side risk; DB outages/lost responses still need separately stated limits.

**A6 — P2: local password-recovery flow has incomplete continuation and retry states.**

- Evidence: untracked `src/components/auth/password-recovery-form.tsx:32,47–58,69–77,89–137` handles only
  request/sent and throws on every non-complete Clerk status; there is no resend/change-email/restart path.
  `e2e/clerk-password-recovery.spec.ts:3–25` checks routes/headings, not a successful reset.
- Reproduction: actual completion function with in-memory Clerk responses activates for `complete` but
  errors for `needs_second_factor`. After an expired code, the source offers only resubmission of that code.
  Clerk documents the second-factor branch in its [legacy recovery guide](https://clerk.com/docs/guides/development/custom-flows/authentication/legacy/forgot-password).
  This is not a diagnosis of the user's earlier live failure; enabled factors were not checked.
- Repair: use supported Clerk continuation for enabled factors and provide an accessible resend/restart
  path with throttling and duplicate-send prevention. Never bypass a required factor or persist reset secrets.
- Regression/risk: complete, additional-factor, invalid/expired-code, weak-password, activation-failure and
  controlled email reset-to-Requests tests. Auth-critical; requires approved browser/provider verification.

**A7 — P2: Clerk workspace renames are not reflected in Lane's cached display projection.**

- Evidence: `src/lib/ensure-workspace.ts:58–95` fetches Clerk organization data only when the local row
  does not exist; standard organization management is exposed in `settings/members/page.tsx:24–34`.
- Reproduction: actual module with in-memory dependencies and an existing old SQL name plus new Clerk name
  returned the old name without a Clerk organization lookup. Refresh alone cannot repair that projection.
- Repair: define a bounded display-name refresh using the existing Clerk resource/projection. Do not add
  tenancy authority, an unapproved webhook, or an unconditional provider waterfall.
- Regression/risk: a rename updates displayed name while session organization remains authoritative;
  explicitly cover provider failure. Moderate availability/performance trade-off; separate from auth repair.

### Journey coverage and remaining release gates

| Journey | Audit evidence | Still unverified |
|---|---|---|
| Signup, workspace choice, role selection | Existing signup/onboarding browser specs and prior staging record; local guard tests passed | Fresh deployed run, interruption/provider configuration drift |
| Sign-in, session expiry, sign-out | Clerk wiring and draft-recovery tests inspected | First-attempt expired-session recovery without forced test reload; direct sign-out E2E |
| Password recovery | A6 source/VM evidence; two route-only browser specs | Real send → code → new password → activation → return, including failures |
| Invitations/Members | Accepted invitation and fallback correction recorded previously | Automatic hosted return; actual Members send; wrong-account, expired/revoked, accepted and workspace-limit branches |
| Intake/gate/drafts | Validation, signed-token user/org/expiry binding, idempotent save and draft tests inspected/passed | Fresh deployed AI failure/recovery and attachment failure branches |
| Board/detail/pickup/Done/comments | Tenant/guest predicates, conditional lifecycle updates and concurrency tests inspected/passed | Fresh deployed two-account interaction and comment recovery |
| Private attachments | Session/ownership checks, finalized state and short-lived signed download traced | A4/A5 regressions and fresh deployed storage failure paths |
| Profile/notifications | Label remains non-permission; profile/read tests passed | A3 downgrade privacy, A7 identity freshness; notification network-error UI not exercised |

### Proposed first repair batch — test-harness safety only

Implement A1/A2 first so subsequent verification cannot delete the wrong data. Scope: test target validation,
subprocess construction, E2E preflight and fixture ownership, with mocked regression tests followed by the
same explicitly pinned disposable local suite. No application UX, database schema, dependency or provider
setting changes. Do not run real Clerk E2E in this batch without separate approval. A3 is next; move it ahead
only if live guest exposure is established, using the contained local runner and keeping remote E2E blocked.

Acceptance: invalid targets fail before any mutation; valid local fixtures still pass; development-key
prefix alone never authorizes broad cleanup; unowned organizations are never deleted; full existing test
suite, lint/typecheck and diff review pass. Independent review required before claiming the harness safe.
Then obtain approval for controlled staging verification; deployment/production promotion remain separate.

**Approval status:** findings and first repair batch await Nikhil. No repair or launch-readiness claim.

## Approved reliability repairs — 2026-09-28

Nikhil's “fix all” approves A1–A7 above. This supersedes repair-approval-pending status, not the separate
deployment, hosted migration, real Clerk E2E execution or npm inventory-disclosure gates.

**Goal:** repair the seven demonstrated defects without expanding the product or replacing parallel work.
**Architecture:** fail-closed test boundaries; existing Clerk authority and SQL visibility predicates;
small attachment/recovery state helpers with behavior tests. No new tables, routes, dependencies or jobs.

- [x] A1: test `src/test/global-setup.ts` with intercepted subprocesses; reject every non-`lane_test` or
  alternate-routed URL before commands; replace shell strings with explicit argv and sanitized PG env.
- [x] A2: test E2E helpers with mocked Clerk/Postgres boundaries; pin the staging database, development
  instance and base URL; record fixture IDs and verify ownership before deletion; remove startup sweeps.
- [x] A3: extend `src/lib/notifications-read.test.ts` with guest downgrade and cross-org fixtures; apply
  current Request visibility consistently to notification reads, counts and read-state updates.
- [x] A4/A5: regression-test whole-queue upload completion and thrown Storage failures; repair
  `intake-form.tsx` and `attachment-actions.ts` without changing their approved layout or upload limits.
- [x] A6: behavior-test reset continuation/retry handling; repair `password-recovery-form.tsx` using
  supported Clerk flows, duplicate-send protection and recoverable states, without bypassing factors.
- [x] A7: test Clerk rename and unavailable-provider states; refresh the workspace display using the
  existing Clerk resource without an unconditional server provider waterfall or new tenancy authority.
- [x] Run fresh disposable-local tests, existing compiler/linter/build, diff checks and independent
  review. Report remote journey checks and advisory lookup separately; do not call them passed.

Each repair follows red test → minimal implementation → green focused tests → cross-review. Main owns
test infrastructure, notifications and workspace freshness; independent workers may own attachment and
auth recovery files. Only the main worker runs the shared disposable-database suite.

### Implemented repair evidence

| Finding | Local repair and regression evidence |
|---|---|
| A1 | All PostgreSQL subprocesses now use explicit validated connection arguments, a sanitized `PG*` environment, `psql -X` and `ON_ERROR_STOP=1`. Invalid targets fail before any command. Ten boundary tests pass after the recorded failing cases. Strict SQL handling exposed the old baseline's ignored Supabase-only errors; `local-baseline.ts` now extracts five canonical enum definitions and `set_updated_at()` verbatim, then runs unchanged migrations 0013/0014 and fixtures. Eighteen prerequisite-selection tests and sixteen schema-safeguard tests pass. This is a fresh post-Clerk schema test, not a hosted restore or historical migration test. |
| A2 | E2E requires `LANE_E2E_ALLOW_REMOTE=1`, pinned staging DB/Storage/base URL and publishable key, and a read-only verification of the secret key's exact Clerk development instance before fixture mutation. Startup-wide sweeps are removed. Deletion requires this run's exact fixture receipts plus matching remote metadata/creator; mixed or unknown memberships fail closed. Next's secondary env-file overlay and existing-server reuse are disabled for the managed E2E server. Seventeen mocked safety tests pass; independent review identified and then verified closure of Storage-origin and env-overlay gaps. No real Clerk fixture run. |
| A3 | One SQL visibility predicate now scopes list, count, read, unread and mark-all operations to the current Request/org/guest visibility. A downgraded guest cannot read or mutate hidden historical notifications. Six privacy regressions failed before the change; all seventeen notification-read tests now pass against disposable Postgres. |
| A4 | Per-file retries determine completion from the entire retained queue. Cleanup failures retain the reservation ID and usable recovery controls; replacement waits for confirmed cleanup. A lost finalize response is reconciled as already uploaded without deletion or re-upload. Fifteen recovery-handler and eight discard-action behavior tests pass after recorded failing cases. |
| A5 | Thrown client/signing failures now clean up only the newly created, unfinalized reservation; a cleanup failure cannot mask the original upload failure. Six reservation tests cover repeated quota recovery, healthy retry and unrelated-row protection. |
| A6 | The recovery flow has resend/change-email, a failure-preserving cooldown and duplicate-send protection. Remaining factors use Clerk's managed continuation; session activation can retry without resubmitting a consumed code. Passwords/codes are not persisted. Seventeen flow tests and four real component SSR tests pass. These are not live email, browser-focus, MFA or hosted-return verification. |
| A7 | Desktop/mobile workspace identity reads the matching loaded Clerk organization name, retaining the server projection only as a fallback. Seven component SSR cases cover rename, loading, missing/mismatched org and blank name. No new tenancy authority or server-side provider waterfall. |

### Verification and remaining boundaries

- Full disposable-local suite: **46 files / 324 tests passed**, exit 0, after all attachment changes.
  Includes behavioral, mocked-boundary, actual Postgres, SSR and existing source-contract tests; not 324 browser journeys.
- Full ESLint: passed, exit 0. UI hardening detector on the three changed UI surfaces: no findings.
  Existing layout and local Base UI components are preserved; no Paper redesign was needed.
- Independent final read-only review found no remaining material findings in the attachment repairs or
  password-recovery integration. The test-target/fixture boundary received a separate review; the original
  implementers' focused checks were followed by the main worker's combined verification above.
- Production build: passed, exit 0, with inert provider credentials, local-only database URL,
  `LANE_ENV_FILE=/dev/null` and `.next-audit` output. The first sandbox attempt failed only fetching the
  existing Google Fonts; the authorized network retry compiled and generated all thirteen static pages.
  This does not validate live service configuration or make a measured performance-improvement claim.
- Post-build installed TypeScript compiler and `git diff --check`: passed, exit 0. Only Next's generated
  `.next-audit` include additions were removed from `tsconfig.json`; pre-existing changes were preserved.
- No package/lockfile or canonical migration changes; no deployed source, hosted database, Clerk settings,
  real email, commit or push changed in this repair run.
- Live staging checks still require explicit execution approval: successful password reset and remaining-factor
  continuation, invitation return, rename, guest notification downgrade, and attachment failure/retry.
- Remote E2E is opt-in, not a safe automatic sweep: interrupted runs can leave owned fixtures that require
  explicit inspection/cleanup. The local bootstrap does not establish hosted migration/restore safety.
- Cross-service attachment finalization/discard is not atomic across Postgres and Storage. Process termination,
  a lost preparation response, or a DB outage during cleanup can still leave a reservation. No background
  reconciliation job or schema expansion was added under this bounded repair approval.
- Clerk display freshness does not synchronize the SQL name projection in the background; if the Clerk
  resource is unavailable, the fallback can still show the previous name.
- Dependency advisory lookup remains unverified: permission to disclose the dependency inventory to npm was
  previously denied. No retry, workaround, advisory claim or dependency upgrade was made.

**Rollback:** these are source-only changes, with no application schema/data migration to reverse. Preserve
the fail-closed test harness. If a runtime repair regresses after a separately approved deployment, roll back
that deployment and make a targeted reversal of the relevant application repair; do not reset this dirty
working tree or overwrite parallel work. Rolling back notification privacy or auth recovery can restore the
original defect, so the affected journey must remain gated until corrected. No rollback was performed.

**Next approval:** staging-only deployment of the reviewed source, then one controlled browser/provider
verification run with known disposable accounts and the pinned targets. Production promotion is separate.
