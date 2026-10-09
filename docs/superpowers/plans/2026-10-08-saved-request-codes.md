# Saved Request Codes Implementation Plan

**Goal:** Give a saved Request a permanent, copyable reference that can be found in existing workspace search.

**Authority and status:** On 2026-10-08 Nikhil selected “feature first” when offered Request codes/priority versus trio agreement. This execution takes saved codes as the first bounded feature; priority is separate. The detailed choices below are implementation defaults for that instruction, not claims that Nikhil separately specified each one. Local implementation and verification are complete. Hosted migration and release remain pending.

**Architecture:** Keep UUID route/action identity. Allocate a positive integer in Postgres from a counter on the existing workspace row, then format it as `LAN-${requestNumber}`. Existing guarded queries carry the persisted number to Arc list rows and workspace search; the Linear preview provider is not activated in production.

**Tech stack:** PostgreSQL, canonical SQL migrations, Drizzle, Clerk guards, React, Arc UI, Vitest and Storybook browser tests. No dependencies, new tables or routes.

## Behaviour contract

- Each workspace starts at `LAN-1`. Codes are workspace-local, fixed after creation and cannot be edited or moved across workspaces. Same number in two workspaces is valid.
- Existing Requests are numbered oldest first, with UUID as a deterministic tie-breaker. Preserve all existing timestamps and domain data.
- Deleted committed numbers are never reused. Failed transactions roll back allocation; signed save retries using `ON CONFLICT DO NOTHING` may leave gaps. Codes are not a count or an impact/priority measure.
- The database assigns omitted/zero insert numbers. It rejects explicit nonzero numbers and changes to existing numbers or their workspace. The zero default is an insert placeholder; the positive constraint prevents it reaching stored data.
- The counter serializes concurrent creation within a workspace. Counter-only changes preserve workspace metadata timestamps; ordinary metadata edits retain timestamp behaviour.
- Copy code is keyboard/touch accessible, reports success or a retryable clipboard failure, and does not navigate the row. Existing Copy links continues to copy UUID URLs.
- Existing complete-dataset workspace search matches a full case-insensitive code such as `lan-42` in addition to ordinary literal text. It keeps the tenant and guest predicates around both result and count queries. A code grants no access; guests still retrieve only their own Requests.
- Request detail layout, priority, property editing, statuses, permissions, AI calls, icon packages and production Linear theme activation are outside this increment.

## Task 1 — Persistence

Files: `src/db/schema/users.ts`, `src/db/schema/requests.ts`, `src/db/migrations/0017_request_codes.sql`, `src/db/request-codes-schema.test.ts`, `src/test/global-setup.ts`.

Interface: `requests.requestNumber: number`, `organizations.lastRequestNumber: number`. Insert number is optional because Postgres owns allocation. Unique `(org_id, request_number)` and positive/nonnegative checks enforce the storage contract.

- [x] Add and observe failing integration tests for concurrent inserts, independent workspaces, rollback, deletion non-reuse, retry stability, immutable identity, invalid supplied numbers and backfill timestamps.
- [x] Implement the transactional additive migration and Drizzle schema declarations. Use schema-qualified `SECURITY INVOKER` trigger functions and preserve RLS/grants.
- [x] Apply through the existing exact-local-`lane_test` test harness and run the integration cases, existing Clerk safeguards and Intake save/retry regressions.

## Task 2 — Retrieval and presentation

Files: `src/lib/request-code.ts` and its test, `src/app/(app)/requests-workspace.tsx`, `src/app/(app)/workspace-search-actions.ts` and its test, `src/lib/request-overview.ts`, `src/lib/workspace-search.ts`, `src/components/requests/request-row.tsx`, `src/components/requests/request-rows.module.css`, `src/components/shell/workspace-search-pane.tsx`, relevant stories.

Interfaces: `formatRequestCode(number): string` rejects invalid stored numbers. `parseRequestCode(string): number | null` accepts only positive PostgreSQL integers in complete `LAN-n` form. UI fixture types allow an omitted number; production queries always select it and never derive fallback numbers from array order.

- [x] Observe failing formatter/read/search tests, then implement exact parsing and scoped search projection/predicate.
- [x] Implement the Arc row Copy-code control and search metadata independently from illustrative priority/presentation context.
- [x] Verify stable values after sort/filter/re-render, clipboard success/failure retry, keyboard and narrow layout, and UUID result navigation.

## Task 3 — Verification and release boundary

