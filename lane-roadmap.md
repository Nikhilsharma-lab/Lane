# LANE ROADMAP — the path through the terrain

> **STATUS: Requests foundation — pre-GTM gates still open.** On 2026-09-28 Nikhil confirmed the
> inception-to-closure contract and selected alignment inside Requests as the first increment to plan.
> Documentation/planning approval is not implementation, migration or deployment approval.
> **2026-10-06:** product/journey source of truth and Request/quarter/year predicted-versus-actual impact
> are core target requirements. Predictions begin at creation; the submitter owns results and closure.
> Reasoned exception outcomes may close but are excluded from measured-impact totals.

`REQUIREMENTS.md` defines Lane's confirmed behaviour. This roadmap sequences focused increments through
the product thesis: one source of truth, measurable impact, problem-first Intake and support for design
teams without surveillance. It records what Lane builds, reshapes or refuses, and in what order.

**How to read it:** `REQUIREMENTS.md` §§4–5 records confirmed product behaviour; this file sequences focused
increments. Alignment is selected for planning, not already built. Later release order depends on dependencies
and real use, not dates. Unrelated apps/integrations/agents remain hypotheses. No single full-pipeline build.

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

## 2. The destination — one Request from problem to outcome

**Requests remains Lane's product surface.** The confirmed target connects problem-first Intake, named trio
alignment, assignment/scheduling, nonlinear discovery, complete build/release readiness, measurement and
creator-owned closure. Closed is permanent; new work after release/closure uses a linked follow-up with fresh
alignment. Recorded disagreement blocks progression without creator/admin override. Work stays
Open / In Progress / Done; outcome Not started / Measuring / Closed and alignment/readiness are separate.

The 2026-10-06 clarification requires this chain to feed a shared product/journey record and quarterly/yearly
outcome summaries. These are confirmed product requirements, distinct from the unselected generic Insights
application below. The exact journey representation and report-period/aggregation rules need focused design.

This target is not current implementation or production readiness. The exact behavioural authority is
`REQUIREMENTS.md` §§4–5 and §15. The following remain **unselected hypotheses**, not promised apps:

| Hypothesis | Plane analog / source | Lane's unresolved question |
|---|---|---|
| **Ideas** | No clean analog; closest is Drafts/Stickies | Is lighter capture genuinely distinct from a Request? |
| **Docs** | Pages / Wiki | Do teams need problem-context documents inside Lane? |
| **Insights** | Analytics | Can problem-pattern insight help without measuring people? |
| **Agentic design operations** | Lane-specific | Which bounded procedural task helps designers while preserving human judgment and craft? |

The two-tier app-switcher remains an architectural option from `conventions-plan.md`; it appears only if a
second app earns its place through validation. Nothing is shown merely to signal a suite vision.

---

## 3. The incremental sequence

**Phase 0 — Foundation. FUNCTIONAL LOOP SHIPPED; CLERK CUTOVER IN PROGRESS.** App shell +
settings IA; the **Requests** app — board, detail, lifecycle, comments, guest enforcement, and Profile settings.
Clerk now owns users, sessions, organizations, memberships, roles, and invitations; Lane keeps only the
PM / Designer / Developer profile label and Clerk IDs on domain records. Local membership and invitation
tables are removed. Production guest invitations remain unavailable until Clerk Enhanced B2B is approved.

**Operational track:** close the **pre-GTM gates** (§3a), including live Clerk recovery/invitation return,
production-specific cutover and isolation. Documentation approval does not mark these complete. Feature
planning can proceed separately; no feature release bypasses operational verification.

**Current bounded increment — MVP launch plan, Phase 0 (accepted 2026-10-10).** Nikhil accepted
`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md` with its default decisions: finish and land the
Requests list polish on a green, protected baseline (Phase 0); co-locate the server with the database and
simplify every mutation (Phase 1); cut production over early for one or two pilot teams; then migrate the
remaining pages to the Linear-style system one small increment at a time. That plan now carries the
sequence, the budgets and the open decisions; this section records only the selections.

