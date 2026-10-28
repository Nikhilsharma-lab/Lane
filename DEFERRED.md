# DEFERRED.md — tracked deferrals from daily code reviews

Everything reviews flagged but we chose not to fix immediately. Organized by **trigger** — the moment each
item must be handled. Nothing here may quietly vanish: per CLAUDE.md's hard gate, every pre-launch item must
be **built or deleted** before the first paying customer.

Each item: what · why deferred · source review.

**Authority update — 2026-09-28:** the confirmed Request pipeline and alignment-first planning decision live
in `REQUIREMENTS.md` §§4–5/15 and `lane-roadmap.md` §3. This ledger preserves historical evidence and conditional
work; older local membership/Owner/Resend descriptions are superseded by Clerk. No historical item reopens a
Closed outcome, or proves the current production cutover. Pipeline approval does
not authorize implementing these unrelated deferrals.

---

## AFTER REQUESTS VISUAL REVIEW — property and lifecycle decisions

- **Saved Request codes/priority and additional context-menu capabilities.** The 2026-10-08 Linear preview uses illustrative IDs and in-memory edits. Nikhil explicitly chose to plan extra statuses/features separately. Resolve the decisions in [Request properties follow-up](docs/superpowers/plans/2026-10-08-request-properties-follow-up.md) before any schema/action work. The production three-status lifecycle and REQUIREMENTS.md remain authoritative; no unsupported Linear menu action is implicitly approved. The plan now includes the live Filter/Display/list-summary audit, status-to-outcome mapping, multi-value filters, preference persistence, completed recency, sub-grouping and explicit adoption/refusal gates.

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
> - ~~Green badge on board~~ — DELETED. Violates the one-signal rule; the former evergreen signal was reserved for the gate at the time, and the current interaction signature is raspberry.
> - ~~Redundant per-card status badge~~ — DELETED. Section header already states the status.

## UN-DEFERRED 2026-10-10 — optimistic UI on lifecycle transitions

- **Optimistic UI on lifecycle transitions.** Pick-up / mark-done wait for the full round-trip. useOptimistic
  (React 19) flips state instantly. On-brand "considered" feel. — Day 3 #7. Verdict: DEFER (rollback flicker
  would be visible against Tokyo latency; complexity over correctness at this stage).
  Trigger: after Tokyo co-location, if transitions still feel slow.
  **Un-deferred 2026-10-10:** "superfast" is a launch requirement (plan decision 8.4). It lands after the
  server is co-located with the database, as a layout-level pending-mutation overlay that clears only when
  the server rows show the change or the action fails (plan Phase 1b, item 1.5), which is what removes the
  flicker the original verdict feared.

## PRE-LAUNCH — hard gate (built or deleted before first paying customer)

- **Faint status pills overlap Request rows at 390px.** Settled local c902 screenshots in Light and Dark show an apparent measurement copy beneath the visible All/More controls, overlapping the first rows. StatusPills, its toolbar CSS and Arc ChipGroup are unchanged from f638, and #167 has no CSS delta; this is source-equality evidence, not a separately reproduced baseline browser result. Reproduce and resolve in the pre-launch visual pass, retaining keyboard and overflow behavior. Evidence: `390-light-requests-settled.png` and `390-dark-requests-settled.png` in the safe #167 evidence archive referenced by `docs/testing/main-compatibility.md`. Design-contract checks do not establish visual approval.
- **A failed second read-state toggle can expose a stale Inbox row.** On the same mounted visit, mark an unread FYI read successfully, then fail mark unread before dispatch: saved state stays read but the row shows unread with the error toast. `notification-read-state.begin` replaces the confirmed patch, and `rollback` removes its replacement; count-only reconciliation cannot repair the stale row. These read-state/list modules and the relevant adapter sequence are unchanged from main f638; #167 changes navigation/session guards, not this overlay owner. Repair as a focused Inbox-state increment before first paying customer, with production regressions covering prior confirmed state and separate list/count refresh ordering; do not restore a whole stale snapshot or add automatic replay. Source: #167 compatibility check, c902f6c8, October28, actual1440/light local app; no production observation. Evidence: docs/testing/main-compatibility.md and external lane-spec-167-inbox-rollback-diagnosis.md / inbox-scope-assessment.md. The original red remains. After the diagnostic context closed, the saved-read FYI was correctly absent from a fresh Inbox, so planned ordinary unread retry/mobile-read checks remain unverified; no hidden state restoration/direct setup write was used.
- **Mobile Label picker overflow and checked-mark contrast.** Before launch, repair keyboard-focus
  horizontal scrolling that clips label names at 390px (Available labels inner width 198px,
  content 274px, `scrollLeft` 76px), and white/near-white checked strokes in light mode.
  Reproduced on #173 `fb9b554` and accepted baseline `9bb6171`; the picker/CSS/Arc checkbox
  are unchanged by catalogue reconciliation. Deferred from #173 to keep that increment scoped;
  verify keyboard, full names and checked-state contrast in both themes after repair.
  Source: `/private/tmp/lane-spec-173-browser-evidence.md`, settled runs5–7 and
  `/private/tmp/lane-spec-173-acceptance/run7-baseline/` (2026-10-25). Functional #173 checks
  pass; this is not visual approval.
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
- ~~**OPERATIONAL — verify `TRIAGE_TOKEN_SECRET` is set in Vercel Production + Preview.** Commit 5819295's
  body ordered it set on 2026-06-18, but the repo cannot confirm dashboard state (INFERENCE only). Missing
  in prod = triage throws on the first real request post-deploy. Trigger: pre-launch dashboard-verification
  pass (alongside Vercel Pro / prod-staging split, Cluster 3).~~ VERIFIED 2026-07-20: Nikhil confirmed the
  dedicated secret is present in both Vercel Production and Preview. — HMAC close-out recon, 2026-07-01;
  closed 2026-07-20.
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

