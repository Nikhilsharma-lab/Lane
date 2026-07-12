# LANE ROADMAP — the path through the terrain

> **STATUS: Phase 0 functional loop shipped — pre-GTM gate.** Phase 2 is unselected and gated on real design-lead usage.

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

## 2. The destination — Requests first, expansion pulled by evidence

**Requests is Lane's only committed product.** Ideas, Docs, Insights, outcome learning, and agentic design
operations are an unranked hypothesis pool — product possibilities, not scheduled apps or build promises.
Real Requests usage decides which problem, if any, deserves to become Phase 2.

| Hypothesis | Plane analog / source | Lane's unresolved question |
|---|---|---|
| **Ideas** | No clean analog; closest is Drafts/Stickies | Is lighter capture genuinely distinct from a Request? |
| **Docs** | Pages / Wiki | Do teams need problem-context documents inside Lane? |
| **Insights** | Analytics | Can problem-pattern insight help without measuring people? |
| **Outcome learning** | Lane-specific | Does predicted-versus-actual reflection improve decisions without becoming a scorecard? |
| **Agentic design operations** | Lane-specific | Which bounded procedural task helps designers while preserving human judgment and craft? |

The two-tier app-switcher remains an architectural option from `conventions-plan.md`; it appears only if a
second app earns its place through validation. Nothing is shown merely to signal a suite vision.

---

## 3. The incremental sequence

**Phase 0 — Foundation. FUNCTIONAL LOOP SHIPPED.** App shell + two-tier-ready nav;
roles/members/invites; settings IA (workspace vs account); the **Requests** app — board, detail, lifecycle,
comments, guest role; auth + onboarding (create workspace, invite-join, post-create invite step); members/invites.
All merged. Invited Guest is shipped as a limited workspace member. Settings → Profile is shipped; changing
the PM / Designer / Developer label does not change access or permissions.

**What's next:** close the **pre-GTM gate** (see §3a below) — the hardening, infra, and product decisions that
must be done before real users. Then Phase 1.

**Phase 1 — Make Requests excellent; make the gate the star.** Harden the gate (it's the differentiator —
it deserves the most polish); request-detail layout; search / command palette; saved filters. Lightweight
in-app notifications for pick-up, comments, completion, and invite acceptance are already shipped; expansion
stays trigger-gated in `DEFERRED.md`. **Validation gate:** the four committed design leads actually using Lane
in real work. Phase 2 remains unselected until their usage pulls for a specific problem.

### 3a. Pre-GTM launch list

Everything standing between Phase 0 (complete) and real users. Source: DEFERRED.md pre-launch gate,
CLAUDE.md "before first paying customer", and the 2026-06-26 pre-GTM recon. Nothing ships to real users
until every must-build is done and every must-decide is resolved (built or deleted).

**Must-build (16 items):**

