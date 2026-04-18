# Lane Roadmap

**Status:** Active plan, April 14, 2026
**Budget:** ~15 focused hours per week, ~98 hours total work
**Duration:** 7 weeks of planned work + 1 week buffer
**Re-scope checkpoint:** End of week 4
**Source:** Built collaboratively from Phases 1-4 of the April 14 roadmap session. See CLAUDE.md for full context on vocabulary lock and build rules.

> **Next session:** Item 15c (Week 6) — weekly AI digest cron per CLAUDE.md Part 9 item 7 ("biggest moat" per the spec). Pre-generate on Friday, store per org, use Vercel cron, handle scheduling/retries/error handling. The weekly digest already exists as an on-demand feature; this session builds the cron infrastructure to pre-generate + cache. 6-hour estimate. Item 15b shipped April 18 — impact logging refinements (notes, editable actual, shared variance helper with warmer labels, prior-calibration hint, measuredAt display).

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
- [ ] **Item 15c** — Weekly AI digest cron. Pre-generate on Friday, store per org. Cron infrastructure via Vercel cron or similar. Handle scheduling, retries, error handling. Per CLAUDE.md Part 9 item 7. (6 hours)
- [ ] **Item 15g** — Performance pass (start, 4 of 7 hours). Profile slow pages. Optimize queries. Add indexes. Check bundle size. Reduce re-renders. Continue in buffer week. (4 hours)

**Week 6 exit state:** All Item 15 components shipped except finishing touches on performance.

---

## Week 7 — Buffer + deferred items

**Goal:** Absorb slippage. Finish performance pass. Ship small deferred items that accumulated.

**Budget:** 15 hours. **Planned:** variable.

- [ ] **Item 15g** — Finish performance pass (remaining ~3 hours)
- [ ] **Item 15h** — Ongoing bug fixes. Not a discrete sequenced task — happens as issues are found. Log them here as you go.
- [ ] **Item 8 Phase I** — Weekly digest first-time email (deferred from Item 8). ~1–2 hours.
- [ ] **active-requests page build** — Real query + list mirroring Items 5/6/15f (deferred; parking lot item from April 18). ~1 hour.

**Week 7 exit state:** Lane is feature-complete against the roadmap, with deferred items cleaned up. Ready for the pre-customer security sweep (parking lot) before real onboarding. Week 8 no longer exists — folded into this buffer.

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

