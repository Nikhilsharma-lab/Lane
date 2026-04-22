# Lane Roadmap

**Status:** Active plan, April 14, 2026
**Budget:** ~15 focused hours per week, ~98 hours total work
**Duration:** 7 weeks of planned work + 1 week buffer
**Re-scope checkpoint:** End of week 4
**Source:** Built collaboratively from Phases 1-4 of the April 14 roadmap session. See CLAUDE.md for full context on vocabulary lock and build rules.

> **Next session:** B2 — Migration 0013 (was 0012 before post-B1 renumber) — invite team scoping (`invites.team_id`, `invites.team_role`) + unique pending invite index. Parallel pg-tap `test/sql/test_migration_0013.sql`. (~1.25 hours estimated). Prerequisites: none beyond B1 (which shipped 2026-04-22). See ROADMAP parking lot for `0013 audit_log reinstate team_id` follow-up that B2 must also address.

---

## How to use this document

This file is the source of truth for what to build next on Lane. Every session starts by opening this file, finding the first unchecked item in the current week, and running it as its own scoped session.

**Rules for executing against this roadmap:**

1. **Items run top-to-bottom within a week.** The order within a week respects dependencies; don't skip ahead.
2. **Strict dependencies are marked `[STRICT]`.** These items cannot start until their prerequisites are checked off. Violating a strict dependency will produce broken work.
3. **Soft dependencies are marked `[SOFT]`.** These are recommended orderings but not blocking; you can choose to proceed if you accept the tradeoff.
4. **Check off items as you finish them** — mark the `[ ]` as `[x]` and add the actual hours spent in parentheses so future-you has real data.
5. **If an item takes more than 2x the estimate, stop and re-scope.** Either the item is bigger than we thought (break it into sub-items) or something is wrong (investigate before pushing through).
6. **Every session uses stop-point discipline** — small prompts, raw output review, manual commits. This is how the roadmap stays on track.
7. **Re-scope at week 4.** After week 4 ships, re-read weeks 5-7 with fresh eyes and decide whether the remaining work is still the right priority.

---

## Verification tasks (do these in week 1 before anything they gate)

These exist because Phase 2 dependency mapping surfaced four "don't know" answers. Each one blocks later work. Run them first so the rest of the plan executes on known ground.

