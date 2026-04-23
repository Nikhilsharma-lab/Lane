# TODOS

Captured during /plan-eng-review on 2026-04-12 (main branch).
Deferred items migrated from DEFERRED.md on 2026-04-12.

---

## Engineering Tasks (from eng review)

### [1] Cursor-based pagination for requests

**What:** Full cursor-based pagination for the requests page, and scope the dashboard's `allRequests` to only active+attention items (no completed history).

**Why:** Both `app/(dashboard)/dashboard/page.tsx:172` and `app/(dashboard)/dashboard/requests/page.tsx:28` use `db.select().from(requests).where(eq(requests.orgId, profile.orgId))` with no `.limit()`. A design org accumulates requests quickly. At 500+ requests this becomes a multi-second server render; at 5000 it will hit Next.js response size limits or Vercel function timeout.

**Pros:** Prevents production scaling emergency. Normal orgs can easily hit 500 requests in 6 months.

**Cons:** Requires UI changes (load-more or infinite scroll), server-side cursor field, and client state to append pages.

**Context:** An interim `.limit(200)` is being added now as a safety net (issue 8 fix). Full cursor pagination is tracked here for when the first team outgrows that limit.

**Depends on:** RLS migration (same files).

---

### [3] withAuthAction helper
**Status: ⚠️ VERIFIED STILL OPEN 2026-04-22** — helper was never built; 8 action files still carry copy-paste auth block.

**What:** Create `lib/actions.ts` with a `withAuthAction(fn)` wrapper that handles Supabase session lookup, profile fetch, and `withUserDb` setup in one place. Replace the copy-pasted block in `app/actions/requests.ts`, `app/actions/cycles.ts`, `app/actions/initiatives.ts`, `app/actions/stickies.ts`, `app/actions/reflections.ts`, `app/actions/activity-log.ts`, `app/actions/assignments.ts`, and `app/actions/ideas.ts`.

**Why:** The `getAuthedUserId()` + profile fetch + `withUserDb` block is copy-pasted 8 times. When `revalidatePath` behavior needs to change (or when RLS is wired in), it has to be updated 8 places. One missed update = silent divergence. Already bit us once: 3 action files call `revalidatePath('/dashboard/requests')` while others call `revalidatePath('/dashboard')` — no consistent invalidation.

**What to build:**
- `lib/actions.ts` — `withAuthAction<T>(fn: (ctx: { userId, profile, db }) => Promise<T>): Promise<T | { error: string }>`
- Wire `revalidatePath` calls inside here (single place to update)
- Migrate 8 action files to use wrapper

**Effort:** ~15 min

---

### [4] Dashboard query parallelization
**Status: partial progress 2026-04-18 in Item 15g (commit f16a2da)** — split aggregate + focus queries. The 8+ sequential → `Promise.all` refactor still outstanding.

**What:** `app/(dashboard)/dashboard/page.tsx` runs 8+ sequential DB queries. Wrap independent fetches in `Promise.all()`.

**Why:** Each sequential query adds 10-50ms server latency. At 8 queries that's potentially 80-400ms of avoidable wait on every dashboard load — before a single byte is painted.

**What to build:**
- Identify independent fetches in the dashboard page (briefing, alerts, requests, assignments, validations, projects, org members)
- Group independent ones into `Promise.all()`
- Fetches that depend on prior results (e.g. proveRequests → validationSignoffs) stay sequential

**Effort:** ~10 min

---

### [2] AI triage eval harness
**Status: confirmed still open 2026-04-22.**

**What:** A standalone eval suite at `tests/evals/triage-classification.eval.ts` that runs curated test cases through `triageRequest()` and asserts the `classification` field matches expected values.

**Why:** The intake gate (problem_framed vs solution_specific vs hybrid classification) is the core product differentiator. `lib/ai/triage.ts:63` calls `generateObject` with a Haiku model. Every prompt change ships blind without an eval — you won't know if classification broke until a user reports it.

**Pros:** Protects the core feature from silent regressions. Haiku is fast and cheap (~$0.001/run). Can gate CI on it.

