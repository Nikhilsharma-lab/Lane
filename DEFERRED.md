# DEFERRED.md — tracked deferrals from daily code reviews

Everything reviews flagged but we chose not to fix immediately. Organized by **trigger** — the moment each
item must be handled. Nothing here may quietly vanish: per CLAUDE.md's hard gate, every pre-launch item must
be **built or deleted** before the first paying customer.

Each item: what · why deferred · source review.

---

## PRE-GTM MUST-BUILD — board polish

- ~~**Status label/variant duplicated** across board and detail pages. Extract to one shared util so status
  styling lives in one place.~~ RESOLVED: `src/lib/request-status.ts` (`statusLabel`:1, `statusVariant`:10),
  imported by both board and detail pages (grep re-verified 2026-07-12). Commit f7df09e, merged dce3359 —
  "launch list items 6+7". Checkbox was never ticked; ledger caught up 2026-07-12. — Day 3 #4.
- ~~**Card hierarchy → reframed problem leads.** The card currently leads with the solution *title* and buries
  the reframed *problem*. For a problem-first board, the problem leads; title is secondary.~~ RESOLVED:
  board card renders `req.reframedProblem` as the `font-medium` lead link with title secondary
  (`src/app/(app)/page.tsx:140-149`, "Reframed · " marker :161; re-verified 2026-07-12). Same commit
  f7df09e. Checkbox never ticked; ledger caught up 2026-07-12. — board design review.

> **Removed** (2026-06-26 build-or-delete verdicts):
> - ~~Green badge on board~~ — DELETED. Violates the one-signal rule; evergreen is reserved for the gate.
> - ~~Redundant per-card status badge~~ — DELETED. Section header already states the status.

## POST-GTM — optimistic UI on lifecycle transitions

- **Optimistic UI on lifecycle transitions.** Pick-up / mark-done wait for the full round-trip. useOptimistic
  (React 19) flips state instantly. On-brand "considered" feel. — Day 3 #7. Verdict: DEFER (rollback flicker
  would be visible against Tokyo latency; complexity over correctness at this stage).
  Trigger: after Tokyo co-location, if transitions still feel slow.

## PRE-LAUNCH — hard gate (built or deleted before first paying customer)

- ~~**Rate limiter is in-memory** (`Map`, leaks, resets on deploy). Swap to Upstash.~~ RESOLVED: swapped to
  Upstash Redis sliding window — 10 req/60s per user, fail-open on Redis error or missing KV env
  (`Ratelimit.slidingWindow(10, "60 s")` + prefix `lane:ratelimit:ai`, `src/lib/rate-limit.ts:22-23`;
  fail-open `rate-limit.ts:29-31,42-45`). Mocked-Redis forge tests: `src/lib/rate-limit.test.ts` (3 tests).
  Commits 3ad18fa, merged e368edc. — Day 2 #5.
- ~~**N+1 queries on the detail page** (request + creator + assignee as 3 serial round-trips). Collapse to one
  query with LEFT JOINs. Perf — bites as request counts grow.~~ RESOLVED: collapsed to one aliased self-join
  query — `alias(profiles, "creator")` / `alias(profiles, "assignee")` + two `leftJoin`s
  (`src/app/(app)/requests/[id]/page.tsx:47-48,67-68`); the serial `// Get creator name` /
  `// Get assignee name` blocks are gone (grep: absent). Forge tests: `detail-query.test.ts` (6 tests).
  Merge 879b484 (branch feat/detail-nplus1). — Day 3 #3.
- **Board pagination — OPEN, DEFERRED POST-GTM (trigger below → exempt from the hard GTM gate).**
  Re-scoped 2026-07-12; the original text ("only a `.limit(100)` safety cap") was stale. Current state
  on main: query capped at 200 (`MAX_REQUESTS_QUERY`, `src/app/(app)/page.tsx:13`), Done group capped
  at 25 with a count affordance ("Showing the latest 25 of N completed." — `page.tsx:14,52,181-184`) —
  partial mitigation already shipped. What's absent: cursor/offset "load more" pagination (grep: no
  pagination code in the board path). Decision: DEFER — Lane launches invite-only to early design
  teams whose active boards are dozens, not hundreds; the failure mode at the cap is graceful (oldest
  items stop displaying, no crash) on a board where stale requests get closed; building cursor
  pagination now solves a scale problem that only appears at customer volume launch won't have (YAGNI).
  Trigger: any workspace exceeds ~120 active (Open + In-Progress) requests, OR the first
  enterprise-scale customer — whichever first (a threshold visible in advance, not a surprise at 200).
  — Day 3 #6; re-scoped + deferred 2026-07-12.