**Previous bounded increment — Saved Request codes (feature-first selection 2026-10-08).** Nikhil chose
Request features first when offered codes/priority versus trio agreement. Implement stable workspace-local
codes, copy and existing workspace-search retrieval as one local slice; saved priority followed on 2026-10-09 (`0019`).
See `docs/superpowers/plans/2026-10-08-saved-request-codes.md`. Staging now has `0017`–`0019` (applied 2026-10-09 after a verified export and a local rehearsal); production migration and release gates remain open.
This selection changes the immediate sequence without removing the alignment and outcome contract below.

**Next foundational increment — Trio alignment inside Requests (planning selected 2026-09-28).** Define named
participants, the compact versioned agreement, recorded concerns and a server-enforced no-bypass guard.
The agreement must reuse the predicted impact recorded during creation and its measurement window, so the
first alignment increment does not approve work without an expectation to compare later. First design the
creation → human review → awaiting trio agreement chain; AI framing is not stakeholder agreement.
Assignment must not implicitly start work or grant alignment. Discovery versus delivery commitments and
material-edit invalidation must be addressed wherever necessary to make the guard truthful. Resolve the
guest sponsorship/replacement/concurrency details, inspect Arc source and local behavior, specify Storybook states and
approve the focused schema/action/test plan before code. No separate Roadmap route or prioritization score.

**Acceptance for the alignment increment:** creator/admin/direct-action/stale-version attempts cannot advance
without the current trio's agreement; dissent has a specific reason; replacements cannot erase it; a team
can align or withdraw without duplicate briefs; assignment does not bypass the start guard. Verify tenant
isolation, recovery and accessibility alongside the user journey. Real design leads validate its usefulness.

**Later contract slices — separately planned, not a bundle:**

1. Complete success/evidence capture and nonlinear artifact context, reusing links rather than new document apps.
2. Complete build/release readiness, with implementation and deployment retained in specialist tools.
3. Measurement and creator-owned closure, including truthful exceptions, immutable closed history,
   append-only factual corrections and follow-up recovery. Do not ship closure without those safeguards.
4. Quarterly/yearly product outcome summaries from those same Request records, with compatible metrics,
   shared-result deduplication, visible outstanding reviews and exceptions outside measured-impact totals.

Product/journey context and change-history linking must be defined alongside these slices, using existing
artifacts where suitable. A new journey map/editor, reporting route, integration or storage model is not
silently authorized. The full outcome chain is a foundation; sequencing is not a decision to omit it from
the product or market an unfinished loop as complete.

These are dependency-oriented planning groups, not fixed release dates; smaller cuts require coherent
end-to-end behaviour and explicit approval. Integrations and extra AI are not prerequisites or authorized.
Intake/detail polish, the existing isolated search increment, command palette and saved filters remain
separate candidates. Only the explicit 2026-10-08 feature-first selection above changes the immediate ordering.

### 3a. Pre-GTM launch list

The implemented foundation is distinct from open cutover/release gates. Source: DEFERRED.md pre-launch gate,
AGENTS.md "FREE PILOT → FIRST PAYMENT", and the historical pre-GTM review. No payment is accepted until
every must-build is done and every inline deferred decision in §3a is explicit (built, deleted,
or trigger-gated). A 20–30-person free,
non-commercial pilot is explicitly approved on free tiers; it exists to validate Requests, not bypass the
paid-launch gate.

**Recorded launch checklist (historical counts are not a current work estimate):**

