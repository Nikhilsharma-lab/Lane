# LANE ROADMAP — the path through the terrain

> **STATUS: Phase 0 — foundation + Requests.** Update on phase advance. Phase 2+ gated on real design-lead usage.

`PLANE-MAP.md` is the terrain: what a mature product in this space looks like. This is **Lane's chosen path
through it**, filtered by the thesis (anti-surveillance, problem-first, design teams). The map shows
everything possible; this says what Lane builds, what it bends, and what it refuses — and in what order.

**How to read it:** the near-term is concrete and committed. Everything past Phase 1 is *directional* — a
sequence we revise with every real design lead who uses Lane. Nothing past the near-term is a build promise.
That distinction is the whole defense against rebuilding the v1 cathedral: we plan the destination loosely and
the next step tightly, and usage rewrites the rest.

---

## 1. The thesis filter — adopt / reconceive / refuse

This is the core decision. Plane's feature surface sorts into three buckets for Lane:

**ADOPT** — serves problem-first work or is neutral plumbing:
Requests (≈ Work Items), Comments, Activity log, Docs (≈ Pages/Wiki), Notifications, Search / command palette
(≈ Power-K), saved filters (≈ Views, light), Drafts, Attachments, Favorites, Archives (soft-delete),
Profile/Preferences, Exports.

**RECONCEIVE** — exists in Plane but must be bent to the thesis, or it imports the wrong paradigm:
- **The gate (≈ Intake/triage).** Plane's Intake is a human accept/decline/snooze queue for throughput. Lane
  occupies the *same slot* but does something philosophically opposite: AI reframes the request into a problem.
  Same position in the flow, inverted purpose. This is Lane's sharpest "we took a known pattern and turned it
  against itself" story.
- **Insights (≈ Analytics).** Adopt analytics *only* as problem-pattern insight (which problems recur, where
  friction clusters) — never people-utilization, throughput, or velocity dashboards. The name is a landmine;
  the definition must be locked when built.
- **Guest (≈ Guest).** External requester who sees only their own requests (confirmed on-thesis from Plane's
  own model).
- **Feature toggles.** Plane gates features per project; Lane can use feature flags to *roll apps out
  incrementally*, never to *gate by role*. Feature-gating yes, role-gating never.

**REFUSE** — the velocity-and-surveillance machinery Lane is positioned *against*. Refusing these IS the product:
- **Cycles / Sprints**, **Modules**, **Estimates / story points**, **burndown / velocity**, **worklogs /
  time tracking**, **workspace-utilization & "active cycles" dashboards**, the **initiatives→epics→cycles
  hierarchy**, and **per-project custom workflow states** (Plane has 6 state groups + custom states; Lane
  keeps 3: Open / In Progress / Done, on purpose). Every one of these measures or maximizes throughput. A
  design lead who opens Lane and sees no sprint, no velocity chart, no utilization metric — that's the wedge
  landing.

Refusing the REFUSE bucket is not deferral. It's positioning. These don't come back later.

---

## 2. The destination — Lane as a suite

From your app-suite call: **Requests, Ideas, Docs, Insights.** Each maps to a proven Plane implementation, with
Lane's twist:

| Lane app | Plane analog (proven impl) | Lane's twist |
|---|---|---|
| **Requests** | Work Items + Intake | The gate reframes solutions → problems before they land |
| **Ideas** | (no clean analog — closest is Drafts/Stickies) | Lighter capture; *needs its own definition vs Requests* |
| **Docs** | Pages / Wiki (TipTap editor) | Problem-context docs, not generic wiki |
| **Insights** | Analytics | Problem-pattern, never people-metrics |

Two-tier app-switcher rail (per conventions-plan) holds these; it appears once app #2 ships.

---

## 3. The incremental sequence

**Phase 0 — Foundation. COMPLETE.** App shell + two-tier nav (rail ready, single app shown);
roles/members/invites; settings IA (workspace vs account); the **Requests** app — board, detail, lifecycle,
comments, guest role; auth + onboarding (create workspace, invite-join, post-create invite step); members/invites.
All merged. *The full single-team loop is live.*

**What's next:** the **pre-GTM gate** (see §3a below) — the concrete list of hardening, infra, and product
decisions that must be done before real users. Then Phase 1.

**Phase 1 — Make Requests excellent; make the gate the star.** Harden the gate (it's the differentiator —
it deserves the most polish); request-detail layout; notifications (someone picked up your request, commented);
search / command palette; saved filters. **Validation gate:** the four committed design leads actually using
it daily. Phase 2+ is a hypothesis until they pull for more.

### 3a. Pre-GTM launch list

