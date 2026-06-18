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
  (`requireActiveMember` / `requireOwnerOrAdmin`) are the **sole** tenant-isolation defense today. Task: fix
  the claim path and verify RLS policies scope every table by workspace, restoring defense-in-depth.
  — Danger-day isolation audit.
- **`completeOnboarding` one-workspace invariant.** Nothing prevents it from minting a second workspace for a
  user who already has one. `acceptInvite` enforces the one-workspace-per-user check; onboarding should too.
  Non-security (creates orphan data, not a leak). — Danger-day action inventory.

> Infra pre-launch items (staging/prod split, Supabase Pro, Vercel Pro, custom domain, cross-workspace RLS
> verification) live in CLAUDE.md's "BEFORE FIRST PAYING CUSTOMER" section. Same gate governs both lists.

## GUEST INTAKE INCREMENT — when external requesters are added

- **`saveRequest`/`runTriage` sit behind `requireActiveMember`** (members only). Guest external requesters won't
  be workspace members — guest intake needs its own token-scoped or public auth path, not the membership guard.
  Don't forget or guests can't submit. — Danger-day action inventory.

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