DEFERRED.md PRE-LAUNCH hard gate (8):
- [x] Rate limiter → Upstash (in-memory leaks, resets on deploy) → RESOLVED (sliding window 10/60s, fail-open; 3ad18fa, merged e368edc)
- [x] N+1 queries on detail page → single JOIN query → RESOLVED (aliased self-joins + 6 forge tests; merge 879b484)
- [ ] Board pagination → DEFERRED post-GTM 2026-07-12, exempt from the hard gate (main already has 200-cap + Done-25 with count affordance; cursor pagination is a scale problem invite-only launch won't hit; data-based trigger — ~120 active requests in any workspace — filed in DEFERRED.md)
- [x] Date hydration mismatch (server/client locale divergence) → RESOLVED (en-US pinned, relative-time.ts:11 + invite-row.tsx:74; 5f9dee1/6f49888 — checkbox caught up 2026-07-12)
- [x] HMAC signing → dedicated secret (not SUPABASE_SECRET_KEY) → RESOLVED in code (dedicated TRIAGE_TOKEN_SECRET, no fallback, loud throw; 5819295 — predated this list. Operational residues: secret value in .env.local + Vercel presence, filed in DEFERRED.md)
- [x] Duplicate client/server validation → shared zod schema → RESOLVED (shared request-schema.ts, both sides wired, + editedProblemText server-gap fix found in diagnosis; 4f52bae/25885dc/d6aba11)
- [x] Email confirmation → RESOLVED 2026-07-12: Resend SMTP + SPF/DKIM/DMARC configured; production URL
  is `https://app.uselane.app`; Confirm email enabled; live self-signup reached the persistent
  check-email screen, delivered and confirmed into onboarding; a server-verified invite bypassed confirmation,
  accepted successfully, and reached the correct shared board. Forge/unit and browser regression coverage pass.
- [x] RLS inert as defense — verify action guards sufficient → RESOLVED (guards verified airtight by sweep + 5 forged-orgId tests; RLS has no reachable surface post-Data-API-disable; live two-account check remains as the CLAUDE.md infra item below)

DEFERRED.md PRE-GTM must-build (1):
- [x] Disable PostgREST data API + delete 6 skipped RLS tests (precondition met, PR #27) → RESOLVED (dashboard-disabled + probe-verified 503 incl. secret-key root, 2026-07-12; 6 tests + hardcoded creds deleted on feat/close-postgrest-rls; suite 108/0)

Board polish — verdicts from build-or-delete review (2):
- [x] Status label/variant → shared util (small dedupe, prevents drift) → RESOLVED (request-status.ts, imported by board + detail; f7df09e — checkbox caught up 2026-07-12)
- [x] Card hierarchy → reframed problem leads, title secondary (on-thesis: the problem is the unit of work) → RESOLVED (page.tsx:140-149 reframed problem leads, title secondary; f7df09e — checkbox caught up 2026-07-12)

AGENTS.md infra (5):
- [ ] Clerk clean cutover → on 2026-09-24, verified backups preceded staging migrations `0013` and `0014`,
  both verified; Clerk runtime `8490730` is Ready at `https://lane-staging.vercel.app`. Fresh release checks:
  205 tests across 34 files, typecheck, lint, and build passed. Live private attachment upload/finalization,
  exact-byte download, and anonymous/cross-workspace denial passed. Live email/password signup → test OTP →
  required workspace → PM label → Requests passed, with no profile created before membership. Existing-org
  role onboarding, required-org interruption/reload, and two-workspace board/detail isolation passed live
  (4 tests including setup, 1.9m, exit 0). The emailed invitation was accepted in Clerk; automatic
  return to Lane after the hosted portal remains the invite gate. Production is untouched and still needs
  its backup, migration, deployment, and live verification after staging passes. The old Supabase Auth and
  Resend invite verification is historical evidence only and does not satisfy the Clerk gate.
- [x] Split prod / staging → RESOLVED 2026-07-13: the free `Lane Staging` Tokyo Supabase project was
  initialized from the canonical migration chain and paired with the separate `lane-staging` Vercel Hobby project
  at `https://lane-staging.vercel.app`. Live verification covered signup, Resend confirmation, onboarding, the
  persistent invite step, invite acceptance, membership creation, and the shared Requests board. Until managed
  backups exist: manual verified export before every migration; staging first, then production.
- [ ] Supabase Pro → deferred during the 20–30-person free pilot; required at the first payment/data-value trigger
  for managed daily backups. PITR is a separate paid add-on requiring an explicit cost decision.
- [ ] Vercel Pro → deferred during the free, non-commercial pilot; required before accepting the first payment.
- [x] Custom domain → RESOLVED 2026-07-12: `app.uselane.app` is production; `www.uselane.app` returns a
  path-preserving permanent 308 redirect; Vercel app URL and Supabase Site URL/callback allowlist use `app`.
- [ ] Confirm workspace isolation with fresh second Clerk accounts → the retained browser E2E creates two
  Clerk users and organizations and asserts both board and direct-detail isolation. It passed against the
  local Clerk build and deployed staging on 2026-09-24. Live attachment anonymous/cross-workspace denial
  also passed, including forged organization context. Production verification remains pending.

**Resolved (2026-06-26 / 2026-06-27):**
- Slug collision in workspace bootstrap → RESOLVED (bootstrap rework: name-derived slug, retry loop, unique constraint, forge test)
- Green badge on board → DELETED (violates the one-signal rule; the former evergreen signal was reserved for the gate at the time, and the current interaction signature is raspberry)
- Redundant per-card status badge → DELETED (section header already states status)
- Optimistic UI on lifecycle → DEFERRED post-GTM (trigger: after Tokyo co-location, if transitions still feel slow)
- `completeOnboarding` one-workspace invariant → RESOLVED (bootstrap IF FOUND early-return + profiles.id PK covers concurrent race; forge-tested)

**Conditional work:** `DEFERRED.md` retains scale/usage triggers and historical resolutions. Its older
auth, local-invitation, reassignment and peek claims must not override current source or Clerk cutover
evidence. Do not interpret a historical item count as either open work or current launch clearance.

---

**Beyond the confirmed Request pipeline — UNSELECTED.** Choose a separate product/agent hypothesis only after
real use identifies its need. The confirmed pipeline is not permission to build Ideas, Docs or Insights apps.

**Woven in only when usage pulls:** favorites, archives (soft-delete), exports, and preferences.

### Validation gates

1. **Operational readiness:** pre-GTM auth, isolation, recovery, deployment, and live verification are done.
2. **Intake value:** real teams repeatedly use the gate and designers prefer the resulting problem frames.
3. **Requests workflow value:** the board becomes part of real work rather than a second source of truth.
4. **Alignment value:** the trio can reach a clear commitment or stop with reasons, without redundant reporting;
   server guards prevent disagreement, stale alignment and assignment from being bypassed.
5. **Next-increment evidence:** observed use and dependencies select the next slice of the confirmed contract.
6. **Outcome value:** teams return with results or truthful exceptions; changes remain traceable without scores.

Dates do not advance phases. Evidence does.

---

## 4. Patterns to adopt early (filtered for Lane's stack)

These patterns fit Lane's Next.js, server-action and Drizzle stack. Each remains subject to the focused
product approval and sequencing rules above:

1. **Soft-delete + slug recycling** — reference for a future approved archive/undo need, not permission to add
   schema now. Archiving is not reopening a Closed outcome or rewriting its preserved history.
2. **Optimistic update with rollback** — snapshot → apply → revert on error. Already on DEFERRED.md for the
   lifecycle actions; this is the proven shape.
3. **Scoped responsibility** — derive identity from the Clerk session and enforce workspace/Request rights.
   A creator's ownership never bypasses trio alignment, readiness or immutable closure. Plane's creator-bypass
   pattern must not be copied into these transitions.
4. **Feature flags for incremental rollout** — flip apps on per-workspace as they ship. Feature-gating only,
   never role-gating.

---

## 5. The discipline that keeps this from becoming v1

- **One increment a week.** Don't build an app because it's next on this list — build it because usage pulls
  for it.
- **Validate between increments.** The Request pipeline is confirmed; its unbuilt slices still need scoped
  plans, approval and validation. The four design leads inform order and usability. Other products/agents
  remain hypotheses; a competitor reference never supplies build authority.
- **The refusals hold.** When a customer asks for sprints or a velocity chart, the answer is a considered no,
  and the reason is the entire reason Lane exists. The roadmap's refusals are load-bearing.
