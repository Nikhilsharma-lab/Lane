# DEFERRED.md — tracked deferrals from daily code reviews

Everything reviews flagged but we chose not to fix immediately. Organized by **trigger** — the moment each
item must be handled. Nothing here may quietly vanish: per CLAUDE.md's hard gate, every pre-launch item must
be **built or deleted** before the first paying customer.

Each item: what · why deferred · source review.

---

## PRE-GTM MUST-BUILD — slug collision

- **Slug collision in workspace bootstrap.** `bootstrap_organization_membership` generates the slug from
  `email.split("@")[0]`, which collides for two-tab races AND for different users with the same email
  local-part (alice@x.com + alice@y.com → both "alice"). Add ON CONFLICT handling / suffix retry when
  reworking workspace creation. *Will hit real users.* — Day 1 #9, Day 2 #4.

## PRE-GTM MUST-BUILD — board polish

- **Status label/variant duplicated** across board and detail pages. Extract to one shared util so status
  styling lives in one place. — Day 3 #4. Verdict: BUILD (small dedupe, prevents drift).
- **Card hierarchy → reframed problem leads.** The card currently leads with the solution *title* and buries
  the reframed *problem*. For a problem-first board, the problem leads; title is secondary. — board design
  review. Verdict: BUILD (on-thesis — the problem is the unit of work).

> **Removed** (2026-06-26 build-or-delete verdicts):
> - ~~Green badge on board~~ — DELETED. Violates the one-signal rule; evergreen is reserved for the gate.
> - ~~Redundant per-card status badge~~ — DELETED. Section header already states the status.

## POST-GTM — optimistic UI on lifecycle transitions

- **Optimistic UI on lifecycle transitions.** Pick-up / mark-done wait for the full round-trip. useOptimistic
  (React 19) flips state instantly. On-brand "considered" feel. — Day 3 #7. Verdict: DEFER (rollback flicker
  would be visible against Tokyo latency; complexity over correctness at this stage).
  Trigger: after Tokyo co-location, if transitions still feel slow.

## PRE-LAUNCH — hard gate (built or deleted before first paying customer)

- **Rate limiter is in-memory** (`Map`, leaks, resets on deploy). Swap to Upstash. — Day 2 #5.
- **N+1 queries on the detail page** (request + creator + assignee as 3 serial round-trips). Collapse to one
  query with LEFT JOINs. Perf — bites as request counts grow. — Day 3 #3.
- **Board has no real pagination** (only a `.limit(100)` safety cap). Add proper pagination / group limits. — Day 3 #6.
- **Date hydration mismatch.** `toLocaleDateString()` renders in server locale on SSR, client locale after
  hydration → mismatch warning + date flash for cross-timezone teams. Format consistently or client-only. — Day 3 #8.
- **HMAC signing reuses `SUPABASE_SECRET_KEY`.** Works (server-only) but a dedicated signing secret isolates
  concerns. — Day 2 gate-fix note.
- **Duplicate client/server validation** can drift. Point the client form at the same zod schema. — Day 2 #10.
- **Email-confirmation decision.** Turned OFF for dev speed; decide whether real users must confirm email. — Day 1 setup.
- **RLS is currently INERT as a defense.** Drizzle uses DATABASE_URL (postgres role) which bypasses RLS entirely.
  The PostgREST path blanket-denies all queries because `current_app_user_id()` uses the deprecated
  `request.jwt.claim.sub` (should be `request.jwt.claims::json->>'sub'`). Action-level guards
  (`requireActiveMember` / `requireOwnerOrAdmin`) are the **sole** tenant-isolation defense today.
  See also: **RLS BACKSTOP (PATH 1)** section below for the actionable migration plan.
  — Danger-day isolation audit.
- **`completeOnboarding` one-workspace invariant.** Nothing prevents it from minting a second workspace for a
  user who already has one. `acceptInvite` enforces the one-workspace-per-user check; onboarding should too.
  Non-security (creates orphan data, not a leak). — Danger-day action inventory.

> Infra pre-launch items (staging/prod split, Supabase Pro, Vercel Pro, custom domain, cross-workspace RLS
> verification) live in CLAUDE.md's "BEFORE FIRST PAYING CUSTOMER" section. Same gate governs both lists.

## GUEST ROLE-CHANGE — when assignment cleanup is needed

- **Demoting an assigned member to guest leaves in-progress assignments dangling.** No security issue (guest can't
  pick up or mark done), but the request stays assigned to someone who can no longer act on it. Owner can manually
  reassign. Auto-unassign on demotion-to-guest is the clean fix — build when real usage surfaces the gap.
  — Guest role-change increment.

## GUEST INTAKE INCREMENT — when external requesters are added

- **`saveRequest`/`runTriage` sit behind `requireActiveMember`** (members only). Guest external requesters won't
  be workspace members — guest intake needs its own token-scoped or public auth path, not the membership guard.
  Don't forget or guests can't submit. See also: **GUEST / EXTERNAL INTAKE** section below for the public/
  anonymous intake decision (Plane deploy-board style). — Danger-day action inventory.

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

- **Email notifications.** What: transactional email alongside in-app notifications. Why: no email
  provider configured, in-app-first is the correct MVP path. Plane ref: `EmailNotificationLog` model,
  email sending in `notification_task.py`. Trigger: add a transactional email provider (Resend or
  similar).

- **Notification preferences.** What: per-user booleans controlling which notification types generate
  email. Why: meaningless without email notifications. Plane ref: `UserNotificationPreference` model
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

- **Disable the PostgREST data API entirely + delete the 6 skipped RLS tests.**
  What: flip the Supabase dashboard toggle to disable the data API (zero app consumers confirmed),
  then delete `isolation.test.ts` (6 tests, all `skipIf local`, all verify RLS via PostgREST paths
  that are about to be disabled). Why deferred: pure hardening — the data API already blanket-denies
  all queries (broken claim path), action-level guards are the sole and proven defense, and zero app
  code uses PostgREST. Not user-facing. Precondition: bootstrap on Drizzle (met, PR #27).
  Trigger: pre-GTM hardening pass (must be done before GTM per the CLAUDE.md hard gate).

## GUEST / EXTERNAL INTAKE — when external requesters are added

- **Public/anonymous intake (Plane deploy-board style).** What: allow non-invited users to submit
  requests via a public link, without workspace membership. Why: invited-guest-only shipped and
  is sufficient for MVP. Plane ref: Plane's deploy board / intake with status filtering
  (`issue_intake__status__in=[0, 2, -2]` in notification views). Trigger: decision to accept
  non-invited submissions.

## LOW PRIORITY / maybe never

- **Auth form DRY.** login/signup are ~95% duplicated. Only worth extracting *if* a third auth screen
  (password reset) is added. Until then, two small files is fine. — Day 1 #6.

---

## Resolved (kept for the trail)

- Gate bypass — client controlled `classification`. Fixed Day 3 morning (HMAC token). — Day 2 #1.
- `ensureWorkspace` as public server action; called 6×/submission. Fixed Day 3 morning + Day 4 morning. — Day 2 #2/#3, Day 3 #2.
- Prompt-injection surface. Fixed Day 3 morning (XML-tag wrapping). — Day 2 #6.
- Open redirect, input validation, cookie options, updatedAt trigger. Fixed Day 2 morning. — Day 1 #1/#2/#4/#5/#10.
- UUID validation (500 on bad URL), board limit. Fixed Day 4 morning. — Day 3 #1/#6.