- [x] **V1** — Verify migration 0002 applied to Supabase dev. `designer_owner_id` column confirmed on `requests` table via Drizzle Studio. Gates Item 11. (actual: 5 min)
- [x] **V2** — Investigate Request submitter ID storage. Found: `requester_id` column exists in `db/schema/requests.ts` (lines 92-94). Item 6 uses the existing column — no migration needed. Gates Item 6. (actual: 5 min)
- [x] **V3** — Verify Anthropic API key works. **Findings (April 14):** Expanded into 3-hour debug session. Four bugs found and fixed: (1) seed-only AI data — triage never ran live; (2) dead API key replaced; (3) deprecated model ID `claude-3-5-haiku-20241022` → `claude-haiku-4-5-20251001` across 17 files; (4) Zod 4 + Anthropic structured output incompatibility (vercel/ai#13355) — runtime clamping pattern applied. Triage verified end-to-end. Gates Item 4. (actual: 3 hours)
- [x] **V4** — Investigate pgvector duplicate detection status. **Findings (April 14):** pgvector is NOT installed or used. Schema has no vector column, no embedding generation code in `lib/`, no pgvector similarity operators in queries. Duplicate detection works via LLM-based comparison — triage prompt asks Claude to find semantic overlaps with existing Requests, results stored as JSON in `potential_duplicates` column. Feature works end-to-end (verified during V3 test). CLAUDE.md Part 9.3 describes pgvector as the approach but this was never implemented. Current approach is fine at small scale; needs replacement before high-volume. Affects Item 9 — scope increased (see below). (actual: 15 min)

---

## Spec sessions (do these in week 1 before items that depend on them)

These items are on the sidebar or in the spec files but don't yet have enough design to build against. Each one is a ~25-45 min conversation that produces a short spec file, then a later build session against that spec.

- [x] **S1** — Spec Reflections page. What is it, who sees it, is it attached to Requests or standalone, what does the writing experience look like, what's the team-lead view? Produces `docs/reflections-spec.md`. Gates Item 7-build, Item 8, Item 14. (45 min)
- [x] **S2** — Spec "What's new" footer. Decide scope: changelog, marketing surface, announcement bar, or something else. Produces a spec section (can be inline in nav-spec.md). Gates the "What's new" build in week 4. (25 min)

---

## Week 1 — Foundation and unknowns

**Goal:** Resolve every unknown, finish vocabulary cleanup, ship the intake check, ship My requests as a real page.

**Budget:** 15 hours. **Planned:** ~13 hours. **Slack:** 2 hours.

- [x] V1 — Verify migration 0002. Column exists. (actual: 5 min)
- [x] **Item 11** — Apply migration 0002 to Supabase dev. Schema already in sync — `npm run db:push` returned no changes. Column `designer_owner_id` confirmed present from V1. (actual: 1 min)
- [x] V2 — Investigate Request submitter ID storage. `requester_id` exists — no migration needed. (actual: 5 min)
- [x] V3 — Verify Anthropic API key works. Expanded to 3 hours — 4 bugs found and fixed. See verification section above. (actual: 3 hours)
- [x] V4 — Investigate pgvector duplicate detection. Not installed; LLM-based. See verification section above. (actual: 15 min)
- [x] **Item 3** — Rename `teams/[slug]/streams/` route to `active-requests/`. Updated page component, nav keys in `active-item.ts` and `order.ts`, `team-section.tsx` link+label, both test files. 43/43 tests pass. (actual: 40 min)
- [x] **S2** — Spec "What's new" footer. **Outcome:** Footer is NOT yet built (nav-spec was inaccurate about that). Specced inline in `nav-spec.md` for Week 4 build. Data source: existing `CHANGELOG.md` at repo root. UI: small expandable footer in sidebar shell, default-collapsed, shows last 5 user-facing entries. Discipline rule defined: only user-noticeable changes get entries; internal work doesn't. Estimated build effort: ~1.5 hours when executed. (actual: ~30 min spec conversation)
- [x] **S1** — Spec Reflections page. **Outcome: Reflections deferred to post-v1.** After pressure-testing, determined the feature existed more to illustrate Lane's anti-surveillance philosophy than to solve a real user need. No v1 AI feature depends on reflections. No customer feedback requested them. Better to ship Lane with the intake gate, 4-phase model, and AI features as the core story, and revisit Reflections after 3+ beta users have used Lane for 4+ weeks. Rename of Diverge "Reflection field" to "Rationale" in CLAUDE.md, removal of /dashboard/reflections from sidebar (placeholder route preserved), and deferral of Item 7-build and related downstream items captured in this commit. (actual: ~30 min conversation + implementation)
- [x] **Item 1** — Phase 2 Sign-off → Prove rename + stale identifier sweep. Renamed `validation-gate.tsx` → `prove-gate.tsx`, `ValidationGate` → `ProveGate`, `teams/[slug]/validation/` → `/prove/`, `isRefineStage` → `isProveStage`, nav keys `validation_gate` → `prove`. 11 files touched (2 renamed + 9 modified), TypeScript clean, 90/90 tests pass. Schema table `validation_signoffs` intentionally NOT renamed (cancelled April 13). Shipped in commit 73cfedb. (actual: ~1 hour)
- [x] **AI foundation verification + silent failure audit.** [STRICT: required before Item 4] Completed across two sessions (April 14-15). Phase 1: grepped all 8 `lib/ai/` files for Anthropic-incompatible Zod constraints. Phase 2: fixed 3 files (prediction-confidence, idea-validator, morning-briefing) — 6 fields total, same pattern: drop constraints, expand `.describe()`, add runtime validation. Phase 3: verified all 8 AI features end-to-end against real `claude-haiku-4-5-20251001`. All 8 PASS. Phase 4: refactored silent failure patterns across 13 files — 1 lib/ai catch-and-rethrow, 2 API route error surfacing fixes, 9 UI component console.error additions, 1 API response shape improvement (triageStatus field). Total actual time: ~7 hours across two sessions (estimated 2-3 hours).
- [x] **Item 4** — Intake check UI build. **Complete (April 17).** Sub-tasks A+F (migration adding 4 classifier columns, spec renamed to match existing intakeJustification), B (reverted — lib/ai/intake-classifier.ts was duplicate of triage's classification), and C (extended triage with extractedSolution field, extended preflight route response) shipped on April 16. Sub-task D (three-panel UI in new-request-form.tsx with spec-exact copy, description converted to controlled state, form-onChange gated via `data-intake-justification` to preserve typing in the justification field) shipped April 17 as commit 4295443. Sub-task E (triage-before-insert reorder, server-side `intake_gate_blocked` 400 for solution_specific/hybrid without justification, fail-open on triage errors, client reads `data.message` for user-facing display) shipped April 17 as commit 7eef16b. Analytics events from onboarding-spec section 10 explicitly deferred per April 16 parking lot decision. (actual D+E: ~2 hours) [STRICT: after V3, after AI foundation verification]
- [x] **Item 5** — Real My requests page. Server component at `app/(dashboard)/dashboard/my-requests/page.tsx` querying `designerOwnerId = profile.id AND orgId = profile.orgId`, sorted by `updatedAt desc`. Phase filter as URL-driven client component at `./phase-filter.tsx` (All / Predesign / Design / Build / Track pills). CompactRequestRow list or empty state per CLAUDE.md Part 8. `dev → Build` label mapping enforced in filtered empty state to prevent vocabulary drift. Cards link to `/dashboard/requests?dock={id}` per DetailDock architecture. Out of scope and deferred: sidebar Tier 2 badge count, `G M` shortcut, `designer_owner_id` index. Shipped April 17 as commit ea073d3. (actual: ~1 hour)

**Week 1 exit state:** All unknowns resolved. Both specs written. Vocabulary fully clean across the codebase. Intake check shipped and visible to users submitting requests. My requests page is real.

---

## Week 2 — Customer-critical infrastructure and placeholder pages

**Goal:** Ship security layer, finish all three placeholder pages as real pages.

**Budget:** 15 hours. **Planned:** ~13.5 hours. **Slack:** 1.5 hours.

- [x] **Item 12** — Supabase RLS policies for requests, reflections, validations. Enforce org scoping at the database level. Write `create policy` SQL statements for each table covering: who can read (own org's rows only), who can insert (authenticated members of the org), who can update (creators and leads only), who can delete (leads or admins only). Test each policy against the existing schema. Document policies in `docs/rls-policies.md`. This is the one item with a real aspirational deadline (~2 months until first customer). (4 hours) (audit only — migration plan in docs/rls-audit.md, execution deferred to pre-customer)
- [x] **Item 6** — Real Submitted by me page. Server component at `app/(dashboard)/dashboard/submitted/page.tsx` querying `requesterId = profile.id AND orgId = profile.orgId`, sorted by `updatedAt desc`. Shares the `PhaseFilter` client component — extracted from `my-requests/` to `components/requests/phase-filter.tsx` during this item so both Personal zone pages consume it (my-requests import updated). PM-tuned empty state: "All clear. Good time to review your impact data." per CLAUDE.md Part 8. `dev → build` label mapping in filtered empty state. V2 confirmation held — no migration needed. Shipped April 17 as commit 9135ece. (actual: ~45 min)
- [ ] **Item 7-build** — Real Reflections page. **DEFERRED TO POST-V1** per S1 outcome. Revisit after 3+ beta users have used Lane for 4+ weeks and indicated (or not) that they want a reflection surface. If revived, the implementation work remains as originally scoped (feed/list view, per-request attachment, designer-private visibility, AI summary for team signals). (~5 hours when revived, 0 hours in v1)

**Week 2 exit state:** Security layer in place. All three Personal zone placeholder pages are real pages with real queries. Lane is no longer "promises in the sidebar" — every click leads to a functional page.

---

## Week 3 — The big onboarding push

**Goal:** Ship the full onboarding flow. Close nav-spec execution. Add cost protection and multi-team support.

**Budget:** 15 hours. **Planned:** ~16 hours (1 hour over; onboarding is best done in one focused block).

- [x] **Item 8** — Full onboarding build. **Complete (April 17–18) — all user-facing onboarding work shipped across 7 phases.** Phase A (ad41297): schema — `workspace_members.onboarded_at` + `analytics_events` table + barrel export. Phase B (0f6f918): `lib/onboarding/detect-persona.ts` with owner/admin/pm precedence, `lib/analytics/track.ts` fire-and-forget helper. Phase C (f9ad77b): `(onboarding)` route group, minimal centered layout, server page with auth + persona detection, dashboard layout redirect via `needsOnboarding` flag (outside try/catch), `finishOnboarding` server action. Phase D (8c65dc8): Design Head 4-screen flow — Welcome → Phase model → Sample team → First action. Phase E+F (46d741f): Designer 2-screen (inviter attribution + waiting state) and PM 2-screen (inviter + intake foreshadowing → routes to `/dashboard/requests` where Item 4's classifier fires naturally as the payoff). Inviter name lookup added to server page. Phase G (6d38cef): `isSample` column on projects + profiles, `seedSampleTeam` action (Consumer app team, 3 fake profiles, 4 requests across all 4 phases), `clearSampleTeam` FK-safe delete, Screen 3 wiring. Phase H (3390072): `seenHints` jsonb column, `markHintSeen` + `getSeenHints` server actions, permanent hover tooltips on the 5 design stages, Prove first-time modal on Converge → Prove advance, extended empty states for Ideas and Commitments, vocabulary fixes (`"Idea Board"` → `"Ideas"`, `"Streams"` → `"Requests"`). Phase I (weekly digest first-time email) deferred to its own session. Phase J (analytics event wiring) deferred per April 16 parking lot decision — runs as a dedicated instrumentation pass after feature-complete. Reflection beat omitted per S1 outcome. (actual: ~7-8 hours across 2 sessions)
- [x] **Item 13** — Upstash Redis rate limiting for AI routes. **Complete (April 18) — gap-fill, not a build.** Audit revealed `@upstash/ratelimit` + `@upstash/redis` already installed, `lib/rate-limit.ts` already shipped with `checkAiRateLimit` (10 req/min per user, sliding window) + `checkGeneralRateLimit` (60 req/min), 9 AI routes already wrapped. Two gap routes wrapped: `app/api/requests/route.ts` (POST, runs triage) and `app/api/morning-briefing/route.ts` (on-demand generation). Cron routes verified: `app/api/cron/morning-briefing/route.ts` and `app/api/cron/alerts/route.ts` both guard via `Bearer ${CRON_SECRET}` — per-user rate limit is the wrong guard for server-to-server calls. All 11 AI routes now covered. Shipped April 18 as commit 006cf4c. (actual: ~15 min, vs 1.5 hour estimate)
- [x] **Item 15f** — Commitments view. **Complete (April 18) — faster than estimated.** Server component at `app/(dashboard)/dashboard/teams/[slug]/commitments/page.tsx`: auth → profile → team by slug (org-scoped) → find active cycle (`cycles` WHERE `projectId = team.id AND status = "active"`) → join `cycle_requests` to `requests` for committed work. Assignee resolution via `inArray` on `assignments.assigneeId` + profile name lookup, passed to `CompactRequestRow` as `firstAssigneeName` so leads can see who owns each committed Request. Cycle context header shows cycle name + formatted date range when active, "No active cycle" when not. Empty-state copy from Item 8 Phase H preserved verbatim — covers both "no cycle ever created" and "active cycle with zero commitments." Caught `assignments.assigneeId` vs spec's guess of `assignments.userId` before applying. Read-only scope; cycle creation/editing/completion is future work. Shipped April 18 as commit e080b07. (actual: ~45 min, vs 5 hour estimate)
- [x] **Item 10** — Zone 3 team sections verification. **Skipped (April 18) — single-team workspace.** Triggered item: activates once a second team exists. No artificial test team created just to satisfy the verification; it fires naturally the first time a real second team gets added. `components/nav/team-section.tsx` is the component to verify when triggered. Budget still applies: ~2 hours when the trigger fires.

**Week 3 exit state:** First-time users see a real onboarding flow with the intake check as the killer moment. Lane is cost-protected. The sidebar fully matches nav-spec.md. Multi-team works if tested.

---

## Re-scope notes — April 18

The Week 4 re-scope checkpoint arrived early. Items 12 (audit only), 13 (gap-fill), and 15f (Commitments) all landed faster than estimated, closing Weeks 1–3 with time to spare. Item 10 was skipped as a triggered item.

**Observation from Weeks 1–3:** estimates on list-view builds where infrastructure already existed came in 5–7× fast (Items 5, 6, 12, 13, 15f all shipped in 15–45 min vs 1.5–5 hour estimates). New-infrastructure builds hit estimate (Item 8 at 7 hours for the full onboarding stack). Item 14 is closer to the second pattern — new UI surfaces, not a list view on top of existing queries. Expect compression of 30–40% at most, not 5–7×.

**Decision:** Item 14 first, starting Week 4. It's the largest remaining piece of actual product, and it's the only surface that answers "why would a designer use Lane?" Without the 5-stage design flow, Lane is "good intake for PMs" — not a designer product. Command palette (Item 9) and "What's new" footer move to post-launch polish.

**What's moving:**
- **Week 4** was Item 9 + "What's new." Now Item 14 part 1.
- **Week 5** was Item 14 part 1. Now Item 14 part 2 + Item 15a/d/e start.
- **Week 6** was Item 14 part 2 + 15 start. Now 15 finish + perf start.
- **Week 7** was 15 finish + perf start. Now buffer + deferred items (Phase I, active-requests page).
- **Week 8** was buffer. Folded into Week 7.

If Item 14 compresses 30%, that's ~7 hours of slack across the plan — consider pulling Item 9 forward at end of Week 6 or sweeping the parking lot.

**Questions we asked (keep for future re-scopes):**
- Is the current "next 3 weeks" still the right bet, or has a customer conversation or demo surfaced something more urgent?
- Is the product demo-ready to show a real user of this persona?
- What broke in the last stretch that needs a cleanup session?
- What feels forced, what feels right?

---

## Week 4 — Design Phase UI part 1 (Item 14 part 1)

**Goal:** Ship the front half of the 5-stage design flow.

**Budget:** 15 hours. **Planned:** ~15 hours (new UI work; unlikely to compress like the list views did).

- [x] **Item 14 part 1** — **Complete (April 18).** Schema additions: 5 columns on `requests` (`sensingSummary`, `designFrameProblem`, `designFrameSuccessCriteria`, `designFrameConstraints`, `designFrameDivergence`), 1 column on `iterations` (`rationale`). `SensePanel` with auto-save-on-blur sensing summary textarea + reused existing `ContextBriefPanel` for the AI research sidebar (passed `existingBrief={null}` so it auto-fetches via `/api/requests/[id]/context-brief`, avoiding duplicate fetch/render logic). `FramePanel` with four structured fields (problem, success criteria, constraints, divergence) and PM's original description shown as read-only reference above the form. Diverge rationale wired end-to-end: `createIteration` extended with `rationale` param, new `updateIteration` server action using `withUserDb` pattern, rationale textarea added to the in-panel add-iteration form, click-to-edit rationale display on `IterationCard` with Save/Cancel. Stage routing in `design-phase-panel.tsx` renders the right panel per stage; Converge and Prove unchanged. Shipped across 4 commits (658f894 schema, f03c693 Sense + routing, d5f15cf Frame, 8cc00d4 Diverge rationale). [STRICT: after S1, Item 1, Item 11] (actual: ~3.5 hours vs 15-hour estimate — large compression from reusing `ContextBriefPanel` and existing iterations table/card/create-action infrastructure)

**Week 4 exit state:** Two of the five design stages are UI-complete. Designers can move a Request through Sense and Frame. Diverge has iteration-card scaffolding.

---

## Week 5 — Finish Design Phase UI + start Item 15 components

**Goal:** Finish the 5-stage design flow. Start two Item 15 components.

**Budget:** 15 hours. **Planned:** ~15 hours.

- [x] **Item 14 part 2** — **Complete (April 18) — shipped in same session as part 1.** Investigation found Prove was already ~90% built, Diverge comment threads already shipped (`iteration-comments.tsx`), and `handoff-brief.ts` already generates edge cases — shrinking real scope substantially. Built: (Stop 1) Converge panel with `decision_log_entries` schema, `addDecisionLogEntry`/`getDecisionLog` actions, Chosen/Killed toggle, completeness meter (count-based: resolved iterations vs total), and AI edge cases reusing the handoff-brief endpoint. (Stop 2) AI iteration summary: new `lib/ai/iteration-summary.ts` (neutral prompt, explicitly forbids ranking), new `/api/requests/[id]/iteration-summary` route with rate limiting, "AI summary" button in iterations header gated to 2+ iterations. (Stop 3) Prove polish: `engineering_feasibility` column on `requests`, `saveEngineeringFeasibility` action, non-blocking feasibility textarea in ProveGate with auto-save-on-blur, inline AI handoff checklist via existing handoff-brief endpoint rendering all 5 sections (design decisions, build sequence, open questions, edge cases, figma notes). Shipped across 3 commits (49e1e98, 0f9adc6, 9e1f377). (actual: ~2 hours vs 6-hour estimate — compression from ProveGate already existing, iteration-comments already wired, handoff-brief covering two use cases)
- [x] **Item 15a** — **Complete (April 18).** Enhanced `lib/ai/handoff-brief.ts` to synthesize the full Item 14 design journey instead of just PM input + comments. Input expanded with `sensingSummary`, `designFrame` (problem/successCriteria/constraints/divergence), `iterations[]` (with rationale), `decisionLog[]`, and `engineeringFeasibility`. New `accessibilityGaps: string[]` output field covering WCAG concerns (screen reader, keyboard nav, color contrast, motion, touch targets). Prompt explicitly tells the model "the designer's own sensing, framing, iterations, and decisions are more authoritative than the PM's initial description" and to fold engineering feasibility constraints into build sequence and open questions. Route ([handoff-brief/route.ts](app/api/requests/[id]/handoff-brief/route.ts)) now queries `iterations` and `decisionLogEntries` tables, passes all Item 14 data to the AI function, and caches `accessibility_gaps` jsonb column (notNull default `[]`, so pre-existing cached rows degrade gracefully — no DELETE needed). ProveGate inline handoff display renders the accessibility gaps section with a ♿ prefix. Shipped as commit 9f8a755. (actual: ~30 min vs 4-hour estimate — compression from the AI function being a single-file edit and the route needing only additive changes)
- [x] **Item 15d** — **Complete (April 18) — audit revealed nudge infrastructure was already built; real work was a compliance fix.** Pre-audit state: `proactiveAlerts` schema + `stall_nudge` detection (designer-private, 5+ days no activity) + AI copy generation + hourly cron + inbox/notifications bell UI + manual lead-initiated `/api/requests/[id]/nudge` route all shipped previously. Nudge tone in the manual route already matched CLAUDE.md Part 8 verbatim (`"Hey — it's been a while since \"${title}\" got some attention. Everything okay?"`). **Problem found:** `stall_escalation` alert type was live — `detectStallEscalations` in `lib/alerts/detect.ts` queried stale `stall_nudge` alerts (2+ days old, no movement) and created Design-Head-facing alerts with `recipientId: lead.id`. Invoked by the hourly cron at `app/api/cron/alerts/route.ts:42`. Surfaced to leads' morning briefings via `inArray(proactiveAlerts.type, ["stall_escalation", "signoff_overdue"])`. Directly violated CLAUDE.md Part 1: "❌ NEVER: Automatic escalation of designer silence to leads." **Removal (commit c884eda):** deleted `detectStallEscalations` function + `ESCALATION_THRESHOLD_DAYS` constant, removed import/destructure from cron, removed stall_escalation from morning-briefing filter and AI TYPE_CONTEXT, narrowed type unions in `AlertCandidate`/`AlertInput`/`AlertItem`. Enum value retained in schema with `DEPRECATED` comment (Drizzle can't drop enum values without a dedicated migration). 6 files, -83 net lines. Grep across lib/app/components confirms zero remaining references. (actual: ~30 min vs 4-hour estimate — compression because the feature was already built; the work was an audit + compliance fix, not a new build)
- [x] **Item 15e** — **Complete (April 18) — full 3-hour scope shipped in one pass instead of the planned 1h + 2h split.** Six concrete changes to `lib/ai/morning-briefing.ts` (shipped as commit ef1744b, +228/-9): (1) **Developer role bug fix** — `role === "designer" || "developer"` was routing devs through `gatherDesignerContext` which queries `designerOwnerId`, giving developers entirely wrong data. Split into dedicated `gatherDeveloperContext` that queries `devOwnerId`, returns kanban state counts (todo/in_progress/in_review/qa/done), overnight comments on owned requests, and unreviewed post-handoff Figma drifts. Added a dev-specific context block in `generateMorningBriefing`. (2) **Empty-queue edge case** — prompt line changed from "generate a motivating observation" (which risked Claude fabricating items) to explicit instruction: "acknowledge this plainly... Do NOT fabricate items or produce saccharine filler." (3) **`KF6` stray prefix removed** from both occurrences in designer and PM context blocks — now plain `PROACTIVE ALERTS FOR YOU`. (4) **Item 14 data threaded into designer context** (same pattern as 15a) — designer's active-requests display now surfaces `progress: [✓sense -frame -feasibility]` per request plus `iterations: N` and `decisions: N` counts from new aggregate queries against `iterations` and `decision_log_entries` tables. Prompt tells the model these indicate Diverge/Converge activity. (5) **PM calibration signal** from `impact_records` — new `recentCalibrations` query joining `impactRecords` with `requests` for this PM's last 30 days, surfacing `predictedValue` vs `actualValue` with `variancePercent` numeric; prompt frames it as learning loop ("your last prediction was close") not performance scoring. (6) **Lead appetite signal** — expanded `allOrgRequests` select to include `deadlineAt`, computed `appetiteExceeded` (past deadline) and `appetiteApproaching` (within 3 days) buckets for design-phase requests; prompt enforces CLAUDE.md Part 8 vocabulary ("appetite"/"exceeded", not "deadline"/"overdue"). (actual: ~1 hour vs 3-hour estimate — compression from the file already being well-structured; changes were additive to existing role-specific gatherers)

**Week 5 exit state:** The entire 5-stage design flow is UI-complete. Lane has a working design phase experience, which is the core of what the product is *for*. Three Item 15 components shipped (15a handoff brief, 15d nudge compliance, 15e morning briefing).

---

## Week 6 — Remaining Item 15 components and performance

**Goal:** Finish Item 15 components. Start performance pass.

**Budget:** 15 hours. **Planned:** ~15 hours.

- [x] **Item 15b** — **Complete (April 18).** Five refinements to the impact logging flow + a code-health cleanup (shipped as commit 29cf8d7, 4 files, +272/-78). (1) **Notes field** — `impact_records.notes` column existed but had no UI; added a Textarea in `track-phase-panel.tsx` with placeholder copy pointing at the kind of context that makes retrospectives better ("competitor launched same week", "holiday slowdown"). POST route already accepted the param — pure UI wiring. (2) **Editable actual** — track panel previously saved once and locked; added `editing` state + Edit link + Save-changes/Cancel flow so PMs can refine values as more data comes in. (3) **Shared variance helper** — new `lib/impact/variance.ts` exports `LABEL_CONFIG`, `classifyVariance(percent)`, `variancePillStyle(percent)`, `formatVariance(percent)`, `VarianceLabel` type. Both `track-phase-panel.tsx` and `components/insights/pm-calibration.tsx` now import from it; removed ~40 lines of duplicated logic across the two files. (4) **Warmer labels per CLAUDE.md Part 5 "calibration not scoring"** — `LABEL_CONFIG` now returns "Close to the mark" / "Aimed high" / "Aimed low" instead of the previous clinical "Well-calibrated" / "Over-optimistic" / "Under-optimistic". Both surfaces updated consistently via the shared helper. (5) **Prior-calibration hint** — new `GET /api/pm/prior-calibrations?excludeRequestId={id}` endpoint queries the current user's last 3 impact_records joined with requests for titles; dashed-border box above the input shows "Your recent predictions — for reference" with predicted vs actual vs variance%. Feeds the PM learning loop: they see their own calibration history right where the next prediction gets logged. (6) **`measuredAt` display** — track panel fetches existing impact record on mount and surfaces "Measured N days ago" below the accuracy block. Also cleaned up `initialVariancePercent: null` hardcoding in DetailDock (panel now fetches real variance itself). (actual: ~1 hour vs 3-hour estimate — compression from the API route already handling notes + updates; work was mostly UI surfacing + shared helper extraction)
- [x] **Item 15c** — **Complete (April 18) — audit revealed the cron was already scheduled and the generator was already comprehensive; the real work was durability + delivery.** Pre-audit state: `lib/digest.ts` (362 lines) generates `{ digest, pmCoaching }` with headline/shippedThisWeek/teamHealth/standout/recommendations plus per-PM coaching notes, throughput trends, stall detection, PM calibration labels. `weeklyDigests` schema existed. A cron route at `/api/insights/digest/generate` already had `CRON_SECRET` auth + per-org try/catch + upsert, and `vercel.json` already scheduled it for Friday 9am UTC. **Gaps that made the "biggest moat" hollow:** UNIQUE on `orgId` meant each Friday overwrote the previous week (no historical archive); no retry on Claude failures (transient Anthropic hiccup = that org gets no digest); generated-but-not-delivered (nobody saw the digest unless they navigated to it); inconsistent path (`/insights/digest/generate` vs sibling crons under `/api/cron/*`). **Shipped (commit f87c157, 8 files, +276/-59):** (1) **Historical archive** — added `weekStartDate: text` column to `weekly_digests`, removed unique on `orgId`, added composite unique on `(orgId, weekStartDate)`, switched from `onConflictDoUpdate` to `onConflictDoNothing`. Each Friday now produces a new durable row. (2) **Bounded retry** — `withRetry(fn, 3)` helper with exponential backoff (1s, 2s, 4s) wrapping the `generateDigestForOrg` call. (3) **In-app notification** — added `"weekly_digest"` to `notificationTypeEnum` + TS union in `lib/notifications.ts`; cron queries all leads/admins per org and inserts a `type: "weekly_digest"` notification per recipient with the headline as title, first 160 chars of teamHealth as body, and `/dashboard/insights` as url. (4) **Email delivery** — new `weeklyDigestEmail` template in `lib/email/templates.ts` with headline, shippedThisWeek, teamHealth, standout, recommendations list, and an "Open in Lane" button; new `sendWeeklyDigestEmail` wrapper in `lib/email/index.ts` (silent no-op when `RESEND_API_KEY` unset, matching the existing email pattern). Cron fans out emails to every lead/admin with an email address. (5) **Item 8 Phase I absorbed** — template has a first-digest preamble: "Welcome to your first Lane weekly digest..." — detected by checking whether any prior `weeklyDigests` row exists for the org before this week's insert. First-digest also changes the subject to "Your first Lane weekly digest is here" instead of "Lane weekly digest: {headline}". (6) **Path consistency** — moved cron from `/api/insights/digest/generate` to `/api/cron/weekly-digest`, updated `vercel.json` (schedule unchanged, Friday 9am UTC). Old route file `git rm`'d. (actual: ~1.5 hours vs 6-hour estimate — compression because the generator + schedule already existed; this was durability + delivery work)
- [x] **Item 15g** — **Complete (April 18) — full 7-hour scope shipped in one pass instead of 4+3 split.** Five steps (each commit listed). (Step 1, commit 968d5d1) **ESLint fixes — build unblocked.** `npm run build` was failing on 4 `no-restricted-syntax` errors (raw `<button>` usage): one I introduced in Item 14 part 1 Stop 4 on `iteration-card.tsx` (missed because stops only ran `tsc`, not `lint`), three pre-existing in `onboarding-flow.tsx` from Item 8 Phase D. All converted to `<Button variant="ghost">` or `<Button variant="link">` with className overrides. **CI has been silently broken since Item 14 landed** — worth noting. (Step 2, commit 2b1b34e) **11 indexes on hot foreign-key columns.** Pre-audit: only 6 matches across schema, all composite unique constraints or analytics-events indexes — zero standard indexes on hot paths. Added: `requests.org_id`, `requests.designer_owner_id`, `requests.requester_id`, `requests.project_id`, `requests.phase`, `iterations.request_id`, `decision_log_entries.request_id`, `assignments.assignee_id`, `assignments.request_id`, `comments.request_id`, `notifications.recipient_id`. Covers every dashboard query, My requests, Submitted by me, team pages, design phase panel, converge panel, detail-dock comments, notifications bell, inbox. **Biggest perf win** — replaces sequential scans with index scans on every page load. (Step 3, commit f16a2da) **Dashboard assignment query scoping.** `allAssignments` was pulling every assignment for every org request (500+ rows unbounded) for two consumers with different needs. Split: `teamCountRows` (GROUP BY aggregate for right-panel team workload, ~10-20 rows) + `focusAssignments` (scoped to focus-section request IDs only, ~50-150 rows) in a new Batch 3 after `buildFocusSections` is known. Preserves semantics — `teamCounts` still reflects org-wide workload, `assigneesByRequest` only loads the visible slice. (Step 4a + 4b, commit d3109e9) **Alert detection batching + detail-dock memoization.** Detect.ts: `detectStallNudges` went from O(4×N) sequential (4 awaits per request × N requests) to O(4) via `inArray` batch queries + `max()` GROUP BY aggregates + in-memory joining. For a 50-request org, 200 serial DB hops → 4. `detectSignoffOverdue` similarly O(2N+K) → O(3). Parking lot noted "production pool exhaustion" — batching avoids that where `Promise.all` concurrency would hammer it. Removed unused `getLastActivityAt` helper. Detail-dock.tsx went from 0 to 6 `useMemo`/`useCallback`: stable references for `contextRequest` (array search), `request` (unified source), `close` handler, `phaseMeta` (bundled label derivations), `devQuestionCount` (filter), `designPhaseRequestData` + `editRequestPayload` (inline object literals that were creating new references every render and blocking child memoization). All hooks moved ahead of early returns for rules-of-hooks compliance. **Bundle size unchanged** (102kB shared chunk) — memoization fixes runtime re-renders, not code size. (actual: ~2 hours vs 7-hour estimate — compression from the schema audit being fast once the index pattern was clear, and the detail-dock rewrite being a single-file Write)

**Week 6 exit state:** All Item 15 components shipped except finishing touches on performance.

---

## Week 7 — Buffer + hardening

**Goal:** Clean up deferred items. Harden for first customer onboarding. No GTM work this week — sequencing discipline: build complete → harden → ship to production → then GTM, not parallel.

**Budget:** 15 hours. **Planned:** ~8 hours build + 7 hours slack.

- [x] **active-requests page build** — **Complete (April 18).** Replaced the 22-line placeholder at `app/(dashboard)/dashboard/teams/[slug]/active-requests/page.tsx` with a real team-scoped query: `requests WHERE orgId = profile.orgId AND projectId = team.id AND phase IN ('predesign', 'design')`, ordered by `updatedAt desc`. Same structural pattern as Commitments (Item 15f) — auth → profile → team lookup by slug → scoped query → first-assignee name resolution via `allAssignments` ordered by `assignedAt asc` → `CompactRequestRow` list. Shared `PhaseFilter` component plugged in; URL `?phase=predesign|design` respected, Build/Track clicks gracefully ignored (filter UI shows "All" highlighted while base query still returns active-phase work). Empty state differentiated: "queue is clear" narrative when unfiltered, "No active requests in Predesign/Design for this team" when filtered to a specific phase with no results. `ActivePhase` type narrowed to `"predesign" | "design"` for Drizzle's enum-column type check. Shipped as commit acad4c0. **Zero placeholder pages remain in the app** — every sidebar route now resolves to a real query. (actual: ~30 min vs 1-hour estimate)
- [x] **Item 15h** — (ESLint build fix + pool fix)
- [x] **Pre-customer security sweep** — (Complete — Dependabot merged, API key fixed, pool fix shipped, port 6543 in Vercel, dev/staging Supabase projects exist (lane dev, lane app), production schema synced via SQL, cleanup script written. Note (April 19): dev environment .env.local was misconfigured against the dev project — real bug surfaced during pre-A1 cleanup, see parking lot. The split itself was real; the .env.local wiring was broken.)

**Week 7 exit state:** ✅ **Achieved (April 19).** Lane is production-ready. All deferred build items shipped. Security sweep done. Zero placeholder pages. GTM remains gated — work parking lot + deferred + post-launch items first.

---

## Week 7.5 — User flow foundation (P0 BLOCKER)

**Goal:** Ship enterprise-grade signup-to-workspace flow per `docs/user-flows-spec.md` v2. Close the P0 bug (workspace_members never populated) and establish the auth/membership foundation Lane will use for every future feature.

**Budget:** ~50-54 hours at 15 hrs/week = 4 calendar weeks. Splits into four sub-weeks (7.5a-d) with distinct goals. Build order is tests-parallel per WORKING-RULES.md — no step is complete until its test is written and passing.

**Why this is P0:** The missing workspace_members row discovered April 19 exposed a systemic gap. Onboarding persona detection, role enforcement, org-scoped queries, and every access-control decision depend on workspace_members. Nothing currently creates this row. This blocks every user. The full scope also includes audit logging, idempotent RPC patterns, rate limiting, and ownership transfer — all enterprise foundation pieces that are cheap to build now and expensive to retrofit later.

**Spec session completed:** April 19. Output: `docs/user-flows-spec.md` v2. Do not re-litigate the spec inside this roadmap — if scope needs to change, update the spec first.

### Week 7.5a — Test harnesses + database foundation (~17 hours)

Phase A — harnesses first, prerequisite for everything below:

- [x] **A1.** pg-tap harness setup — install extension, wire `npm run test:sql`, GitHub Actions CI step, one trivial assertion smoke test. (~3 hours estimate, actual ~1.5 hours — under budget; pre-A1 cleanup absorbed most overhead, see commits e1db32e + 0d843cf)
- [x] **A2a.** Playwright harness setup — auth fixtures (Supabase admin API + storageState scaffolding), smoke test (homepage status + /login renders), CI-safe env-gating in globalSetup. (~45 min actual vs 4 hour spec estimate for full A2; massive compression because existing playwright.config.ts + CI e2e job already in place from prior work)
- [x] **A2b.** Test email capture harness — dev_only_sent_emails.sql migration, lib/email capture branch with module-load production safety check, e2e/helpers/email.ts test helpers. (~2-3 hours estimated, actual ~1.25 hours — under budget; existing lib/email chokepoint pattern + A1's dev_only migration template compressed the work)
- [x] **A3.** Test fixtures — `supabase/test-seed.sql` creates deterministic baseline (1 workspace + 4 profiles + 4 workspace_members + 1 pending invite) used by both harnesses. Targets current `db/schema/` state; Phase B migrations 0011-0014 will append new INSERTs in B1 follow-up. (~30 min actual vs 1h estimate)

Phase B — schema + RPCs, each migration shipped with its pg-tap test:

- [x] **B1.** Migration 0011 — workspace_members population + `profiles.id → auth.users(id)` FK + `invites.accepted_by` column + `audit_log` table + `waitlist_approvals` table + idempotent bootstrap RPC + idempotent accept RPC. Parallel: `test/sql/test_migration_0011.sql` (19 assertions, all passing on lane dev). (actual: ~10 hours, includes STOP F bug discovery + 0012 fix-up). Shipped across 3 commits: 9f3fbca (feat 0011) → 1724920 (fix 0012) → cc8e18f (docs sync). Applied to lane dev only; lane app apply deferred to separate production session.
- [ ] **B2.** Migration 0013 — invite team scoping + unique pending invite index + pg-tap. (~1.25 hours)
- [ ] **B3.** Migration 0014 — `transfer_workspace_ownership` RPC + pg-tap. (~2 hours)
- [ ] **B4.** Migration 0015 — `profiles.left_at` + orphaned workspace admin view + pg-tap. (~1 hour)

**7.5a exit state:** Database layer is correct and proven. Every later phase can assume the DB does the right thing.

### Week 7.5b — Server actions (~8 hours)

Phase C — each server action shipped with its Vitest integration test:

- [ ] **C1.** Update `app/actions/auth.ts` — idempotent signup + recovery path per spec §5.6. Parallel integration tests. (~2.5 hours)
- [ ] **C2.** Update `app/actions/invites.ts` — team payload + idempotent accept. Parallel integration tests. (~2 hours)
- [ ] **C3.** New `app/actions/ownership.ts` — `transferOwnership`. Parallel integration tests. (~1.5 hours)
- [ ] **C4.** New `app/actions/members.ts` — `leaveWorkspace`, `removeMember`. Parallel integration tests. (~2 hours)

**7.5b exit state:** Action layer is correct and proven. The only remaining risk surface is UI.

### Week 7.5c — UI + supporting infrastructure (~20 hours)

Phase D — each UI surface shipped with its Playwright flow test:

- [ ] **D1.** `/settings/members` page + Playwright. (~4 hours)
- [ ] **D2.** `/settings/workspace` page (ownership transfer) + Playwright. (~2.5 hours)
- [ ] **D3.** `/settings/profile` page (leave workspace) + Playwright. (~1.75 hours)
- [ ] **D4.** `/invite/accept` page (4 paths: new user, existing user blocked, email mismatch, expired) + Playwright. (~3.5 hours)
- [ ] **D5.** `/signup` page (idempotent recovery UI) + Playwright. (~2.5 hours)

Phase E — supporting infrastructure:

- [ ] **E1.** Resend templates (5 new: invite, ownership_transferred, member_removed, auto_promoted_to_owner, signup_notification) + smoke test. (~1.75 hours)
- [ ] **E2.** Cron `/api/cron/cleanup-invites` — delete invites where `expires_at < now() - interval '30 days'` + test. (~1 hour)
- [ ] **E3.** Cron `/api/cron/resolve-orphans` — auto-promote earliest-joined admin in owner-less workspaces + test. (~2 hours)
- [ ] **E4.** Rate limiting — signup, invite-create, invite-accept endpoints per spec §4.8 + test. (~1.25 hours)

**7.5c exit state:** Every user-facing surface in the spec is built and tested. Ready for manual QA.

### Week 7.5d — Verification + ship (~5-8 hours)

Phase F — production rollout:

- [ ] **F1.** Manual QA against the 10 flows in spec §5-§11 on dev environment. Checklist-driven. Log every issue. (~2 hours)
- [ ] **F2.** Fix any issues found in F1. If >2 issues, stop and retro — the spec or build missed a case. (~1-4 hours, budget generously)
- [ ] **F3.** Production deploy. Immediately run migration 0011 invariant verification queries per spec §4.1.3. If any return rows, roll back. (~1 hour)
- [ ] **F4.** Production smoke test — sign up with test email, invite second test email, accept, transfer ownership, leave. (~30 min)
- [ ] **F5.** Update ROADMAP.md — mark Week 7.5 complete, unblock Week 8. Update Next session pointer. (~30 min)

Parallel housekeeping (do any time during 7.5a-c, before 7.5d):

- [ ] Update `docs/onboarding-spec.md` §2 — remove stale "waitlist for first 90 days" claim; reference the new open-with-auto-approve default. (~15 min)
- [ ] Update `docs/WORKING-RULES.md` — add idempotent RPC pattern as Lane's standard for auth bootstrap. (~15 min)

**Week 7.5 exit state:** Lane has a complete, tested, production-deployed signup-to-workspace foundation. Every path from spec §5-§11 works end-to-end. Audit log captures all state-changing events. Rate limiting protects auth endpoints. Infrastructure for waitlist gating is in place (defaulted off via env flag). Week 8 GTM unblocked.

[STRICT: blocks Week 8 GTM. No landing page until users can actually sign up and land in a working workspace.]

### Risk register (watch during build)

From spec §15.2:

- **Supabase Auth quirks on idempotent retry** — `auth.signUp` behavior when called twice for the same email varies by SDK version. Budget 1-2 hours in C1.
- **RLS policies for `audit_log`** — append-only is fiddly. Budget 1 extra hour in B1.
- **Playwright + Mailhog in CI** — email interception can be flaky. Budget 1-2 extra hours in A2 if container networking causes issues.
- **Production backfill** — pre-check with `SELECT org_id, count(*) FROM profiles WHERE role IN ('lead','admin') GROUP BY org_id HAVING count(*) > 1;` before deploy. At current scale this should return 0 rows; if not, the collapse-multi-owner step may surface unexpected conflicts.

---

## Week 8 — GTM launch

**Goal:** Ship public surface. Start collecting real leads.

**Budget:** 15 hours. **Planned:** ~15 hours GTM prep.

**[STRICT: after Week 7 exit state AND Week 7.5d F5 checkmark]** Week 7 must be production-ready AND Week 7.5's full four-phase build must be shipped, QA'd, and deployed to production before any Week 8 item starts. The ordering is deliberate — shipping GTM before users can actually sign up (and sign up correctly, per the enterprise-grade foundation) risks a landing page that leads nowhere. Do not start Week 8 just because Week 7.5a or 7.5b landed — the gate is F5.

- [ ] **Landing page live** — Ship the public landing page with direct signup CTA ("Start your workspace" → `/signup`). Signup is open with auto-approval per user-flows-spec §5.2. Founder gets notification email on every new signup for manual follow-up. Copy: problem statement, 4-phase model visual, "Built for design teams" positioning. No feature screenshots yet — philosophy-first.
- [ ] **Founder notification pipeline** — Every signup triggers a Resend email to you with the signup details (email, workspace name, timestamp). You reach out personally within 24 hours of each signup for the first 50 users. If signup volume spikes or abuse appears, flip `LANE_SIGNUP_AUTO_APPROVE=false` to gate — infrastructure is already in place per user-flows-spec §4.7.
- [ ] **Demo recording** — 3-minute Loom showing: onboarding flow → intake check (the killer beat) → Request moving through Sense/Frame/Diverge → Converge Decision Log → Prove sign-offs → weekly digest. For sharing in DMs after "DM me CHAOS" leads engage.
- [ ] **LinkedIn launch post** — First public announcement. Frame: "I built the tool I wished existed as a Head of Design. Here's what it does differently." Link to waitlist. No feature list — story-first.
- [ ] **Chaos Calculator update** — Update the lead magnet spreadsheet to reference Lane by name and link to the waitlist. The calculator quantifies the problem; Lane is the solution.

**Week 8 exit state:** Landing page is live. Waitlist is collecting leads. Demo video exists for 1:1 outreach. First LinkedIn post is published.

---

## Post-launch GTM (Weeks 9+)

Not sequenced week-by-week yet. Sequence after Week 8 ships based on what's working.

### Content engine
- [ ] **84-day content calendar execution** — LinkedIn (primary) + Twitter/X (co-primary) + Reddit (supplementary). ~100 min/day budgeted. Write-once-publish-twice system.
- [ ] **DesignOps Playbook** — 10-page Word doc lead magnet. "How to run a design team without surveillance." Captures Lane's philosophy; naturally leads to the product.
- [ ] **Behavior-Based Design Pods framework post** — Publish the proprietary framework. Position as thought leadership → "Lane implements this."
- [ ] **Case study from first beta user** — After 4+ weeks of usage, document their before/after. The weekly digest comparison is the money shot.

### Outreach
- [ ] **"DM me CHAOS" campaign scaling** — Expand beyond LinkedIn. Track conversion: DM → Chaos Calculator → waitlist → invite → active user.
- [ ] **Design leader 1:1 outreach** — Identify 20 design leaders at startups/growth-stage companies (Indian market first). Personalized Loom + waitlist link.
- [ ] **Community seeding** — Post in Designer Hangout, ADPList communities, Indian design Slack groups. Not selling — sharing the philosophy + Chaos Calculator.

### Product-led signals to watch
- [ ] **5 design leaders using 3x/week over 4 weeks** — This is real PMF per the validation gate defined in CLAUDE.md. Stop validating and start scaling when this triggers.
- [ ] **Save-to-reaction ratio on LinkedIn** — The standout signal from the first post. If saves > 5% of reactions, the content is reference-worthy.
- [ ] **Weekly digest open rate** — If leads keep opening the Friday digest, the moat is working.
- [ ] **Intake check reframe rate** — If most flagged submissions get reframed (not bypassed), the philosophy is landing.

---

## Deferred — post-launch

Items that were on the pre-launch roadmap but moved to post-launch during the April 18 re-scope. Distinct from the parking lot: these have concrete scope and estimates; they're just not blocking the path to demo-ready.

- **Item 9** — Command palette rebuild + pgvector infrastructure. ~14 hours. Install `cmdk`, build actions registry (new request, new idea, jump to team, open radar, etc.), wire semantic search for Request title lookup. Per V4 findings, also includes implementing pgvector extension in Supabase, embedding column on requests, embedding generation on Request creation, similarity search query. Re-add `⌘K` chord hint to sidebar search button. Polish, not differentiator. Revisit when Lane has a real user feeling the gap.
- **"What's new" footer build** — Implementation per S2 spec in `docs/nav-spec.md`. Markdown parser for CHANGELOG.md, expandable component for sidebar footer, default-collapsed UI, last 5 entries. ~1.5 hours. Nice-to-have; nobody will notice it's missing pre-launch.

---

## Strict dependencies at a glance

This is the dependency graph that made the sequencing decisions above. If you re-sequence, respect these.

- V1 → Item 11
- V2 → Item 6
- AI foundation verification → Item 4
- V3 → Item 4 → Item 8 → Item 14
- V4 → Item 9
- S1 → Item 7-build, Item 8, Item 14
- S2 → What's new build
- Item 1 → Item 8, Item 14
- Item 11 → Item 8


Read as: "V1 must be done before Item 11 can start." And so on.

---

## What's explicitly NOT on this roadmap

Things we've decided against or deferred indefinitely. Do not add these back without explicit discussion.

- **Schema rename** of `validation_signoffs` table to `proofs` or similar. Formally cancelled April 13. Rationale: "sign-off" is the canonical act word per the vocabulary lock in CLAUDE.md; the schema is already coherent; rename cost outweighs benefit. Do not re-open without explicit discussion.
- **API route rename** of `app/api/requests/[id]/validate/route.ts` to something Prove-named. Internal endpoint, not user-facing, no benefit to renaming. Stays.
- **Historical plan document rewrites** under `db/lane docs/docs/superpowers/`. These are historical artifacts and should not be updated to new vocabulary. Leave them as-is.
- **Slack integration, Figma plugin, mobile app, Linear integration, detailed Figma diffs, version comparison tool** — per CLAUDE.md Part 18. Defer 6+ months or never.
- **Individual utilization %, activity frequency tracking, designer speed rankings, last-active timestamps** — per CLAUDE.md anti-surveillance principles. NEVER build these.

---

## Tier 4 work not in this roadmap

The "Week 5-12" items from CLAUDE.md Part 17 are partially folded into this roadmap (as Item 14 and the Item 15 components). The rest of CLAUDE.md Part 17 — RLS, Redis rate limiting — is folded into weeks 2-3.

If there's anything in CLAUDE.md Part 17 that you believe isn't in this roadmap, flag it during the week 4 re-scope and we'll decide whether to add it.

---

## How to update this file

- **When you finish an item:** change `[ ]` to `[x]` and append actual hours in parentheses, e.g. `[x] Item 4 (5.5 hours, ran over by 30 min due to classifier prompt tuning)`
- **When a week slips:** move unfinished items to the next week, update the "Planned" vs. "Budget" hours
- **When you re-scope at week 4:** add a "Re-scope notes — April [date]" section and update the following weeks
- **When something breaks and needs a fix:** add it as a new item in the current week with `[FIX]` prefix

This file is a living plan. The commit history of this file is the story of how Lane actually got built.

---

*Last updated: April 22, 2026 — Week 7.5a Phase A complete (A1, A2a, A2b, A3) + Phase B step B1 shipped (migrations 0011 + 0012, pushed to origin). Next: B2 (migration 0013, invite team scoping).*

---

## Session log — April 14 warmup block

**Duration:** ~4.5 hours | **Commits:** 6

| Commit | Description |
|--------|-------------|
| cc2394a | fix: update AI model ID from deprecated `claude-3-5-haiku-20241022` to `claude-haiku-4-5-20251001` across 17 files |
| 63e7d6b | fix: Zod 4 + Anthropic structured output schema fix in `lib/ai/triage.ts` with runtime clamping |
| f933952 | docs: add AI foundation verification as strict blocker for Item 4 |
| 36b428f | docs: V4 closeout, pgvector findings, CLAUDE.md Part 9.3 update |
| 31cdcc9 | fix: rename teams/[slug]/streams route to active-requests, align nav keys |
| 55fc381 | chore: align codebase vocabulary to CLAUDE.md spec |

**Verifications completed:** V1 (migration 0002), V2 (requester_id exists), V3 (Anthropic API end-to-end), V4 (pgvector not installed)

**Bugs caught and fixed:**
1. Dead Anthropic API key → replaced
2. Deprecated model ID `claude-3-5-haiku-20241022` → renamed to `claude-haiku-4-5-20251001` in 17 files
3. Zod 4 `.int().min().max()` emits JSON Schema properties Anthropic rejects (vercel/ai#13355) → runtime clamping pattern
4. Seed-only AI data — triage had never run live → now verified working

**Time breakdown:** V1+V2 10 min | V3 3 hours (expanded) | V4 15 min | Item 3 40 min | roadmap updates 20 min

**Remaining Week 1 items:** S1, S2, Item 1, AI foundation verification, Item 4, Item 5, Item 11

---

### Session log — April 15 AI foundation audit

**Commits landed (3, in order):**
1. prediction-confidence schema fix: dropped `.int().min(0).max(100)`, added runtime clamp
2. idea-validator schema fix: dropped `.int().min(1).max(10)` from 4 fields, added runtime clamps
3. morning-briefing schema fix: dropped `.min(1).max(5)` from items array, added runtime truncate/throw
4. Silent failure refactor: idea-validator try/catch/rethrow, requests route triageStatus field, ideas validate route 500 with body, 9 UI component console.error additions

**Verifications completed:** All 8 AI features in `lib/ai/` confirmed working end-to-end against real Anthropic API. None of the runtime clamps fired — model returns clean output natively. Clamps are insurance against future drift.

**Architecture discoveries:**
- Request detail UI uses DetailDock side panel (global, `?dock={id}` URL param), not a dedicated `[id]/page.tsx` route
- Prediction confidence panel auto-fires via useEffect on mount, gated by `optimisticStage === "shape" || "bet"` + impactMetric + impactPrediction
- Claude Code host shell pollutes ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL — future tsx/node scripts need `unset` prefix

**Time spent:** ~3.5 hours (Phase 1: 50 min, Phase 2: 50 min, Phase 3: 90 min, Phase 4: 60 min)

---

## Parking lot

Items that come up mid-execution but aren't yet sequenced. Add anything here the moment you think of it — don't hold it in your head, don't put it in a chat, don't stuff it into the current week.

**Rules for the parking lot:**
- Anything goes. Feature ideas, bug reports, customer feedback, refactoring opportunities, "wouldn't it be nice if..." thoughts. All of it.
- Each item is one line, with a date. Format: `- [YYYY-MM-DD] description`
- Do not add effort estimates here. Estimates happen when an item leaves the parking lot and gets sequenced.
- Do not prioritize. The parking lot is unsorted on purpose.
- [2026-04-14] New Request creation has no sidebar shortcut. Currently only accessible via /dashboard/requests page header action. During V3 testing, I expected a button in the sidebar footer and was surprised not to find one. Consider: (a) adding a "New request" button to the sidebar footer alongside "What's new," (b) adding a keyboard shortcut like `N R` alongside the existing `N I` for new idea, or (c) both. Small feature, high discoverability value. Decide during week 4 re-scope or earlier if it keeps coming up.
- [2026-04-14] Replace LLM-based duplicate detection with real pgvector similarity search. Current implementation (per V4 findings) uses Claude's comparison inside the triage prompt — works fine at small scale, but cost scales linearly with Request database size and accuracy is capped by what can fit in the prompt context. Trigger for replacement: when Request database hits ~500 rows, or when triage latency/cost becomes noticeable. Probably shares infrastructure with Item 9's pgvector implementation, so these could land together. Not urgent but worth tracking.
- [2026-04-15] ~~**Claude Code shell environment pollution.**~~ **Resolved April 19.** Added `dotenv-cli` as devDep and a `npm run script` entry in `package.json`: `dotenv -e .env.local -o -- npx tsx`. The `-o` flag forces `.env.local` values to override pre-existing shell env vars (default dotenv behavior keeps existing vars). Usage: `npm run script -- scripts/my-script.ts`. Next.js and Drizzle Kit already auto-load `.env.local`; this closes the last gap for ad-hoc tsx/node scripts. `ANTHROPIC_API_KEY` now loads from `.env.local` correctly. `ANTHROPIC_BASE_URL` pollution remains unresolved but is harmless for `@ai-sdk/anthropic` (SDK handles `/v1` routing internally). If a future script needs the explicit base URL, add `-v ANTHROPIC_BASE_URL=https://api.anthropic.com/v1` to the script entry.
- [2026-04-15] **Create separate Supabase project for dev/staging.** Currently local dev and production share the same hosted Supabase project. Fine pre-launch with zero customers. Must separate before onboarding first beta tester. Budget: 1-2 hours including env var updates.
- [2026-04-15] **Phase 3 test data cleanup.** AI verification testing left ~6-10 test rows across requests, predictionConfidence, and possibly other tables. Clean up before showing prod to anyone. Quick query: delete where title starts with "Phase 3 test" or similar.
- [2026-04-15] **Error UI for AI panel failures.** Phase 4 Tier 3 added console.error logging to 9 UI components but deferred error UI (what the user sees when AI fails). Needs design decisions: error text, style, retry button. Scope: 9 components, each needs a small inline error state. Budget: 2-3 hours including design.
- [2026-04-14] **Production Anthropic API key 401 in Vercel.** Added ANTHROPIC_API_KEY to Vercel production env vars and redeployed during April 14 session. Production still returns `invalid x-api-key` 401 on triage calls. Cause unclear — possible env var value problem, environment scope issue, or redeploy timing. Needs fresh diagnosis: verify key value starts with `sk-ant-api03-`, confirm Production environment is explicitly checked (not just Preview/Development), check timestamp on env var to confirm update landed. Blocker for Item 4 since Item 4 depends on AI functionality in production. Budget: 30-60 min investigation.
- [2026-04-14] **Production database connection pool exhaustion.** Vercel runtime logs from April 14 session show `Error [PostgresError]: MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size` across multiple endpoints: `/api/nav`, `/dashboard`, `/dashboard/requests`, profile queries. Pre-existing issue, not caused by recent deploys — just newly visible because we actually used production for the first time. Affects every feature in prod, not just AI. Diagnosis needed: (a) check Drizzle connection pool config in `db/client.ts` or equivalent, (b) check whether Supabase is configured for session mode vs transaction mode pooling, (c) check for connection leaks in server actions, (d) consider Supabase plan/pool settings. BLOCKER for any real customer use — users will hit 500s and failed page loads constantly until fixed. Budget: 1-2 hours investigation.
- [2026-04-15] **Revisit Reflections feature post-v1.** Deferred in S1 with reasoning captured in the Week 1 roadmap entry. Trigger conditions for reconsideration: (a) 3+ beta users actively requesting a reflection surface, (b) noticing that AI features would be meaningfully better with access to designer-written thinking, (c) hitting a product-market-fit moment where philosophical positioning matters more than feature count. If any of these triggers fire, reopen with a real user-research-informed spec rather than philosophy-first design.
- [2026-04-16] Analytics instrumentation pass across whole app. Deferred during Item 4 session per decision to build analytics in one coherent pass after the app is functionally complete. Scope: create `analytics_events` table per onboarding-spec section 10, build `lib/analytics/track.ts` helper, wire all events from onboarding-spec section 10 (intake_check.*, onboarding.*, progressive.*). Also includes wiring events from Item 4 retroactively (intake_check.submission_attempted, intake_check.ai_rewrite_accepted, intake_check.reframed, intake_check.submitted_anyway). Trigger: after the product is feature-complete against nav-spec + onboarding-spec, before first paying customer. Budget: 3-4 hours.
- [2026-04-16] **Stale STAGES array in `app/actions/requests.ts:9-11`.** Uses legacy flat stage names (`explore`, `validate`, `handoff`) from the old design-stage enum, not the current 4-phase model (predesign/design/build/track) or 5-stage design flow (sense/frame/diverge/converge/prove). Not actively broken but confusing drift discovered during Item 4 reconnaissance. Investigate whether it's dead code to delete or live code to rename. Budget: 15-30 min.
- [2026-04-17] RLS Tier 1+2 migration — migrate 17 routes from @/db to withUserDb/withUserSession per docs/rls-audit.md. ~7 hours across 2 sessions. Execute before first customer onboarding.
- [2026-04-17] stageEnum migration — legacy requestStages table uses old stage names (explore/validate/handoff) incompatible with current 4-phase model (sense/frame/diverge/converge/prove + kanban states). Discovered during Phase G seed when inserting "diverge" would throw. Needs: ALTER TYPE to add new values, or replace the enum, or deprecate requestStages entirely. Blocks any feature that writes to requestStages with current vocabulary. Budget: 1-2 hours investigation + migration. ~~Also found legacy 9-stage array in `components/requests/stage-controls.tsx:8-11` — same stale vocabulary (`intake/context/shape/bet/explore/validate/handoff/build/impact`); likely dead or predesign-only code but worth a grep pass for live references while the stageEnum migration is in flight.~~ **Resolved 2026-04-19 in PR #48:** grep confirmed zero live imports of `StageControls`; its only caller was the legacy `/api/requests/[id]/advance` route, which had a permission-bypass surface vs `advance-phase`. Both deleted; `canAdvanceRequestPhase` is now the sole phase-advancement authorization path, covered by `test/request-permissions.test.ts`.
- [2026-04-18] Dependabot vulnerabilities on main — 2 open (1 high, 1 moderate) per github.com/Nikhilsharma-lab/Lane/security/dependabot. Strategy: let Dependabot continue auto-generating PRs as it finds issues; batch-review and merge them in one pass before first customer onboarding. No urgency pre-launch (zero users = zero real attack surface), but must clear before any customer data hits prod. Combine with the RLS Tier 1+2 migration and ANTHROPIC_API_KEY 401 fix for a single "pre-customer security sweep." Budget: 30-60 min to triage + apply Dependabot's PRs, more if fixes require manual adjustments for breaking changes in major version bumps.
- [2026-04-18] active-requests/page.tsx is still a 22-line placeholder. Same shape as the Items 5/6/15f builds — needs a real query (requests WHERE projectId = team.id AND phase IN ('predesign','design')), CompactRequestRow list, phase filter, empty state. ~1 hour. Discovered during Item 15f.
- [2026-04-19] NEXT_PUBLIC_APP_URL in .env.local is https://design-q2.vercel.app (preview-style domain). Verify this is the correct dev app URL and not stale from an old preview. Production uses uselane.app per memory — confirm dev vs prod URL strategy is intentional. Low priority, verify when doing production-readiness sweep pre-customer.
- [2026-04-19] Local Postgres connection (DATABASE_URL) was malformed since at least last vercel env pull — direct hostname combined with pooler port. Meant Drizzle Kit, seeds, and any direct SQL tooling silently couldn't reach the dev DB. Resolved during pre-A1 cleanup. Worth a one-line audit check post-customer: before next vercel env pull, ensure it doesn't clobber manually-set DIRECT_DATABASE_URL.
- [2026-04-19] Postgres-direct code path audit. The pre-A1 cleanup found three pooler-incompatible paths (drizzle.config.ts using DATABASE_URL for migrations, withUserSession using DATABASE_URL for session-scoped set_config, scripts/seed-inbox.mjs missing prepare:false) — fixed in commit 830a75f. But these were found by hand. There may be other code paths that assume direct Postgres semantics (prepared statements, session state, advisory locks, LISTEN/NOTIFY, long-running transactions) and silently misbehave on the transaction pooler. Audit scope: grep for postgres() calls, set_config calls, LISTEN/NOTIFY usage, advisory locks (pg_advisory_lock, pg_advisory_xact_lock), prepared statements (PREPARE / EXECUTE), and any transactions that span multiple statements with state dependencies. Verify each is either pooler-safe or routes through DIRECT_DATABASE_URL. Trigger: before first paying customer. Budget: 1-2 hours.
- [2026-04-19] Transaction pooler (:6543) on lane dev rejects auth despite session pooler (:5432) accepting same credentials. Dashboard shows pooling enabled, no warnings, right project/region (ap-southeast-1, `<lane-dev-ref>`). Tried: password reset, waited 2+ minutes, confirmed URL structure with diagnostic script. Workaround: DATABASE_URL routed through session pooler too, same as DIRECT_DATABASE_URL (both identical on port 5432). Session pooler comfortably supports current dev concurrency. Trigger to revisit: (a) post-launch load approaches pool limit, (b) contact Supabase support if issue persists >48 hours, (c) Vercel cold-start patterns show connection pressure. Budget when triggered: 30-60 min for Supabase support ticket; then re-split DATABASE_URL vs DIRECT_DATABASE_URL in .env.local and restart dev. No code changes needed to revert — just .env.local.
- [2026-04-19] Production migration pipeline. Currently prod schema changes are applied via manual SQL in the Supabase dashboard or raw psql. drizzle-kit push is never run against production. This works at pre-customer scale but is fragile — no audit trail, no rollback plan, no CI gate against destructive changes. At enterprise grade, production migrations should run through a pipeline (GitHub Action running drizzle-kit migrate with the production DATABASE_URL, gated on CI tests passing). Trigger: before first paying customer, or when the manual SQL approach causes a production incident — whichever first. Budget: ~4-6 hours including GitHub Action setup and testing.
- [2026-04-19] Post-fix RLS audit on withUserSession callers. Before the fix (db/user.ts:79), withUserSession used DATABASE_URL (transaction pooler), where session-scoped set_config doesn't reliably persist. All 19 caller sites are RLS-sensitive. Pre-launch traffic was near-zero so corruption risk was low, but post-Week-8-GTM this bug would have manifested as intermittent "missing data" incidents. Audit trigger: any customer report of empty/wrong data in the first month post-launch — check whether the path uses withUserSession and whether the fix was deployed before their report. Callers listed in session transcript P1.b.3a.1 (April 19 pre-A1 work). Budget: 2-4 hours if triggered.
- [2026-04-19] Mid-session reconciliation with remote. During pre-A1 cleanup, 5 PRs landed on main from another collaborator: #36 withUserSession DB URL fix (DIRECT_DATABASE_URL fail-closed in prod), #40 RLS coverage migration 0009, #44 ESLint blocking @/db imports in user-facing code, #46 fail-closed rate-limit init, #48 request permissions + stage-controls deletion. PR #36 superseded the withUserSession fix in our local commit 830a75f — adopted remote version (DIRECT_DATABASE_URL naming, fail-closed, tested) via rebase. Spec v2 initially planned migrations 0006-0009; renumbered to 0010-0013 when pre-A1 work discovered four pre-existing migrations (0006-0008 pre-session, 0009 from PR #40) already occupied those slots. (Subsequently renumbered to 0011-0014 on 2026-04-22 after catch-up migration 0010 took the 0010 slot; see commit b067d0e and the post-April-22 docs sync.) Lesson for future multi-collaborator work: fetch before long spec/build sessions, or run a quick sync check every ~1 hour during extended sessions to catch collisions early.
- [2026-04-19] Mid-session STOP-gate ambiguity. During pre-A1 cleanup, an R1/R2 inspection prompt ended with "Five outputs. Then we decide R2 strategy" without a literal STOP marker between R1 and R2. Claude Code interpreted the earlier "yes, pull/rebase" answer as covering the whole R2 pipeline, executed the rebase autonomously, and flagged the misstep afterward. Content was correct (remote's db/user.ts wholesale, as intended), but the STOP discipline was violated. Lesson: Claude.ai prompts must include literal STOP or "wait for approval" markers before any irreversible action (rebase, commit, push, delete, migration apply). Implicit stop gates based on clause structure are not enough.
- [2026-04-19] Verify commit/PR/file references in parking-lot and doc items before writing. During pre-A1 cleanup, two factual errors in Claude.ai-composed items were caught by Claude Code verification: "lane marketing website" as a verified Supabase project (unverified), and PR #36 mislabeled as "Figma user-session URL" (actually withUserSession DB URL fix). Rule: when parking-lot or spec items reference specific commits, PRs, file paths, or error messages, either (a) Claude.ai quotes Claude Code verified output verbatim, or (b) Claude Code verifies the composition before writing.
- [2026-04-19] scripts/_a1-preflight.mjs throwaway pattern. The _-prefix convention for throwaway diagnostic scripts (used in _pc-test.mjs, _pc-diag.mjs, _a1-preflight.mjs this session) works but relies on manual cleanup discipline. Consider formalizing: either (a) add scripts/_*.mjs to .gitignore so throwaway scripts never accidentally commit, or (b) add an automated pre-commit hook that warns when _-prefixed scripts exist in staged changes, or (c) rename the pattern to something the build system understands (e.g., scripts/scratch/) with tooling to detect and clean up. Budget: 15-30 min. Low priority — the manual pattern has worked so far — but worth formalizing before this becomes a team with multiple contributors.
- [2026-04-19] ~~lane dev Supabase project was empty (zero tables in public schema) during pre-A1 work.~~ **Resolved 2026-04-20 in commit `4ea1b4b`.** Bootstrap procedure documented in `docs/lane-dev-bootstrap.md` and executed end-to-end. Lane dev now has 39 public-schema tables (full Drizzle-managed schema) + pgtap 1.3.3 + sent_emails capture table. All inline commands in the bootstrap doc validated by actual use; A3 fixture exercised against real schema for the first time (counts 1/4/4/1, idempotent DELETE block confirmed). Pre-B1 unblocked.
- [2026-04-19] CI pg-tap service container pinned to postgres:16, while lane dev and lane app run postgres:17. The postgresql-17-pgtap Debian package wasn't reliably available at the time of A1 setup. Consequence: pg-tap tests run against PG16 in CI but PG17 on real databases. Risk window: any PG17-specific SQL syntax or behavior we adopt in migrations would pass PG16 tests but potentially fail on production. Trigger to revisit: (a) postgresql-17-pgtap lands in apt repos, (b) we adopt PG17-specific features in a migration (unlikely — Lane uses standard SQL), (c) CI catches a test that prod breaks on, or vice versa. Budget when triggered: ~30 min to swap the service container image in ci.yml. Document the version in CI YAML comments so any future reader knows why it's PG16.
- [2026-04-19] Claude.ai should push back harder when a previously-agreed "stop" decision reverses mid-session. On April 19, we agreed to stop after A1, resumed with A2, then split A2 into A2a/A2b when scope grew. The split was right — but catching it earlier (before Step 3 proposals) would have saved composition time. Rule: when Nikhil reverses a stop/pause decision, Claude.ai should briefly re-validate the scope before generating the next prompt, not silently adapt. A one-line sanity check costs nothing and catches exactly this pattern.
- [2026-04-19] npm run test:e2e requires Chromium binary install (one-time: npx playwright install chromium). Fresh clones and new collaborators will hit "browser not found" on first run. Fix options: (a) add a postinstall script to package.json (automatic, adds ~80MB download time to every npm install), (b) add an explicit "e2e:install" script + document in e2e/README.md (explicit, faster npm install), (c) rely on CI's existing Playwright browser cache and document the local setup step. Lean: (b) + (c). ~15 min to implement + document.
- [2026-04-19] Formalize dotenv-cli wrapper pattern. Three scripts now use it: test:sql, test:e2e, script. Pattern is "dotenv -e .env.local -o -- <command>". Consider: (a) a shared npm script shim, (b) a WORKING-RULES note documenting the pattern, (c) standardize on it for any new script that needs .env.local. Low priority — pattern works as-is — but worth noting for onboarding docs.
- [2026-04-19] Transient SSL error on Supabase admin listUsers() during A2a pre-flight (ERR_SSL_DECRYPTION_FAILED_OR_BAD_RECORD_MAC). One occurrence, didn't recur within the same session. Possible causes: TLS handshake edge case, Supabase regional flakiness, local network hiccup. Not actionable yet. Watch for recurrence across sessions — if pattern emerges, investigate retries or connection pooling on the admin client.
- [2026-04-20] sendFigmaDriftEmail and sendWeeklyDigestEmail have !resend early-returns that bypass sendEmail() in dev/CI without RESEND_API_KEY. Means ENABLE_TEST_EMAIL_CAPTURE doesn't capture emails sent through these wrappers. Invite emails (which call sendEmail directly from app/actions/invites.ts) are unaffected and work correctly with capture. Fix when first Phase D test needs to verify a wrapper-flow email. Options: (i) remove !resend early-return from wrappers, letting sendEmail handle no-op uniformly, (ii) set RESEND_API_KEY=dummy in test env. Lean: (i) — it's the structural fix. Budget: 15 min when triggered.
- [2026-04-20] CI e2e job needs email-capture setup before Phase D tests that verify invite/email flows can run in CI. Required: (a) apply db/migrations/dev_only_sent_emails.sql to CI Postgres container (same pattern as dev_only_pgtap.sql in the sql job), (b) set ENABLE_TEST_EMAIL_CAPTURE=true at job or step level, (c) decide whether e2e job reuses the sql job's Postgres service or spins up its own. A2b ships only the harness; A2b alone doesn't break CI because smoke tests don't consume email helpers. First Phase D test that calls getLastSentEmail() or sendEmail-triggering code forces the decision. Budget: 30-45 min. Trigger: D1 or D4 (invite accept flow).
- [2026-04-20] Spec column-name drift: docs/user-flows-spec.md §4.4 references organizations.owner_user_id; actual schema column is organizations.owner_id (db/schema/users.ts:6). Update spec wording when migration 0011 lands in B1 — safer to fix in the same commit that touches that table than to carry the drift forward. ~2 min.
- [2026-04-20] supabase/migrations/ vs db/schema/ drift. The April-13 raw SQL migration (supabase/migrations/20260412_nav_schema.sql) defined workspace_members without onboarded_at; the Drizzle schema (db/schema/workspace-members.ts) has it. Column was added later via drizzle-kit push without a corresponding SQL migration. Two sources of truth coexist: supabase/migrations/ for RLS/ALTER/non-Drizzle ops, db/migrations/ + db/schema/ for Drizzle-managed structure. Not immediately broken but worth noting before a multi-environment deployment pipeline exists. Trigger to act: when adding the production migration pipeline (existing parking-lot item), decide which source wins for each table and reconcile. Budget: 30 min research + decision; reconciliation scope depends on findings.
- [2026-04-20] STOP-gate re-occurrence during Step 3 of pre-B1 bootstrap. Prompt explicitly specified "STOP between each sub-step." Execution flowed through 5 sub-steps (3.1-3.3.4) without pausing because all sub-steps passed cleanly. No damage done, but this is the second instance (first: April 19 rebase pipeline) of STOP gates being treated as advisory when execution goes well. The April 19 parking lot item and the WORKING-RULES STOP-marker discipline section were meant to prevent this. They did not. Rule refinement needed: explicit STOP gates apply even when the preceding sub-step succeeds. "Success doesn't unlock the next gate; the human does." Consider strengthening WORKING-RULES wording in a follow-up commit.
- [2026-04-20] `workspaces` vs `organizations` table naming. `db/schema/users.ts:6,17` exports both `workspaces` (the canonical Drizzle definition) and `organizations` (a backward-compat alias) for the same underlying SQL table named `organizations`. Surfaced during pre-B1 bootstrap spot-check — Phase D Playwright writers may try `SELECT * FROM workspaces` and get "relation does not exist" because the SQL table is `organizations`. Drizzle types `Workspace` / `Organization` are interchangeable but the SQL identifier is not. Future cleanup: pick one — either rename the SQL table to `workspaces` (matches "workspace" everywhere in product copy + spec + `workspace_members`) or remove the `workspaces` Drizzle alias and standardize on `organizations`. Lean: rename to `workspaces` for consistency with the rest of the product noun system. Counter-consideration: renaming the SQL table touches every foreign key referencing it (workspace_members.workspace_id, invites.org_id, requests org scoping, etc.) — a migration with wider blast radius than the alias mismatch warrants. Alternative: remove the `workspaces` Drizzle alias, require all code to use `organizations`, update any product copy that calls them "workspaces" to call them "organizations." Smaller blast radius, but conflicts with the product's "workspace" noun. Real decision deserves a 30-min discussion, not a quick fold into B1. Trigger: before first Phase D test that joins on this table; or fold into B1 if migration 0011 is already touching `organizations`. Budget: ~1 hour migration + 30 min code-side rename.
- [2026-04-20] AGENTS.md leftover from prior Codex CLI experiment. File appeared at repo root on 2026-04-20, was not authored by current Claude-Code workflow. Deleted during Phase A pre-cleanup. If Codex use resumes in the Lane repo, decide before re-introducing whether (a) Codex's AGENTS.md should coexist with Claude Code's CLAUDE.md (two configs maintained in parallel), (b) one should be a thin pointer to the other (single source of truth), or (c) Codex use stays out of the Lane repo. No urgency — revisit only when/if Codex re-enters the workflow.
- [2026-04-20] `scripts/apply-dev-only-sql.mjs` wrapper. Bootstrap doc steps 2-4 use ~20-line inline `node -e` commands to apply dev-only SQL files (pgtap, sent_emails, test-seed). Pattern works but verbose; would compress to `npm run apply-dev-only-sql -- db/migrations/dev_only_pgtap.sql`. Wrapper would enforce the production-ref guard once, take SQL path as arg, emit consistent fail-stop on apply errors. Flagged in bootstrap doc's "Future improvements" section. Trigger: when the third or fourth dev-only migration lands and the inline pattern's verbosity becomes painful. Budget: 30-45 min including ESM + dotenv-cli wiring + smoke test.

**April 22 parking lot adds** — post-Commit 2. Grouped here for refile discipline; individual items still obey the one-line-per-bullet rule.

**Work items:**

*From Pre-B1.a/b/c/d:*
- [2026-04-22] §3.3 role-vocabulary confusion — B2's Path C semantic decision.
- [2026-04-22] B3 design — transfer_workspace_ownership 2-col vs 3-col return.
- [2026-04-22] B1 implementation — NULL::uuid sentinel vs RAISE EXCEPTION in accept_invite_membership.
- [2026-04-22] Issue #47 — UPSTASH prod env vars.
- [2026-04-22] Dual-naming convention meta-pattern (workspaces/organizations, teams/projects, teamMemberships/projectMembers — 3 instances).

*From today's compounding findings (April 22):*
- [2026-04-22] D-3 finding documentation — production lacks workspace_members + 4 tables.
- [2026-04-22] Production catch-up migration — apply 0010 + 0011 to lane app.
- [2026-04-22] DOCS BIG/ relocation pattern + Supabase ref redaction — placeholder conventions (<lane-dev-ref>/<lane-app-ref>).
- [2026-04-22] Broken cross-references in DOCS BIG/docs/ files (inherited from PR #54).
- [2026-04-22] Nischal's PR #60 in-flight — tracked for awareness.

*From Commit 2 drift finding + grounding:*
- [2026-04-22] 10 days of schema drift surfaced — captured in 0010.
- [2026-04-22] weekly_digests cardinality change — sentinel '' semantics post-apply (application code aware needed).
- [2026-04-22] Nischal coordination — did any changes get applied to production via dashboard? (ping sent April 22).
- [2026-04-22] notification_type enum is product surface — any new notification type requires ALTER TYPE ADD VALUE migration.
- [2026-04-22] FK gaps: notifications.org_id, workspace_members.user_id, stream_guests.user_id, stream_guests.invited_by, analytics_events.user_id — Drizzle can't declare cross-schema (auth.users); addressed in B1.
- [2026-04-22] organizations.owner_id has no FK — application-enforced per spec.
- [2026-04-22] drizzle-kit generate diffs against last DRIZZLE snapshot, not journal state (raw-SQL migrations don't snapshot) — explains why the drift accumulated invisibly.

*Pre-customer security sweep (pending):*
- [2026-04-22] Dependabot alerts triage.
- [2026-04-22] RLS migration plan (docs/rls-audit.md) execution.
- [2026-04-22] Production env vars inventory.
- [2026-04-22] getActivityLog cross-org data leak — systemDb query with only requestId filter enables cross-org enumeration. Flagged April 12 in TODOs Priority 0; unaddressed 10 days. Elevated to pre-customer security sweep. See TODOs "Fix getActivityLog Org Scoping" for fix approach.
- [2026-04-22] TODOs.md shipped-section archaeology pattern — sections marked **Status: ✅ SHIPPED** preserve original scope/spec/code-path details below as archaeology; some details are now stale (e.g., Weekly Digest's column names, cron paths). Follows the "stored claims drift" failure mode. Decision needed: delete archived detail vs. rewrite past-tense vs. leave as-is. Separate session.

*Doc sync:*
- [2026-04-22] CLAUDE.md Part 16 + CHANGELOG sync.

*Migration discipline:*
- [2026-04-22] Journal `when` baseline drift — resolve before next migration family. 0009, 0010, 0011, 0012 all carry manually-bumped `when` values above real wall-clock time (0012 now at 1776859201001, 1 second above 0011's bumped value). Each bump satisfies the strict-greater invariant locally but extends the drift forever. Real fix: reset 0009/0010/0011/0012 journal `when` values back to original generate timestamps AND update corresponding `created_at` values in drizzle.__drizzle_migrations on lane dev (and lane app when 0010+0011+0012 apply there) so future generates work with plain Date.now(). Trigger: before B2 composition, or as a separate clean-up session. Budget: 1-2 hours including verification.
- [2026-04-22] 0013 audit_log reinstate team_id — B1's accept_invite_membership audit_log INSERT intentionally omits 'team_id', invite_row.team_id because invites.team_id doesn't exist until 0013 (B2, renumbered from 0012 after 0012 was consumed by the RPC ambiguity fix-up). Reinstate the key in B2/0013 when the column is added. One-line edit to the CREATE OR REPLACE FUNCTION body. Budget: 5 min.
- [2026-04-22] B2 workspace_members.role mapping — B1's accept_invite_membership hardcodes workspace_members.role = 'member' for all invite-accepted signups. Intent-preservation of invites.role (e.g., invitee marked as admin in the invite) is deferred to B2, which touches invite schema anyway. Decide the mapping then. Options: (i) always 'member' permanently, (ii) CASE on invites.role text, (iii) treat invites.role as deprecated in favor of team_role. Budget: 15 min decision + 5 min SQL once decided.
- [2026-04-22] supabase/test-seed.sql FK violation post-0011 — once migration 0011 applies on lane dev, profiles.id → auth.users(id) CASCADE FK is active. test-seed.sql currently inserts profiles with synthetic UUIDs without seeding auth.users first. Every seed run post-apply fails with FK violation. Fix: add matching INSERT INTO auth.users (id, email) rows (3 lines, id + email only since other cols default) at the top of test-seed.sql before the profiles INSERTs. Trigger: immediately after B1 commits, before next CI run or any test execution. Budget: 10 min including verify.
- [2026-04-22] test:sql runner hygiene — `scripts/run-sql-tests.mjs` has two cosmetic issues surfaced during B1 pg-tap work. (a) Per-file tally `PASS (N assertion(s))` counts only SELECT-returned TAP rows, not NOTICE-forwarded ones. Currently undercounts by 6 when DO blocks use `RAISE NOTICE '%', tap_line` pattern. Fix: parse `ok N -` / `not ok N -` prefixes in the `onnotice` handler and increment tally. (b) NOTICE-forwarded TAP lines emit during DO-block execution (before final SELECT rows), so they appear earlier than numeric order in output. Not a correctness issue but reads confusingly. Fix options: buffer NOTICEs until file completes then emit sorted, or accept the ordering. Bundle both fixes. Budget: 30-45 min.
- [2026-04-22] pg-tap DO-block pattern refactor — current test_migration_0011.sql uses `DECLARE tap_line TEXT` + `RAISE NOTICE '%', tap_line` inside DO blocks to make assertion TAP output visible to the runner. Works but architecturally awkward (notices are meant for diagnostics, not pass/fail data). Long-term pattern: refactor each DO block to `CREATE FUNCTION test_N_name() RETURNS SETOF TEXT AS $$ BEGIN ... RETURN NEXT ok(...); END $$;` + `SELECT * FROM test_N_name();`. Emits TAP rows in-order with SELECT output, runner tally counts them natively. Trigger: before B2/B3/B4 pg-tap tests are authored — doing the refactor once on 0011's test establishes the pattern for the rest of Phase B's tests. Budget: 1-2 hours including verify.
- [2026-04-22] Post-B1 renumber (extends the April 19 renumber history above) — migration 0012 consumed by an ambiguity fix-up for 0011's RPCs (see the `Journal when baseline drift` entry and the `0013 audit_log reinstate team_id` entry in this sub-cluster). B2/B3/B4 renumbered from 0012/0013/0014 → 0013/0014/0015 in this commit. Phase B migration set is now 0011 (B1) + 0012 (fix-up) + 0013 (B2) + 0014 (B3) + 0015 (B4). Future reference: the April 19 `Mid-session reconciliation` entry above traces the chain up to the April 22 post-catch-up renumber; this bullet picks it up from there.

**Discipline / methodology (candidates for WORKING-RULES.md):**

- [2026-04-22] Schema-file vs journal drift — re-verification rule when "doesn't block X" claims are made.
- [2026-04-22] Supabase platform infrastructure enumeration before destructive ops.
- [2026-04-22] Validation-by-use limitation (commands work ≠ achieves goal).
- [2026-04-22] Spec drift discipline — quarterly verification.
- [2026-04-22] Mid-session remote reconciliation (recurrence April 19 + April 21) — fetch checkpoint discipline needed.
- [2026-04-22] Parking-lot-item relevance re-check discipline — before each new work phase, re-verify items that claim "doesn't block X".
- [2026-04-22] "Migrations as canonical" is aspirational-from-today.

**Review cadence:**
- **End of week 4 re-scope:** read the full parking lot. For each item, decide: sequence it into weeks 5-7, keep it in the parking lot, or delete it.
- **End of week 7 or 8:** same review. Decide what survives into the next roadmap.

**Active items:** 74 — update whenever parking lot entries are added or resolved. Previous count of 12 was stale; corrected 2026-04-20 during pre-B1 bootstrap commit.


---