Everything standing between Phase 0 (complete) and real users. Source: DEFERRED.md pre-launch gate,
CLAUDE.md "before first paying customer", and the 2026-06-26 pre-GTM recon. Nothing ships to real users
until every must-build is done and every must-decide is resolved (built or deleted).

**Must-build (18 items):**

DEFERRED.md PRE-LAUNCH hard gate (9):
- [ ] Rate limiter → Upstash (in-memory leaks, resets on deploy)
- [ ] N+1 queries on detail page → single JOIN query
- [ ] Board pagination (only `.limit(100)` safety cap)
- [ ] Date hydration mismatch (server/client locale divergence)
- [ ] HMAC signing → dedicated secret (not SUPABASE_SECRET_KEY)
- [ ] Duplicate client/server validation → shared zod schema
- [ ] Email-confirmation decision (on/off for real users)
- [ ] RLS inert as defense — verify action guards sufficient
- [ ] `completeOnboarding` one-workspace invariant

DEFERRED.md PRE-GTM must-build (2):
- [ ] Slug collision in workspace bootstrap (will hit real users)
- [ ] Disable PostgREST data API + delete 6 skipped RLS tests (precondition met, PR #27)

Board polish — verdicts from build-or-delete review (2):
- [ ] Status label/variant → shared util (small dedupe, prevents drift)
- [ ] Card hierarchy → reframed problem leads, title secondary (on-thesis: the problem is the unit of work)

CLAUDE.md infra (5):
- [ ] Split prod / staging (second Vercel project + second Supabase DB)
- [ ] Supabase Pro (backups / point-in-time restore)
- [ ] Vercel Pro (Hobby prohibits commercial use)
- [ ] Custom domain (app.uselane.app → prod Vercel project)
- [ ] Confirm RLS isolation with fresh second account

**Resolved — build-or-delete verdicts (2026-06-26):**
- Green badge on board → DELETED (violates one-signal rule; evergreen reserved for the gate)
- Redundant per-card status badge → DELETED (section header already states status)
- Optimistic UI on lifecycle → DEFERRED post-GTM (trigger: after Tokyo co-location, if transitions still feel slow)

**Already parked (16 items):** guest role-change, guest intake increment, comment pagination, auth
surface touch, request peek/preview, 9 notification-at-scale items, public/anonymous intake, auth form
DRY, optimistic UI on lifecycle. All carry explicit post-GTM triggers in DEFERRED.md. No action needed
before launch.

---

**Phase 2 — App #2: Ideas.** Reveal the app-switcher rail (now there are two apps). First: *define what Ideas
is* — a product decision, not a copy (Plane has no clean analog). Lightweight problem/idea capture, distinct
from a Request.

**Phase 3 — App #3: Docs.** Pages/wiki on TipTap (the map's `editor` package pattern). Realtime collab is a
later luxury, not a Phase-3 requirement.

**Phase 4 — App #4: Insights.** Problem-pattern analytics — the anti-surveillance reconception. Lock the
definition (problems, not people) before a line is written.

**Woven in as needed, not as phases:** favorites, archives (soft-delete), exports, profile/preferences.

---

## 4. Patterns to adopt early (filtered for Lane's stack)

The map's "worth borrowing" list, minus what assumes Plane's architecture (Lane is Next.js + server actions +
Drizzle — so MobX/SWR dual-layer, the Django/SPA split, and the CE/EE Django seam do **not** apply; the map
itself flags those as don't-adopt for Lane):

1. **Soft-delete + slug recycling** — `deleted_at` filter, uniqueness scoped to non-deleted rows, `__<epoch>`
   slug suffix on delete. Cheap to add at the schema level now, enables archive/undo later. Adopt early.
2. **Optimistic update with rollback** — snapshot → apply → revert on error. Already on DEFERRED.md for the
   lifecycle actions; this is the proven shape.
3. **Creator-bypass permission** — "you can always edit your own stuff" as an escape hatch on top of the role
   check. Simpler than full RBAC, and it's exactly how the guest/own-requests rule already works.
4. **Feature flags for incremental rollout** — flip apps on per-workspace as they ship. Feature-gating only,
   never role-gating.

---

## 5. The discipline that keeps this from becoming v1

- **One increment a week.** Don't build an app because it's next on this list — build it because usage pulls
  for it.
- **Validate between phases.** Past Phase 1, this roadmap is a set of hypotheses. The four design leads are
  your instrument; their usage rewrites the order. (This is also where the still-open customer-discovery gap
  gets closed — real users, not the map, decide Phase 2+.)
- **The refusals hold.** When a customer asks for sprints or a velocity chart, the answer is a considered no,
  and the reason is the entire reason Lane exists. The roadmap's refusals are load-bearing.