**Cons:** Requires real Claude API calls in CI (needs `ANTHROPIC_API_KEY` in CI env). May be flaky if Anthropic updates model behavior.

**Context:** See test plan at `~/.gstack/projects/Nikhilsharma-lab-Lane/yashkaushal-main-eng-review-test-plan-20260412-104255.md` for the 7 curated test cases to use.

**Depends on:** Vitest setup (being built now in issue 6).

---

## PRE-LAUNCH KILLER FEATURES (build before launch, in this order)

Agreed 2026-04-02. No hard deadline — launch when all 7 are done.

### Approach 3 — Speed + Visibility (build first)
- [x] **Speed Layer** — Cmd+K command palette, J/K navigation, Cmd+N quick capture, optimistic UI ✅ Built 2026-04-02
- [x] **Design Radar** — live designer status (in flow/idle/blocked), phase heat map, risk panel, shipped this week ✅ Built 2026-04-02
- [x] **AI Context Brief** — auto-generated brief when designer opens a request (what PM means, related past work, constraints, questions to ask) ✅ Built 2026-04-03

### Approach 1 — Make Design Visible (build second)
- [x] **Handoff Intelligence** — AI handoff brief, Figma drift alert, handoff quality score per designer ✅ Built 2026-04-03
- [x] **Impact Intelligence** — prediction confidence score before committing, Design ROI by type, "what we learned" retrospective brief ✅ Built 2026-04-04

### Approach 2 — AI Does the Work (build third)
- [x] ✅ Built 2026-04-18 (partial) — **Proactive Alerts** — AI-decided push alerts for Design Head. stall_nudge with hourly cron shipped; stall_escalation explicitly REMOVED per anti-surveillance principle (Item 15d — commit c884eda)
- [x] ✅ Built 2026-04-17 — **AI Pre-flight Check** — PM impact prediction rated by AI before submission, quality score before triage (Item 4 — commits 5c3ac55, 7fe00ad, 5cca8e8, 4295443, 7eef16b)

### Additional (added post-roadmap, now built)
- [x] **Dev Board (KF8)** — `/dashboard/dev`, full dev kanban with drag-and-drop, slide-over detail, Design QA gate ✅ Built
- [x] **Projects (KF9)** — project switcher, per-project scoping of radar/digest/calibration ✅ Built

### Plane-Inspired Features (built 2026-04-10)
- [x] **Intake Split-Pane** — dedicated `/dashboard/intake` triage UI with sidebar list + detail panel, accept/decline/snooze/duplicate actions ✅
- [x] **Power K Command Palette** — two-key keyboard shortcuts (G+R, N+R, etc.), enhanced cmdk palette with navigation/creation/request groups ✅
- [x] **Filter Chips** — URL-param backed applied filter chips on request list with clear all ✅
- [x] **Rich Empty States** — contextual warm copy across all views matching Lane's tone ✅
- [x] **Snooze / Defer** — date-based snooze with presets + auto-resurface cron job (daily 9 AM) ✅
- [x] **Stickies + Reflections** — unified floating capture pad (FAB), stickies panel, optional request linking, private by default ✅
- [x] **Notification Preferences** — per-category × per-channel (in-app + email) toggle grid at `/settings/notifications` ✅
- [x] **Appetite-Based Cycles** — project-level cycles with appetite bar, aggregate throughput, one active per project ✅
- [x] **Initiatives** — cross-project request grouping, requests can belong to 1 project + N initiatives ✅
- [x] **Team-Level Analytics** — pipeline chart, flow rate, cycle throughput (aggregate only, never per-designer) ✅
- [x] **Request Timeline** — per-request activity log with actor, action, timestamps in detail dock Timeline tab ✅
- [x] **Per-Iteration Commenting** — iterations in diverge/converge stages with threaded comments ✅
- [x] **Published Views** — shareable views with authenticated or public link access modes ✅
- [x] **Dashboard Polish** — welcome greeting, briefing refresh button, dismiss all alerts, sidebar nav updates ✅

---

Everything below was intentionally skipped during the current sprint.
Nothing here is abandoned — it's queued. Pick up items in priority order.

---

## Priority 0 — Build Immediately (before first customer)

