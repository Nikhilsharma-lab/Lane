# DEFERRED.md — tracked deferrals from daily code reviews

Everything reviews flagged but we chose not to fix immediately. Organized by **trigger** — the moment each
item must be handled. Nothing here may quietly vanish: per CLAUDE.md's hard gate, every pre-launch item must
be **built or deleted** before the first paying customer.

Each item: what · why deferred · source review.

---

## NEXT BUILD — Day 4 (onboarding / invites)

- **Slug collision in workspace bootstrap.** `bootstrap_organization_membership` generates the slug from
  `email.split("@")[0]`, which collides for two-tab races AND for different users with the same email
  local-part (alice@x.com + alice@y.com → both "alice"). Add ON CONFLICT handling / suffix retry when
  reworking workspace creation. *Will hit real users.* — Day 1 #9, Day 2 #4.

## DAY 5 — polish pass

- **Status label/variant duplicated** across board and detail pages. Extract to one shared util — do it
  *as part of* the green-badge restyle below, so status styling lives in one place. — Day 3 #4.
- **Green is absent on the board.** The signature color appears nowhere; status badges are its home
  (e.g. In Progress = the active/green state). — board design review.
- **Optimistic UI on lifecycle transitions.** Pick-up / mark-done wait for the full round-trip. useOptimistic
  (React 19) flips state instantly. On-brand "considered" feel. — Day 3 #7.
- **Redundant per-card status badge** inside grouped sections (an "Open" badge under the "Open" header).
  Drop per-card badges in grouped view. — board design review.
- **Card hierarchy decision (product call, Nikhil's):** the card leads with the solution *title* and buries
  the reframed *problem*. For a problem-first board, consider leading with the problem. — board design review.

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

## RLS BACKSTOP (PATH 1) — when onboarding/first-run is built

- **Migrate `bootstrap_organization_membership` RPC → Drizzle transaction behind the guard.**
  What: the Supabase RPC is the last piece using PostgREST directly; moving it to a Drizzle
  transaction lets us disable the PostgREST data API entirely, eliminating the surface. The RLS
  claim path is broken (`request.jwt.claim.sub` vs `request.jwt.claims::json->>'sub'`), but
  disabling PostgREST makes fixing it moot. Why: action-level guards are the sole defense today
  and are proven; the RPC migration is cleanup, not urgent. Plane ref: n/a.
  Trigger: building onboarding/first-run (which reworks workspace creation anyway).

- **6 RLS/GoTrue tests (`isolation.test.ts`, `skipIf local`) sit outside the CI gate.**
  What: these tests verify RLS policies via Supabase client paths but are skipped in CI because
  they need a running GoTrue instance. Why: the PostgREST blanket-deny makes them advisory, not
  load-bearing. Plane ref: n/a. Trigger: the RLS backstop above is completed (PostgREST
  re-enabled with fixed claim path, or disabled entirely) — at that point these tests become
  load-bearing and must enter CI.

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