- ~~**Date hydration mismatch.** `toLocaleDateString()` renders in server locale on SSR, client locale after
  hydration → mismatch warning + date flash for cross-timezone teams. Format consistently or client-only.~~
  RESOLVED: locale pinned to `"en-US"` at `src/lib/relative-time.ts:11` and
  `settings/members/invite-row.tsx:74` (re-verified 2026-07-12). Commit 5f9dee1, merged 6f49888 —
  "launch list item 4". Checkbox never ticked; ledger caught up 2026-07-12. — Day 3 #8.
- ~~**HMAC signing reuses `SUPABASE_SECRET_KEY`.** Works (server-only) but a dedicated signing secret isolates
  concerns.~~ RESOLVED in code: commit 5819295 (2026-06-18, "security: decouple triage token signing from
  service-role key") — sign and verify both read the dedicated secret (`process.env.TRIAGE_TOKEN_SECRET`,
  `src/lib/triage-token.ts:32`), no fallback, loud throw on absence (`triage-token.ts:33-35`), forge-tested
  (`triage-token.test.ts:53-59` asserts the unset-throw). The entry predated the fix. Two operational
  residues filed below as OPEN items. — Day 2 gate-fix note.
- ~~**OPERATIONAL — generate `TRIAGE_TOKEN_SECRET` value into `.env.local`** (currently blank on the only
  machine; name-only check 2026-07-01). Intake-gate signing throws until it's set (`triage-token.ts:31-35`),
  so local intake/e2e can't run without it.~~ DONE at the 2026-07-11 env-fill sitting: 64-hex value
  generated (`openssl rand -hex 32`) and written; FILLED re-confirmed by name-only check 2026-07-12.
  — HMAC close-out recon, 2026-07-01; done 2026-07-11.
- **OPERATIONAL — verify `TRIAGE_TOKEN_SECRET` is set in Vercel Production + Preview.** Commit 5819295's
  body ordered it set on 2026-06-18, but the repo cannot confirm dashboard state (INFERENCE only). Missing
  in prod = triage throws on the first real request post-deploy. Trigger: pre-launch dashboard-verification
  pass (alongside Vercel Pro / prod-staging split, Cluster 3). — HMAC close-out recon, 2026-07-01.
- ~~**Duplicate client/server validation** can drift. Point the client form at the same zod schema.~~
  RESOLVED: shared schema `src/lib/request-schema.ts` (zod only, client-importable) is now the single
  source for the intake form — server actions import it (`intake/actions.ts`), the client form wires it
  via `zodResolver` (`intake-form.tsx`), limits live in exported constants. And it WAS drifting: diagnosis
  found `saveRequest` inserted `editedProblemText` with NO server validation while the client showed a
  5000 cap — a forgeable-endpoint hole, closed in the same build (`editedProblemSchema.safeParse` before
  the insert). So this was build-plus-bugfix, not mere consolidation. 8 forge tests
  (`request-schema.test.ts`). Commits 4f52bae (build) + 25885dc (copy) + d6aba11 (merge). — Day 2 #10.