### Fix Cron Auth Bypass (Security — BLOCKING)
**Status: ✅ SHIPPED 2026-04-19 (PR #34)** — original blocker detail preserved below as archaeology.

**Why urgent:** `app/api/cron/alerts/route.ts:16-17` and `app/api/insights/digest/generate/route.ts` both use the pattern `if (cronSecret && authHeader !== ...)`. If `CRON_SECRET` is not set in the environment, `cronSecret` is `undefined`, the condition short-circuits, and the auth check is **completely skipped** — anyone can hit these endpoints. The alerts cron writes `proactiveAlerts` rows to the DB; the digest cron calls Claude and writes `morningBriefings`. Both are exploitable for free AI credit abuse.

**What to build:**
- In both cron routes: remove the conditional — always require `CRON_SECRET`
- If missing: throw at startup or return 500 with `"CRON_SECRET env var required"`
- Pattern: `if (!process.env.CRON_SECRET || request.headers.get("Authorization") !== \`Bearer ${process.env.CRON_SECRET}\`) return 401`

**Effort:** ~5 min

---

### Fix Cross-Org Data Leak in Published Views (Security — BLOCKING)
**Status: ✅ SHIPPED 2026-04-19 (PR #34)** — original blocker detail preserved below as archaeology.

**Why urgent:** `app/views/[id]/page.tsx:31-43` authenticated view mode checks only that the viewer is logged in, then loads all requests from `view.orgId` without verifying the viewer belongs to that org. A user from Org A can access Org B's published view (and see Org B's request list) by guessing or enumerating view IDs.

**What to build:**
- After loading the viewer profile, add: `if (viewer.orgId !== view.orgId) return notFound()`
- Applies only to the `access_mode === 'authenticated'` branch; public views are intentionally open

**Effort:** ~5 min

---

### Fix getActivityLog Org Scoping (Security — BLOCKING)
**Status: ⚠️ VERIFIED STILL OPEN 2026-04-22** — elevated to pre-customer security sweep in `DOCS BIG/docs/ROADMAP.md` parking lot. `app/actions/activity-log.ts` still uses `systemDb` with only `requestId` filter (verified 2026-04-22). Original detail preserved below.

**Why urgent:** `app/actions/activity-log.ts` uses `systemDb` with no org filter. `getActivityLog(requestId)` returns activity log rows for any requestId regardless of which org the caller belongs to. An authenticated user can enumerate activity log entries for requests they have no access to by passing arbitrary request UUIDs.

**What to build:**
- Switch from `systemDb` to `withUserDb` in `getActivityLog`
- Add join to `requests` table to assert `requests.orgId = caller.orgId` before returning rows
- OR add an explicit `orgId` parameter and filter on it

**Effort:** ~10 min

---

### Fix withUserSession Pooler Mismatch (Security / Data Correctness — BLOCKING)
**Status: ✅ SHIPPED 2026-04-19** — PR #36 added fail-closed behavior when `DIRECT_DATABASE_URL` is missing in production; commit e1db32e migrated session-mode code paths to use `DIRECT_URL`. Note: env var landed as `DIRECT_DATABASE_URL`, not `SESSION_DATABASE_URL` as originally proposed below. Original blocker detail preserved as archaeology.

**Why urgent:** `db/user.ts` `withUserSession` sets `app.current_user_id` with `set_config('app.current_user_id', userId, false)` — the `false` flag means session-level (persistent across transactions). But `DATABASE_URL` points to Supabase's transaction pooler on port 5432 (PgBouncer). On the transaction pooler, session-level config does NOT persist between statements. RLS policies that rely on `auth.uid()` via `current_setting('app.current_user_id')` will read `null` on every query that doesn't re-set it. The net effect: `withUserSession` thinks it is enforcing RLS but is not.

**What to build:**
- Add `SESSION_DATABASE_URL` env var pointing to Supabase's **session pooler** (port 6543): `postgresql://...pooler.supabase.com:6543/postgres`
- In `db/user.ts`: update `withUserSession` to use `SESSION_DATABASE_URL` instead of `DATABASE_URL`
- Add `SESSION_DATABASE_URL` to `.env.local`, Vercel env vars, and `CLAUDE.md` env var table
- Add to activation checklist

**Effort:** ~15 min

---

### RLS Policies (Security — BLOCKING)
**Status: ⚠️ PARTIAL** — PR #40 added RLS for 11 tables introduced in migration 0007. Full route inventory + migration plan in `docs/rls-audit.md` (Item 12 — commit d3b78ab). Remaining execution deferred to pre-customer security sweep.

**Why urgent:** All data is org-scoped in app code, but there's no DB-level enforcement. A crafted request could leak cross-org data. Must ship before any real user touches the product.

**What to build:**
- RLS policies on ALL tables: `requests`, `stickies`, `notification_preferences`, `activity_log`, `cycles`, `cycle_requests`, `initiatives`, `initiative_requests`, `iterations`, `iteration_comments`, `published_views`, `validations`, `assignments`, `comments`, `ideas`, `impact_records`, `figma_connections`, `figma_updates`
- Pattern: `auth.uid()` → join to `profiles.id` → check `profiles.org_id` matches row's `org_id`
- Stickies: additional policy — only author can read/write (privacy)
- Published views with `access_mode = 'public'`: allow anonymous SELECT when valid `public_token` matches
- Enable RLS on each table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- Test: create two test orgs, verify cross-org queries return empty

### Redis Rate Limiting (AI abuse prevention — BLOCKING)
**Status: ✅ SHIPPED 2026-04-18 (Item 13 — commit 006cf4c)** — all 11 AI routes covered. Original blocker detail preserved below as archaeology.

**Why urgent:** AI routes call Claude API which costs money. No rate limiting = one bad actor burns through your Anthropic credits.

**What to build:**
- Add Upstash Redis (`@upstash/ratelimit` + `@upstash/redis`)
- Rate limit these routes: `/api/requests/triage`, `/api/requests/[id]/context-brief`, `/api/requests/[id]/handoff-brief`, `/api/ideas/validate`, `/api/morning-briefing`
- Limits: 10 req/min per user for AI routes, 60 req/min for non-AI
- Env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Return 429 with friendly message when rate limited

### Design Frame Creation (Week 5-6 gap)
**Status: ✅ SHIPPED 2026-04-18 (Item 14 part 1 — commit d5f15cf)** — Frame panel with 4 structured fields + PM-brief comparison. Original scope detail preserved below as archaeology.

**Why:** The Frame stage in the design phase has no dedicated UI yet. Designers need a structured form to articulate the problem, success criteria, and constraints — this is the "north star" referenced in all subsequent stages.

**What to build:**
- Structured form in the Frame stage panel: Problem (designer's words), Success criteria, Constraints, Divergence from PM brief (optional)
- AI comparison widget: PM's original problem ↔ Designer's frame, with highlighted differences
- Save as a `design_frames` record (may need new schema table or store as JSON on request)

---

## Priority 1 — Build Next (Month 1–2)

### Figma OAuth
**Status: IN PROGRESS** — spec written at `docs/superpowers/specs/2026-04-03-figma-oauth-design.md`

MVP ships on-demand sync (fetch on request detail load). The following are deferred:

#### Figma OAuth — Scheduled Polling
**Why deferred:** On-demand sync is sufficient for MVP. Cron adds infra overhead (job runner, failure handling, rate-limit management) with no clear customer ask yet.

**What to build when ready:**
- Cron job (via `vercel.json`) that runs every 15–30 min
- Iterates all orgs with a `figma_connections` row
- For each org: fetches versions for all requests with a `figmaUrl` in dev/design phase
- Inserts new versions into `figma_updates` (same dedup logic as on-demand)
- Secured via `CRON_SECRET` header

#### Figma OAuth — App Registration (Activation Blocker)
**Why deferred:** Requires manual setup in Figma's developer console — doing when ready to onboard customers.

**What to do (not a code task):**
1. Go to figma.com/developers → Create a new app named "Lane"
2. Add redirect URIs: `http://localhost:3000/api/figma/oauth/callback` (dev) + `https://your-vercel-url/api/figma/oauth/callback` (prod)
3. Copy Client ID + Client Secret
4. Add to `.env.local`: `FIGMA_CLIENT_ID=` and `FIGMA_CLIENT_SECRET=`
5. Add same vars to Vercel environment variables → redeploy

This is a one-time setup. One OAuth app for all customers — each customer authorises through Lane's app, their token is stored per-org in `figma_connections`.

#### Figma OAuth — Token Encryption at Rest
**Why deferred:** Plaintext token is acceptable for pre-launch. Add before onboarding paying customers.

**What to build when ready:**
- Add `ENCRYPTION_KEY` env var (32-byte AES key)
- Encrypt `access_token` + `refresh_token` in `figma_connections` on write
- Decrypt on read before passing to Figma API calls
- One-time migration to encrypt existing rows

#### /settings/integrations — Full Hub (Slack, Linear live)
**Why deferred:** UI shell ships now (Figma functional + Slack/Linear as placeholders). Live integrations are Month 2–3.

**What to build when ready:**
- Slack: webhook URL per org, wire into assign/sign-off/handoff/shipped events
- Linear: OAuth, auto-create issue on handoff, sync status back

#### figma_updates — Scale Optimisation (100+ customers)
**Why deferred:** At current scale (10–50 orgs) the table is negligible. Revisit when you have 100+ active orgs each syncing frequently.

**What to do when ready:**
- Add a DB index on `(request_id, figma_version_id)` — speeds up the dedup SELECT in `lib/figma/sync.ts`
- Add a retention policy: archive or delete `figma_updates` rows older than 90 days for requests in `track` or `done` phase (they're no longer actionable)
- Consider a `figma_updates_archive` table for audit trail if legal/compliance requires it
- If row count exceeds ~1M: partition `figma_updates` by `created_at` month (Postgres native partitioning)

**Trigger:** Check when Supabase dashboard shows `figma_updates` approaching 500k rows.

---

### Weekly Digest — Stored Per Org (Cron Pre-generation)
**Status: ✅ SHIPPED 2026-04-18 (Item 15c — commit f87c157)** — historical archive, retry, email delivery all wired. Original deferral detail preserved below as archaeology.

**Why deferred:** Current digest is on-demand (user clicks "Generate"). For the Friday auto-delivery vision, the cron needs to generate and store digests per org so they're pre-loaded when users open Insights on Monday.

**What to build:**
- Add `weekly_digests` table to DB: `id`, `org_id`, `week_start`, `digest_json`, `generated_at`
- Update `/api/insights/digest/generate/route.ts` to iterate all orgs, generate + store digest
- Update `/api/digest` GET to first check for a stored digest for current week, fall back to live generation
- DigestPanel: show "Generated Friday" timestamp when loading a stored digest

**Cron already configured** (`vercel.json` — every Friday 9am UTC):
```json
{ "path": "/api/insights/digest/generate", "schedule": "0 9 * * 5" }
```

**Env var needed:**
```
CRON_SECRET=   ← set in Vercel to secure the cron endpoint
```

---

## Priority 2 — Month 2–3

### Triage Loading State UX
**Why:** `lib/ai/triage.ts` calls Claude synchronously during request submission. The round trip is 1-3 seconds for Haiku. There is no visible loading indicator — the UI appears frozen after the PM clicks submit. This will cause double-submits and "is this broken?" support tickets from first users.

**What to build:**
- Add a loading state to the intake form submit button: spinner + "Analyzing your request..."
- Disable the submit button while triage is in flight
- On error: show a retry-able error state, not a blank form

**File:** Intake form component (wherever the triage submit is wired up)
**Effort:** ~10 min

---

### Email Activation (not a build task — just env vars)
Code is fully built. Just needs 3 Vercel env vars:

```
RESEND_API_KEY=        ← sign up at resend.com (free, 3k/month)
EMAIL_FROM=            ← "Lane <notifications@yourdomain.com>" (domain verified in Resend)
                          OR use "onboarding@resend.dev" for testing without domain verification
NEXT_PUBLIC_APP_URL=   ← live Vercel URL e.g. https://lane.vercel.app
```

Steps:
1. Sign up at resend.com → copy API key
2. Verify sending domain in Resend OR use `onboarding@resend.dev`
3. Add all 3 vars in Vercel → redeploy
4. Test by creating an invite — should receive email

---

### Slack Notifications
**Why deferred:** Low ROI for MVP. Zapier can bridge this initially.

**What to build when ready:**
- `SLACK_WEBHOOK_URL` env var (per org or global)
- `lib/slack/index.ts` — `sendSlack(text)` helper, silent no-op if key not set
- Wire into: assign route, validation sign-off, handoff, shipped
- Settings page: paste webhook URL per org

---

### Designer Performance Dashboard
**Why deferred:** PM calibration (built) covers the PM side. Designer side needs more data to be meaningful.

**What to build:**
- Per-designer view: avg cycle time, throughput per week, on-time rate, requests by type
- Trend charts (last 4 weeks)
- Compare designer against org average
- Surfaces in Team page or as sub-tab on Insights

---

## Priority 3 — Month 3–4

### Linear Integration (Native)
**Why deferred:** Zapier can bridge for MVP. Native integration is Month 3.

**What to build:**
- OAuth with Linear API
- On handoff: auto-create Linear issue with title, description, Figma link, assignee
- Sync status back: when Linear issue closes → mark Lane request as shipped
- `LINEAR_CLIENT_ID` + `LINEAR_CLIENT_SECRET` env vars

---

### Duplicate Detection (Embeddings-Based)
**Why deferred:** AI triage already flags potential duplicates via text matching. Embeddings-based is more accurate but requires vector storage.

**What to build:**
- Generate embeddings for each new request on creation (OpenAI `text-embedding-3-small` or Supabase pgvector)
- Cosine similarity search against existing request embeddings
- Threshold: surface anything above 0.85 similarity
- Show in triage results + at request creation time

---

### Figma Plugin
**Why deferred:** Web app link is sufficient for MVP. Plugin is a nice-to-have for power users.

**When to build:** Only if customers explicitly ask. Defer 6+ months.

---

### Auto-Comment in Figma
**Why deferred:** Low ROI. Figma's own notification system handles this.

---

### Version Comparison Tool (Figma Diff Viewer)
**Why deferred:** Too complex for MVP. Figma link is enough.

---

## Activation Checklist (things built but not yet live)

| Item | Status | What's needed |
|------|--------|---------------|
| Email notifications | Built ✅ | 3 Vercel env vars (see Priority 2 above) |
| Weekly digest cron | Built ✅ | Item 15c wired historical archive + email delivery (commit f87c157, 2026-04-18) |
| Figma sync | UI built ✅ | Figma OAuth flow (Priority 1) |
| RLS policies | Partial ⚠️ | 11 tables covered by PR #40; full plan in `docs/rls-audit.md`; remaining execution deferred to pre-customer sweep |
| Redis rate limiting | Built ✅ | Item 13 covers all 11 AI routes (commit 006cf4c, 2026-04-18) |
| Snooze resurface cron | Cron configured ✅ | `CRON_SECRET` in Vercel (shares with other crons) |
| Notification preferences | Built ✅ | Email channel needs Resend env vars (see Priority 2) |
| Published views (public) | Built ✅ | Needs RLS policy for anonymous SELECT with token |
| withUserSession RLS enforcement | Fixed ✅ | `DIRECT_DATABASE_URL` fail-closed in PR #36 (2026-04-19) |
| Cron auth | Fixed ✅ | PR #34 (2026-04-19) enforces Bearer `CRON_SECRET` |
| Published views auth check | Fixed ✅ | PR #34 (2026-04-19) added `viewer.orgId === view.orgId` check |
| Activity log scoping | ⚠️ UNSCOPED — Priority 0 verified still open 2026-04-22 | Elevated to ROADMAP parking lot; see "Fix getActivityLog Org Scoping" above |

---

## Notes

- **Figma webhook route** (`app/api/figma/webhook/route.ts`) is deleted as part of the OAuth build — replaced by on-demand sync.
- **`FIGMA_WEBHOOK_TOKEN`** env var was removed from the plan. Don't add it.
- Everything in this file has corresponding code stubs or downstream components already built — nothing starts from zero.