- **Demoting an assigned member to guest leaves in-progress assignments dangling.** The guest cannot pick up
  or mark Done, but an assignment may remain. The older claim of a shipped Owner reassignment action was not
  verified and must not be used as a recovery guarantee. The confirmed target allows attributable admin
  reassignment; this is not implemented yet. Specify recovery in an assignment plan; automatic unassignment remains a separately scoped choice.
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

- **SUPERSEDED 2026-09-24 by the Clerk clean cutover.** Clerk owns sign-in, sign-up, recovery, organizations,
  memberships, roles, and invitations. Lane's legacy `/auth/callback` only redirects old links to `/`; the
  Supabase `safeRedirectPath`, local invite-token, local membership, and Resend invitation paths were deleted.
  Future auth work must use Clerk configuration and components rather than rebuilding these paths locally.

## E2E BRING-UP — Playwright uses Lane Staging

- **STAGING DEPLOYED; CUTOVER OPEN (2026-09-24):** the existing Lane Staging project was paused, not deleted.
  It was resumed; verified backups preceded canonical migrations `0013` and `0014`, and both were verified.
  Clerk runtime `8490730` is Ready at `https://lane-staging.vercel.app`. Fresh release checks passed:
  205 tests across 34 files, typecheck, lint, and build. Live private attachment upload/finalization,
  exact-byte download, and anonymous/cross-workspace denial passed. Live signup → test OTP → required
  workspace → PM label → Requests passed, with no profile before membership. Existing-org role onboarding,
  required-org interruption/reload, and two-workspace board/detail isolation passed live (4 tests including
  setup, 1.9m, exit 0). The emailed invitation was accepted in Clerk; automatic return to Lane after
  the hosted portal is the remaining invite gate. Production is untouched; its
  backup, migration, deployment, and live verification remain open after the staging gate passes.
- `playwright.config.ts` loads ignored Clerk Development keys from `.env.local`, overlays
  `.env.staging.local`, and unconditionally maps `STAGING_DATABASE_URL` to `DATABASE_URL` so production cannot
  leak into E2E. Clerk's official testing token and Backend API helpers now create disposable users and
  organizations; the suite no longer creates Supabase Auth users or local membership/invite rows.
- **OPEN — port alignment.** `baseURL` is `localhost:3100` while `NEXT_PUBLIC_APP_URL` in staging
  env may still say `localhost:3000`. Trigger: if an e2e spec fails on invite-link or redirect
  assertions.

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