- ~~**Email confirmation — APP CODE READY; ACTIVATION + LIVE CHECK OPEN.**~~ RESOLVED 2026-07-12. Decision chain, kept for the trail:
  (1) Original: turned OFF for dev speed, decide before real users (Day 1 setup). (2) 2026-07-11:
  RESOLVED BY DECISION as not-required, premised on invite-only launch — code+project MATCH confirmed
  (`(auth)/actions.ts:63-83` immediate-redirect signup; `/auth/v1/settings` probe `mailer_autoconfirm:
  true`). (3) 2026-07-12: **SUPERSEDED** — signup stays OPEN (invite-only not enforced; probe showed
  `disable_signup: false`, /signup public), so the "if self-signup added" trigger below has FIRED and
  confirmation IS required for self-signup, with invited users exempt (vouched-for by the inviter).
  **Build shape** (from the (b) NEEDS-APP-LOGIC diagnosis — both creation paths are the same signUp
  today, `invite/[token]/page.tsx:82-86` funnels invitees into public /signup):
  - Invited path: `admin.createUser({ email_confirm: true })` after SERVER-SIDE invite verification
    against the invites table (pending / unexpired / email-match) — never trust the redirect param.
  - Self-signup path: pending-confirmation screen + `auth.resend()` (today's blind redirect would
    bounce an unconfirmed user to /login unexplained — `middleware.ts:47-51`).
  - Dashboard: enable "Confirm email" (flips `mailer_autoconfirm` off). Forge tests for the
    invite-verify branch.
  - Security note: requires importing the service client into app code, which `admin.ts:5-6`
    currently forbids ("NEVER import this from app or client code") — that guard must be consciously
    revisited at build time, not silently overridden.
  **IMPLEMENTED 2026-07-12:** ordinary signups pause on `/signup/check-email`, resend has a 60-second
  cooldown, callback destinations use the hardened internal-path validator, and only a pending,
  unexpired, server-verified invite with matching email can create a pre-confirmed account. Unit/forge
  coverage includes normal, transitional autoconfirm, valid invite, mismatched email, expired invite,
  resend, and encoded open-redirect cases. **LIVE VERIFIED:** production app URL corrected from the placeholder
  to `https://www.uselane.app` and redeployed; Supabase Site URL + callback allowlist confirmed; Confirm email
  enabled; real self-signup delivered and confirmed into onboarding; real server-verified invite bypassed
  confirmation, accepted, and reached the correct board.
- ~~**OPERATIONAL — provision custom SMTP (Resend or similar).**~~ RESOLVED 2026-07-12: Resend is connected
  to Supabase custom SMTP as `Lane <auth@uselane.app>`; delivery appears in Resend logs. SPF and DKIM are
  verified, `_dmarc.uselane.app` publicly resolves to `v=DMARC1; p=none;`, and tracking was not configured.
  Early test mail reached spam, so domain reputation and future custom Supabase Auth-domain alignment remain
  deliverability considerations, not blockers to the confirmation build.
- ~~**RLS is currently INERT as a defense.** Drizzle uses DATABASE_URL (postgres role) which bypasses RLS entirely.
  The PostgREST path blanket-denies all queries because `current_app_user_id()` uses the deprecated
  `request.jwt.claim.sub` (should be `request.jwt.claims::json->>'sub'`). Action-level guards
  (`requireActiveMember` / `requireOwnerOrAdmin`) are the **sole** tenant-isolation defense today.~~
  RESOLVED as verified-sufficient (2026-07-12): app-layer guards are now the sole — and only
  possible — defense, and the full sweep found them airtight. Evidence: (1) the app role literally
  bypasses RLS (`current_user = postgres`, `rolbypassrls = t` — catalog query), so RLS never engaged
  on app traffic; (2) with the Data API now disabled (see entry above), RLS has NO reachable surface
  at all; (3) every data path is guarded and org-scoped — identity from `auth.getUser()` inside the
  guards (`auth-guard.ts:8-75`), inserts stamp `auth.orgId`/`auth.userId`, mutations fetch-then-check
  (`requests/[id]/actions.ts:27`), notifications triple-scope (id+userId+orgId), pages scope or 404 —
  ZERO unscoped paths found; (4) 5 forged-orgId isolation tests run green in the suite. REMAINING
  The separate live two-account UI check is now RESOLVED: `e2e/workspace-isolation.spec.ts` creates fresh
  A/B accounts and workspaces, proves A can read its Request, and proves B cannot see it on the board or at
  its direct detail URL.
  — Danger-day isolation audit; verified-sufficient 2026-07-12.