- [x] Run focused database, search, Intake and browser regressions; typecheck, lint changed code and design source checks. Record exact results below.
- [x] Inspect desktop and mobile previews manually, including a long code, and verify clipboard failure/retry in rendered browser tests.
- [ ] Review the final migration and code before any hosted execution. Take and verify a fresh staging export, apply canonical `0017` with `ON_ERROR_STOP`, check backfill uniqueness/timestamps and an authenticated create/search/copy journey, then review staging evidence before production.

Deploy the application only after its database has `0017`. An application rollback can retain these additive fields and triggers. Do not drop user-visible codes as a rollback. The Drizzle historical journal is incomplete; use Lane's canonical SQL workflow, not blind Drizzle/Supabase CLI migration execution.

The migration locks Requests before organizations to follow the normal insert/FK path. Transaction-local lock timeout is 5 seconds and statement timeout is 60 seconds. It fails cleanly instead of waiting indefinitely; apply during a brief staging write pause and investigate contention before retrying. These guards were verified in the final local migration run.

Postgres references checked: [row locks](https://www.postgresql.org/docs/current/explicit-locking.html), [triggers](https://www.postgresql.org/docs/current/sql-createtrigger.html). The existing non-key counter update stays inside the insert transaction. Multi-workspace bulk operations must acquire workspace locks in a consistent order.

## Evidence

- Verified a custom-format backup of the exact local `lane_test` database before reset (`/tmp/lane-request-codes-before.dump`; archive inventory includes `public.requests`). No hosted database was accessed.
- Initial UI/query test run failed as expected: missing code formatter, missing saved-number projection and code lookup; 27 existing cases passed. Log: `/tmp/lane-request-codes-red.log`.
- Database red: all 14 initial cases failed before the implementation; monotonic-counter and overflow coverage expanded the suite to 16 cases.
- Full local suite: **58 files / 495 tests passed**. After the final lock-order/timeouts change, saved-code schema, Clerk safeguards and actual code-search isolation were rerun: **3 files / 35 tests passed**. The actual-data search tests cover colliding workspace codes and guest-owned versus other-submitters' Requests.
- Formatter, list-query and search-query checks: **3 files / 52 tests passed**.
- Final desktop browser regression: **5 files / 85 cases passed**, covering codes, search, Requests, selection and the Linear preview. Search/code stories also passed at 390px Light, 390px Dark and 1440px Dark (20 cases each). After the final column alignment, all 7 code stories passed again at 390px Light, 390px Dark with reduced motion and 1440px Dark.
- Typecheck, focused ESLint, Arc source provenance check (63 files / 29 adaptations), whitespace check and production Next build passed. The initial sandboxed build stalled at compilation and was stopped; the normal-access retry compiled and generated routes successfully.
- Browser failures caught the existing Arc-green search-highlight contrast (4.36:1); using the normal foreground token for its fallback fixed it. Tests now wait for outgoing motion content to finish before contrast checks; accessibility checks remain enabled.
- Independent code/migration review found no blocking issue. UUID URLs and bulk Copy links are unchanged; no better-icons assets were downloaded.
- Manually viewed the production Arc composition at desktop, the longest valid code at 390px, and focused copied feedback in Dark. The in-app `Patterns/Request codes → Saved Codes` preview is open with illustrative records. This is not hosted-data verification.
- Logs and structured results: `artifacts/request-codes-2026-10-08/verification.json`. Hosted migration, deployed journeys and real-pilot validation remain unverified.

### Preview follow-up — 2026-10-09

The original Saved Codes story omitted the workspace sidebar, and its illustrative search adapter did not match saved numbers. The story now uses the existing opt-in Linear/Arc full shell; its fixture search uses the shared exact-code parser. Production code and hosted databases are unchanged by this follow-up.

A new keyboard interaction covers copying `LAN-42`, opening workspace search with `/`, matching lowercase `lan-42`, rejecting the partial code `LAN-4`, retaining the UUID result URL and returning to the list. It failed before the fixture search fix and passed afterward. Requests/code browser regression: **42 desktop cases passed**; all **8 code cases passed at 390px**. Typecheck, focused ESLint, Arc source check and whitespace checks passed. The first mobile run could not bind a sandbox loopback port; the normal-access retry passed.

The in-app Saved Codes preview was inspected with the full sidebar visible. Actual clipboard copy reported `LAN-42 copied.` and workspace search returned the matching illustrative Request. The preview remains sample data, not hosted persistence verification.