*Last updated: April 18, 2026 — Weeks 1–5 complete, Item 15b shipped (~1 hour actual). Impact logging flow now has notes, editable actuals, prior-calibration hints, measuredAt, and a shared variance helper with warmer labels. Next: Item 15c (weekly digest cron, 6 hours).*

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
- [2026-04-15] **Claude Code shell environment pollution.** Claude Code exports `ANTHROPIC_BASE_URL=https://api.anthropic.com` (missing `/v1`) and overrides `ANTHROPIC_API_KEY`. Any tsx/node scripts in Lane that call Anthropic need `unset ANTHROPIC_API_KEY ANTHROPIC_BASE_URL &&` prefix. Not a Lane bug — Claude Code environment issue.
- [2026-04-15] **Create separate Supabase project for dev/staging.** Currently local dev and production share the same hosted Supabase project. Fine pre-launch with zero customers. Must separate before onboarding first beta tester. Budget: 1-2 hours including env var updates.
- [2026-04-15] **Phase 3 test data cleanup.** AI verification testing left ~6-10 test rows across requests, predictionConfidence, and possibly other tables. Clean up before showing prod to anyone. Quick query: delete where title starts with "Phase 3 test" or similar.
- [2026-04-15] **Error UI for AI panel failures.** Phase 4 Tier 3 added console.error logging to 9 UI components but deferred error UI (what the user sees when AI fails). Needs design decisions: error text, style, retry button. Scope: 9 components, each needs a small inline error state. Budget: 2-3 hours including design.
- [2026-04-14] **Production Anthropic API key 401 in Vercel.** Added ANTHROPIC_API_KEY to Vercel production env vars and redeployed during April 14 session. Production still returns `invalid x-api-key` 401 on triage calls. Cause unclear — possible env var value problem, environment scope issue, or redeploy timing. Needs fresh diagnosis: verify key value starts with `sk-ant-api03-`, confirm Production environment is explicitly checked (not just Preview/Development), check timestamp on env var to confirm update landed. Blocker for Item 4 since Item 4 depends on AI functionality in production. Budget: 30-60 min investigation.
- [2026-04-14] **Production database connection pool exhaustion.** Vercel runtime logs from April 14 session show `Error [PostgresError]: MaxClientsInSessionMode: max clients reached - in Session mode max clients are limited to pool_size` across multiple endpoints: `/api/nav`, `/dashboard`, `/dashboard/requests`, profile queries. Pre-existing issue, not caused by recent deploys — just newly visible because we actually used production for the first time. Affects every feature in prod, not just AI. Diagnosis needed: (a) check Drizzle connection pool config in `db/client.ts` or equivalent, (b) check whether Supabase is configured for session mode vs transaction mode pooling, (c) check for connection leaks in server actions, (d) consider Supabase plan/pool settings. BLOCKER for any real customer use — users will hit 500s and failed page loads constantly until fixed. Budget: 1-2 hours investigation.
- [2026-04-15] **Revisit Reflections feature post-v1.** Deferred in S1 with reasoning captured in the Week 1 roadmap entry. Trigger conditions for reconsideration: (a) 3+ beta users actively requesting a reflection surface, (b) noticing that AI features would be meaningfully better with access to designer-written thinking, (c) hitting a product-market-fit moment where philosophical positioning matters more than feature count. If any of these triggers fire, reopen with a real user-research-informed spec rather than philosophy-first design.
- [2026-04-16] Analytics instrumentation pass across whole app. Deferred during Item 4 session per decision to build analytics in one coherent pass after the app is functionally complete. Scope: create `analytics_events` table per onboarding-spec section 10, build `lib/analytics/track.ts` helper, wire all events from onboarding-spec section 10 (intake_check.*, onboarding.*, progressive.*). Also includes wiring events from Item 4 retroactively (intake_check.submission_attempted, intake_check.ai_rewrite_accepted, intake_check.reframed, intake_check.submitted_anyway). Trigger: after the product is feature-complete against nav-spec + onboarding-spec, before first paying customer. Budget: 3-4 hours.
- [2026-04-16] **Stale STAGES array in `app/actions/requests.ts:9-11`.** Uses legacy flat stage names (`explore`, `validate`, `handoff`) from the old design-stage enum, not the current 4-phase model (predesign/design/build/track) or 5-stage design flow (sense/frame/diverge/converge/prove). Not actively broken but confusing drift discovered during Item 4 reconnaissance. Investigate whether it's dead code to delete or live code to rename. Budget: 15-30 min.
- [2026-04-17] RLS Tier 1+2 migration — migrate 17 routes from @/db to withUserDb/withUserSession per docs/rls-audit.md. ~7 hours across 2 sessions. Execute before first customer onboarding.
- [2026-04-17] stageEnum migration — legacy requestStages table uses old stage names (explore/validate/handoff) incompatible with current 4-phase model (sense/frame/diverge/converge/prove + kanban states). Discovered during Phase G seed when inserting "diverge" would throw. Needs: ALTER TYPE to add new values, or replace the enum, or deprecate requestStages entirely. Blocks any feature that writes to requestStages with current vocabulary. Budget: 1-2 hours investigation + migration. Also found legacy 9-stage array in `components/requests/stage-controls.tsx:8-11` — same stale vocabulary (`intake/context/shape/bet/explore/validate/handoff/build/impact`); likely dead or predesign-only code but worth a grep pass for live references while the stageEnum migration is in flight.
- [2026-04-18] Dependabot vulnerabilities on main — 2 open (1 high, 1 moderate) per github.com/Nikhilsharma-lab/Lane/security/dependabot. Strategy: let Dependabot continue auto-generating PRs as it finds issues; batch-review and merge them in one pass before first customer onboarding. No urgency pre-launch (zero users = zero real attack surface), but must clear before any customer data hits prod. Combine with the RLS Tier 1+2 migration and ANTHROPIC_API_KEY 401 fix for a single "pre-customer security sweep." Budget: 30-60 min to triage + apply Dependabot's PRs, more if fixes require manual adjustments for breaking changes in major version bumps.
- [2026-04-18] active-requests/page.tsx is still a 22-line placeholder. Same shape as the Items 5/6/15f builds — needs a real query (requests WHERE projectId = team.id AND phase IN ('predesign','design')), CompactRequestRow list, phase filter, empty state. ~1 hour. Discovered during Item 15f.

**Review cadence:**
- **End of week 4 re-scope:** read the full parking lot. For each item, decide: sequence it into weeks 5-7, keep it in the parking lot, or delete it.
- **End of week 7 or 8:** same review. Decide what survives into the next roadmap.

**Active items:** 12 (model ID note and silent failure audit absorbed into completed "AI foundation verification" item)


---