DEFERRED.md PRE-LAUNCH hard gate (8):
- [x] Rate limiter → Upstash (in-memory leaks, resets on deploy) → RESOLVED (sliding window 10/60s, fail-open; 3ad18fa, merged e368edc)
- [x] N+1 queries on detail page → single JOIN query → RESOLVED (aliased self-joins + 6 forge tests; merge 879b484)
- [ ] Board pagination → DEFERRED post-GTM 2026-07-12, exempt from the hard gate (main already has 200-cap + Done-25 with count affordance; cursor pagination is a scale problem invite-only launch won't hit; data-based trigger — ~120 active requests in any workspace — filed in DEFERRED.md)
- [x] Date hydration mismatch (server/client locale divergence) → RESOLVED (en-US pinned, relative-time.ts:11 + invite-row.tsx:74; 5f9dee1/6f49888 — checkbox caught up 2026-07-12)
- [x] HMAC signing → dedicated secret (not SUPABASE_SECRET_KEY) → RESOLVED in code (dedicated TRIAGE_TOKEN_SECRET, no fallback, loud throw; 5819295 — predated this list. Operational residues: secret value in .env.local + Vercel presence, filed in DEFERRED.md)
- [x] Duplicate client/server validation → shared zod schema → RESOLVED (shared request-schema.ts, both sides wired, + editedProblemText server-gap fix found in diagnosis; 4f52bae/25885dc/d6aba11)
- [x] Email confirmation → RESOLVED 2026-07-12: Resend SMTP + SPF/DKIM/DMARC configured; production URL
  corrected to `https://www.uselane.app`; Confirm email enabled; live self-signup reached the persistent
  check-email screen, delivered and confirmed into onboarding; a server-verified invite bypassed confirmation,
  accepted successfully, and reached the correct shared board. Forge/unit and browser regression coverage pass.
- [x] RLS inert as defense — verify action guards sufficient → RESOLVED (guards verified airtight by sweep + 5 forged-orgId tests; RLS has no reachable surface post-Data-API-disable; live two-account check remains as the CLAUDE.md infra item below)

DEFERRED.md PRE-GTM must-build (1):
- [x] Disable PostgREST data API + delete 6 skipped RLS tests (precondition met, PR #27) → RESOLVED (dashboard-disabled + probe-verified 503 incl. secret-key root, 2026-07-12; 6 tests + hardcoded creds deleted on feat/close-postgrest-rls; suite 108/0)

Board polish — verdicts from build-or-delete review (2):
- [x] Status label/variant → shared util (small dedupe, prevents drift) → RESOLVED (request-status.ts, imported by board + detail; f7df09e — checkbox caught up 2026-07-12)
- [x] Card hierarchy → reframed problem leads, title secondary (on-thesis: the problem is the unit of work) → RESOLVED (page.tsx:140-149 reframed problem leads, title secondary; f7df09e — checkbox caught up 2026-07-12)

CLAUDE.md infra (5):
- [ ] Split prod / staging (second Vercel project + second Supabase DB)
- [ ] Supabase Pro (backups / point-in-time restore)
- [ ] Vercel Pro (Hobby prohibits commercial use)
- [ ] Custom domain (app.uselane.app → prod Vercel project)
- [x] Confirm workspace isolation with fresh second accounts → RESOLVED (live browser E2E creates two users
  and workspaces, proves A sees its seeded Request while B sees neither the board card nor direct detail;
  `e2e/workspace-isolation.spec.ts`)

**Resolved (2026-06-26 / 2026-06-27):**
- Slug collision in workspace bootstrap → RESOLVED (bootstrap rework: name-derived slug, retry loop, unique constraint, forge test)
- Green badge on board → DELETED (violates one-signal rule; evergreen reserved for the gate)
- Redundant per-card status badge → DELETED (section header already states status)
- Optimistic UI on lifecycle → DEFERRED post-GTM (trigger: after Tokyo co-location, if transitions still feel slow)
- `completeOnboarding` one-workspace invariant → RESOLVED (bootstrap IF FOUND early-return + profiles.id PK covers concurrent race; forge-tested)

**Already parked (17 items):** guest role-change, guest intake increment, comment pagination, auth
surface touch, request peek/preview, 9 notification-at-scale items, public/anonymous intake, auth form
DRY, optimistic UI on lifecycle, reserved-slug guard. All carry explicit post-GTM triggers in DEFERRED.md.
No action needed before launch.

---

**Phase 2 — UNSELECTED.** Choose one hypothesis only after Requests is in sustained real use and evidence
identifies the next problem. Definition and validation precede implementation. No current hypothesis has
priority merely because it appeared in an earlier roadmap.

**Woven in only when usage pulls:** favorites, archives (soft-delete), exports, and preferences.

### Validation gates

1. **Operational readiness:** pre-GTM auth, isolation, recovery, deployment, and live verification are done.
2. **Intake value:** real teams repeatedly use the gate and designers prefer the resulting problem frames.
3. **Requests workflow value:** the board becomes part of real work rather than a second source of truth.
4. **Requests excellence:** demonstrated friction is addressed before adding another product layer.
5. **Next-problem evidence:** Phase 2 is selected only when usage identifies a specific unmet need.

Dates do not advance phases. Evidence does.

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