- ~~**`completeOnboarding` one-workspace invariant.**~~ RESOLVED: closed by the bootstrap rework (PR #27).
  Two independent guards enforce the invariant: (1) bootstrap `IF FOUND THEN RETURN` early-return
  (`0005:28–37`) — if a profile exists, returns existing org_id, no workspace created (forge-tested:
  `onboarding.test.ts:125` + `:205`); (2) `profiles.id` PRIMARY KEY — concurrent race (two tabs submitting
  before either writes) hits a PK violation on the second INSERT, which is uncaught (the slug loop is the
  only EXCEPTION handler), aborting the entire function and rolling back the transaction including the org
  INSERT — no orphan workspace. The original entry predated the rework. — Danger-day action inventory.

> Infra pre-launch items (staging/prod split, Supabase Pro, Vercel Pro, custom domain, cross-workspace RLS
> verification) live in CLAUDE.md's "BEFORE FIRST PAYING CUSTOMER" section. Same gate governs both lists.

## GUEST ROLE-CHANGE — when assignment cleanup is needed

- **Demoting an assigned member to guest leaves in-progress assignments dangling.** No security issue (guest can't
  pick up or mark done), but the request stays assigned to someone who can no longer act on it. Owner can manually
  reassign. Auto-unassign on demotion-to-guest is the clean fix — build when real usage surfaces the gap.
  — Guest role-change increment.

## GUEST INTAKE — invited shipped; public / anonymous deferred

- **Invited Guest is shipped.** A Guest is an active limited workspace member, so `requireActiveMember`
  correctly permits `runTriage` / `saveRequest`; own-only board, detail, and comment scoping are implemented.
  The prior claim that Guest requesters would not be workspace members was stale.
- **Public / anonymous Intake remains deferred.** A requester with no invited workspace membership would
  need a separate token-scoped or public auth path. Trigger and Plane reference live in **GUEST / EXTERNAL
  INTAKE** below.

## COMMENT PAGINATION / READ ACTION — when comments get a standalone fetch

- **Comment reads are by `requestId` alone, org-gated only transitively** through the request-detail page's
  `notFound()` boundary (request.orgId !== session orgId → 404). Secure today because there is no standalone
  comment read path. A future `getComments` action or pagination endpoint **must** scope by org (join through
  request, `WHERE request.org_id = session orgId`) — do not rely on the page gate alone.
  — Danger-day read-scoping audit.

## AUTH SURFACE TOUCH — next time auth routes are modified

- **`auth/callback/route.ts` open-redirect check.** `safeRedirectPath` currently validates the `next` param
  (`startsWith("/")` and not `startsWith("//")`) — same check in `login`/`signup` actions for `redirectTo`.
  Verify this remains sufficient (no `javascript:`, no protocol-relative, no backslash tricks) next time the
  auth surface is touched. — Danger-day entry-point inventory.

## E2E BRING-UP — first e2e run after Supabase creds are filled

- **Verify e2e port alignment.** What: playwright now runs the app on port 3100 (`playwright.config.ts` —
  `baseURL … localhost:3100`, `command: "PORT=3100 pnpm dev"`) while `NEXT_PUBLIC_APP_URL` in `.env.local`
  stays `localhost:3000`. Why deferred: unverified whether any e2e spec depends on the two matching
  (`NEXT_PUBLIC_APP_URL` feeds invite links and auth redirects); can't test until Supabase creds are filled
  and e2e is brought up. Source: feat/detail-nplus1's e2e-port hardening (3000→3100) vs `.env.local`
  `NEXT_PUBLIC_APP_URL` (3000). Trigger: first e2e bring-up after Supabase creds are filled.

## REQUEST PEEK/PREVIEW — when board-context viewing is needed

- **Detail-page peek/preview.** What: view a request's detail while staying in board/list context
  (Plane's issue peek), instead of full-page nav to `/requests/{id}`. Status: **UNGATED, not banned.**
  Not on the MVP screen whitelist (CLAUDE.md lines 17–26) → needs Nikhil's explicit written decision
  before building. Deliberately unbuilt; full-page detail nav is sufficient at current scale. Why
  deferred: not on the GTM path. Its main payoff for Lane — the notification inbox-pane form (see
  NOTIFICATION AT-SCALE section below) — is already covered by the popover. No demonstrated need to
  stay in board context while viewing a request at small scale. Plane ref: issue peek-overview
  (`apps/web/core/components/issues/peek-overview/`), plus the notifications route that depends on it
  (`NotificationsRoot` renders `IssuePeekOverview` in the right pane). Trigger: a real need to view a
  request without losing board/list place, OR the inbox-pane notification form becomes wanted (peek is
  its prerequisite) — either fires a Nikhil decision.

## NOTIFICATION AT-SCALE — Plane-sourced deferrals (notification recon, 2025-06-20)

Items identified by comparing Lane's notification system against Plane's (`makeplane/plane`).
Each was evaluated as Lane-simpler, thesis-refusal, or adopt-later.

- **Archive notifications.** What: add `archived_at` timestamp, exclude archived from default list,
  archive/unarchive actions. Why: Lane MVP has 4 notification types and tiny teams — archive adds UI
  complexity for no real need yet. Plane ref: `Notification.archived_at`, `NotificationViewSet.archive`/
  `unarchive` views. Trigger: notification list gets unwieldy at volume.

- **Snooze notifications.** What: add `snoozed_till` timestamp, snooze presets (1d/3d/5d/1w/2w/custom),
  re-surface logic, snooze UI per card. Why: useful at scale, overhead at MVP. Plane ref:
  `Notification.snoozed_till`, `NOTIFICATION_SNOOZE_OPTIONS`, `NotificationItemSnoozeOption` component.
  Trigger: notification list gets unwieldy at volume (same as archive).

- **@mentions + subscriber model — THESIS REFUSAL.** What: rich text @mention parsing, auto-subscribe
  mentioned users, `IssueSubscriber` table (any user subscribes to any issue and gets all activity
  notifications). Why: the subscriber model is watch-all-activity surveillance machinery — exactly
  the kind of "performance through surveillance" Lane's thesis refuses. @mentions require rich text
  editing, user lookup UI, and subscriber management — significant surface area for a tool that
  believes individual support beats observation. This is NOT a backlog item. It is a deliberate
  thesis-based refusal. Plane ref: `IssueSubscriber` model, `notification_task.py` subscriber logic,
  `<mention-component>` HTML parsing. Trigger: revisit ONLY if per-individual notification (creator/
  assignee/commenter) proves insufficient for real teams. The bar is "people are missing things they
  need to act on," not "people want to watch everything."

- **Email notifications beyond authentication and workspace invitations.** What: transactional email alongside
  in-app notifications for request activity. Why: Resend is configured for auth and invitation delivery, but
  broader notification email is not part of the current MVP and would add preference/noise concerns.
  Plane ref: `EmailNotificationLog` model, email sending in `notification_task.py`. Trigger: real pilot users
  repeatedly miss request activity that the in-app surface should have made actionable.

- **Notification preferences.** What: per-user booleans controlling which notification types generate
  email. Why: meaningless without request-activity email notifications. Plane ref: `UserNotificationPreference` model
  (`property_change`, `state_change`, `comment`, `mention`, `issue_completed` booleans).
  Trigger: email notifications exist.

- **Notification tabs (All/Mentions).** What: tabbed notification panel with separate unread counts
  per tab. Why: without @mentions there's only one category. Plane ref: `NOTIFICATION_TABS` constant,
  `ENotificationTab` enum, `UnreadNotificationEndpoint` (returns `total_unread` + `mention_unread`).
  Trigger: a second notification category exists that warrants its own tab.

- **Notification filters (created/assigned/subscribed).** What: filter chips on the notification list
  by relationship to the request. Why: low volume makes filtering unnecessary. Plane ref:
  `ENotificationFilterType` enum, `FILTER_TYPE_OPTIONS`, filter logic in `NotificationViewSet.list`.
  Trigger: team size / notification volume makes scanning the full list slow.

- **Cursor pagination for notifications.** What: replace `LIMIT 30` with cursor-based pagination +
  "load more." Why: 30 is more than enough for MVP volumes. Plane ref: `BasePaginator` mixin,
  `ENotificationLoader.PAGINATION_LOADER`, `NotificationCardListRoot` "load more" UI.
  Trigger: teams regularly hit the 30-notification cap.

- **Notification panel form (inbox pane / dedicated route).** What: Lane uses a popover; Plane uses
  a dedicated `/notifications` route with a master-detail two-pane layout (notification list 3/12 +
  issue peek 9/12, side by side). Why deferred: Plane's PRIMARY driver is peek coexistence — read a
  request beside the notification list without navigating away. Lane lacks this interaction: clicking
  a notification navigates to `/requests/{id}` as a full page. The popover is the correct form for a
  flat list with no coexisting detail pane. Plane ref: `notifications/layout.tsx` (two-pane flex),
  `notifications/page.tsx` → `NotificationsRoot` (renders `IssuePeekOverview` in the right pane),
  `NotificationsSidebarRoot` (`w-3/12` sidebar that persists alongside peek). Trigger (primary): a
  request peek/preview interaction exists (read a request without leaving the current page). Trigger
  (secondary): notification surface gains tabs/filters/snooze needing dedicated vertical room.
  Reassess to route-based two-pane when either trigger lands.

## RLS BACKSTOP (PATH 1) — pre-GTM hardening pass

- ~~**Migrate `bootstrap_organization_membership` RPC → Drizzle transaction behind the guard.**~~
  **DONE** (PR #27, `completeOnboarding` calls bootstrap via Drizzle `sql` tag). Zero PostgREST
  app consumers remain (`grep -r "supabase.*from\|\.rpc(" src/app` — clean).

- ~~**Disable the PostgREST data API entirely + delete the 6 skipped RLS tests.**~~
  RESOLVED (2026-07-12): Data API disabled via dashboard and verified HARD-CLOSED by live probe —
  every `/rest/v1/*` endpoint returns 503 PGRST002 (schema-cache access revoked), including the REST
  root with the SECRET key, which had served the full OpenAPI table listing the same day. App
  unaffected: zero REST consumers in src (grep clean), all data access is Drizzle + pooler
  (`src/db/index.ts:14-30`); pooler sanity SELECT unchanged post-toggle. The 6 `skipIf(isLocalDb)`
  tests (former `isolation.test.ts:113-181`) deleted on branch feat/close-postgrest-rls — they
  exercised the now-nonexistent anon-key REST surface — purging the hardcoded test credentials that
  lived at :123-124 with them. Suite: 108 passed / 0 skipped. The 5 running forged-orgId tests are
  untouched. — pre-GTM hardening, 2026-07-12.

## GUEST / EXTERNAL INTAKE — when external requesters are added

- **Public/anonymous intake (Plane deploy-board style).** What: allow non-invited users to submit
  requests via a public link, without workspace membership. Why: invited-guest-only shipped and
  is sufficient for MVP. Plane ref: Plane's deploy board / intake with status filtering
  (`issue_intake__status__in=[0, 2, -2]` in notification views). Trigger: decision to accept
  non-invited submissions.

## LOW PRIORITY / maybe never

- **Auth form DRY.** login/signup are ~95% duplicated. Only worth extracting *if* a third auth screen
  (password reset) is added. Until then, two small files is fine. — Day 1 #6.

## SLUG ROUTING — when workspace slugs enter URLs

- **Reserved-slug guard.** What: block workspace names that slugify to reserved app paths (`app`, `api`,
  `login`, `signup`, `settings`, `onboarding`, `auth`, `intake`, `requests`, `invite`). Why deferred:
  workspace slugs are NOT used in URLs today — routing is by org UUID, not slug — so no collision is
  possible. Plane ref: Plane validates slugs against restricted URLs at workspace creation
  (`RESTRICTED_WORKSPACE_SLUGS`). Trigger: when workspace slugs are introduced into routing
  (e.g. `/{slug}/requests`). — slug-collision recon, 2026-06-26.

---

## Resolved (kept for the trail)

- Gate bypass — client controlled `classification`. Fixed Day 3 morning (HMAC token). — Day 2 #1.
- `ensureWorkspace` as public server action; called 6×/submission. Fixed Day 3 morning + Day 4 morning. — Day 2 #2/#3, Day 3 #2.
- Prompt-injection surface. Fixed Day 3 morning (XML-tag wrapping). — Day 2 #6.
- Open redirect, input validation, cookie options, updatedAt trigger. Fixed Day 2 morning. — Day 1 #1/#2/#4/#5/#10.
- UUID validation (500 on bad URL), board limit. Fixed Day 4 morning. — Day 3 #1/#6.
- Slug collision in workspace bootstrap. Original entry described email-derived slugs + missing retry (Day 1 #9,
  Day 2 #4). Resolved by the bootstrap rework: slug now derives from workspace name (`actions.ts:44-48`), retry
  loop with numeric suffix + RAISE after 10 attempts (`migration 0005:39-55`), `organizations_slug_unique`
  constraint, forge test covers the `-1` case. The email-local-part derivation the entry described no longer exists.
- feat/board-per-group — connection-pool max 3→4 bump (acb8777). CLOSED STALE, not merged. The bump was sized
  "for parallel board queries", but main's board is a single query with in-memory grouping
  (`src/app/(app)/page.tsx:25-52`: one select with joins → per-status `filter` → done-cap `slice`) and
  `grep Promise.all src/app` → zero hits — the parallel workload the bump targeted was superseded and never
  landed. Pool tuning for a nonexistent workload → not needed (CLAUDE.md: default to no on unneeded change).
  Source: branch diff `src/db/index.ts` (`- max: 3` / `+ max: 4`) vs current main `src/db/index.ts:25`
  (`max: 3`). If pool sizing ever needs revisiting, do it against real observed load as a fresh decision —
  not by resurrecting this branch. — branch-backlog drain, 2026-07-01.