- ~~**Email notifications beyond authentication and workspace invitations.**~~ BUILT for Needs-you items only
  (#195 item 2, #206, 2026-10-25, on the integration branch): one email per item, once, through Resend, switched
  off until approved (`LANE_EMAIL_DELIVERY`, `CRON_SECRET`; see REQUIREMENTS.md "Inbox delivery"). Still deferred:
  email for For-your-information activity (comments, pickup, Done), which stays inside Lane by design.
  Trigger for that remainder: real pilot users repeatedly miss activity the Inbox should have made actionable.

- ~~**Notification preferences.**~~ BUILT as one choice per person per workspace (#206): Email (default),
  Slack DM (while an Admin has Slack connected, #207) or Off. Per-type toggles stay deferred; trigger: people ask to
  keep one kind of Needs-you email and stop another.

- **Switching Inbox email on.** What: set `LANE_EMAIL_DELIVERY=1`, `RESEND_API_KEY`, `LANE_EMAIL_FROM` (a domain
  verified in Resend) and `CRON_SECRET`, and add `"crons": [{ "path": "/api/inbox/daily", "schedule": "0 7 * * *" }]`
  to `vercel.json` in the same change. Why: built behind the switch so nothing is sent before approval. Trigger:
  Nikhil approves the email service and migration 0041 is on the target database.

- **Switching Slack DM on.** What: create the Lane Slack app as the #195 build plan describes ("The Slack app"), then
  set `LANE_SLACK_DELIVERY=1`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `LANE_SLACK_TOKEN_KEY`. Why: built behind
  the switch (#207) so nothing reaches Slack before approval; until then Settings → Slack says Slack isn't available
  and nobody can choose Slack DM. Trigger: Nikhil approves the Slack app and migration 0042 is on the target database.

- **Switching billing enforcement on.** What: set `LANE_BILLING_ENFORCED=1`. Why: Free Requests are counted and
  shown (#213) but nothing is blocked, so pilot workspaces are never stopped before billing is approved. The switch
  also turns on paying (#214): checkout is offered only while it is on. Trigger, all of: about 10 target teams have
  been asked what they'd pay (and the $30/$36 prices confirmed or changed in `src/lib/billing-plan-rules.ts`); Lane
  is on Supabase Pro and Vercel Pro (`AGENTS.md`: no payment on Hobby); Nikhil approves Stripe as an external
  service; migrations 0046, 0047 and 0048 are on the target database; and the five Stripe names in `.env.example` are set
  (the webhook endpoint, the two per-seat prices matching Lane's, and the 40%-for-24-months founding coupon).
  Without the Stripe names, switching it on would leave a workspace with no way to pay (the server warns by name).
  Also in Stripe (#216), migration 0049 on the target database first: send the webhook endpoint
  `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
  `customer.subscription.paused` and `customer.subscription.resumed`; set up the customer portal so customers can
  update payment methods, see invoice history, switch between the yearly and monthly prices (same product), and
  cancel at the end of the billing period; and under subscription retries, cancel the subscription when all retries
  fail (an unpaid plan stays lapsed until the card is updated otherwise).

- **Notification tabs (All/Mentions).** What: tabbed notification panel with separate unread counts
  per tab. Why: without @mentions there's only one category. Plane ref: `NOTIFICATION_TABS` constant,
  `ENotificationTab` enum, `UnreadNotificationEndpoint` (returns `total_unread` + `mention_unread`).
  Trigger: a second notification category exists that warrants its own tab.

- **Notification filters (created/assigned/subscribed).** What: filter chips on the notification list
  by relationship to the request. Why: low volume makes filtering unnecessary. Plane ref:
  `ENotificationFilterType` enum, `FILTER_TYPE_OPTIONS`, filter logic in `NotificationViewSet.list`.
  Trigger: team size / notification volume makes scanning the full list slow.

- **Cursor pagination for notifications.** What: replace the Inbox page's `LIMIT 100` (`INBOX_LIMIT`, #204; the
  bell popover's 30 is gone) with cursor-based pagination + "load more." Why: read items clear, so 100 unread is
  more than enough for MVP volumes; Mark all read still clears every item. Plane ref: `BasePaginator` mixin,
  `ENotificationLoader.PAGINATION_LOADER`, `NotificationCardListRoot` "load more" UI.
  Trigger: people regularly hit the 100-item cap.

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
  **2026-10-21: the primary trigger has fired** (the Request preview on the list, plan item 2.12). The
  reassessment is Nikhil's decision; nothing here is built by it, and the popover stays as it is.

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

## COMMAND PALETTE BUTTON — when phone or mouse users need the palette

- **A visible "Jump to… ⌘K" button.** What: a button in the shell (the sidebar header or the page strip)
  that opens the ⌘K command palette, with its key hint, so people on a phone or using only a mouse can reach
  it. Why deferred: spec #101 (Q14) adds no new button. Everything the palette offers stays reachable through
  the sidebar, the Request buttons and the row menus, and phones have no ⌘K. Trigger: usability rounds or
  support show people looking for one place to type what they want on a phone or with a mouse, or the shell
  is redesigned. — spec #101 (Q14), recorded by #107, 2026-10-22.

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

- Request peek/preview — **BUILT 2026-10-21** (launch plan item 2.12, leftover build item L5). The deferral
  (ungated, needed Nikhil's explicit written decision; Plane's issue peek-overview as reference; trigger: a real
  need to view a Request without losing list place) was cleared by Nikhil in chat on 2026-10-21 ("build all"
  leftover items, `docs/superpowers/plans/2026-10-21-leftover-build-plan.md`, PR #63). Built as a non-modal
  preview on the Requests list (Space, J/K follow, Esc back to the row; phones keep full-page navigation),
  reusing the Request page's detail pane through a read-only `GET /api/requests/[id]`. Spec:
  `docs/superpowers/plans/2026-10-21-request-peek.md`. The inbox-pane notification form it was a prerequisite
  for stays deferred under NOTIFICATION AT-SCALE, whose primary trigger this fires (noted there).
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
