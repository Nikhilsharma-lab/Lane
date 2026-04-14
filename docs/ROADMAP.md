# Lane Roadmap

**Status:** Active plan, April 14, 2026
**Budget:** ~15 focused hours per week, ~98 hours total work
**Duration:** 7 weeks of planned work + 1 week buffer
**Re-scope checkpoint:** End of week 4
**Source:** Built collaboratively from Phases 1-4 of the April 14 roadmap session. See CLAUDE.md for full context on vocabulary lock and build rules.

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

- [ ] **V1** — Verify migration 0002 applied to Supabase dev. Check if `designer_owner_id` column exists on the `requests` table via `npm run db:studio` or the Supabase dashboard. Gates Item 11. (5 min)
- [ ] **V2** — Investigate whether Request submitter ID is stored anywhere in the database. Read the Request intake code in `app/actions/` or `app/api/requests/`, grep the schema in `db/schema/requests.ts` for columns like `requester_id`, `submitted_by`, `created_by_id`. If yes, Item 6 uses the existing column. If no, Item 6 needs a small migration. Gates Item 6. (10 min)
- [ ] **V3** — Verify Anthropic API key works. Check `.env.local` for `ANTHROPIC_API_KEY`, then actually trigger an existing AI feature like triage and confirm it responds. Gates Item 4. (5 min)
- [ ] **V4** — Investigate pgvector duplicate detection status. Read `lib/ai/` for a duplicates file, check `db/schema/requests.ts` for an embedding column, look for a cron or trigger that generates embeddings on Request creation. Affects Item 9 sizing. (20 min)

---

## Spec sessions (do these in week 1 before items that depend on them)

These items are on the sidebar or in the spec files but don't yet have enough design to build against. Each one is a ~25-45 min conversation that produces a short spec file, then a later build session against that spec.

- [ ] **S1** — Spec Reflections page. What is it, who sees it, is it attached to Requests or standalone, what does the writing experience look like, what's the team-lead view? Produces `docs/reflections-spec.md`. Gates Item 7-build, Item 8, Item 14. (45 min)
- [ ] **S2** — Spec "What's new" footer. Decide scope: changelog, marketing surface, announcement bar, or something else. Produces a spec section (can be inline in nav-spec.md). Gates the "What's new" build in week 4. (25 min)

---

## Week 1 — Foundation and unknowns

**Goal:** Resolve every unknown, finish vocabulary cleanup, ship the intake check, ship My requests as a real page.

**Budget:** 15 hours. **Planned:** ~13 hours. **Slack:** 2 hours.

- [ ] V1 — Verify migration 0002 (5 min)
- [ ] **Item 11** — Apply migration 0002 to Supabase dev if V1 showed it wasn't already applied. `npm run db:push` + verification. [STRICT: after V1] (10 min)
- [ ] V2 — Investigate Request submitter ID storage (10 min)
- [ ] V3 — Verify Anthropic API key works (5 min)
- [ ] V4 — Investigate pgvector duplicate detection (20 min)
- [ ] **Item 3** — Team-scoped streams route investigation. Read `app/(dashboard)/dashboard/teams/[slug]/streams/page.tsx`, decide: rename to `active-requests`, delete, or leave. Read-only recon, produces a decision note. (20 min)
- [ ] **S2** — Spec "What's new" footer (25 min)
- [ ] **S1** — Spec Reflections page (45 min)
- [ ] **Item 1** — Phase 2 Sign-off → Prove rename + stale identifier sweep. Rename `components/requests/validation-gate.tsx` → `prove-gate.tsx`, rename `ValidationGate` export → `ProveGate`, update all import sites, rename `app/(dashboard)/dashboard/teams/[slug]/validation/` directory → `/prove/`, update nav keys `team:${slug}:validation_gate` → `team:${slug}:prove` in `lib/nav/active-item.ts` and `lib/nav/order.ts`, grep for and fix stale identifiers like `isRefineStage` in `components/requests/design-phase-panel.tsx:83` and elsewhere. Use scoped Claude Code prompts with stop points, per the pattern established in April 13 alignment session. (2 hours)
- [ ] **Item 4** — Intake check UI build. Three-panel classifier (problem_framed, solution_specific, hybrid) per `docs/onboarding-spec.md` section 7. Classifier call to `claude-haiku-4-5-20251001`. Three distinct panel UIs with different CTAs. "Submit anyway with justification" escape hatch. Writes `requests.ai_flagged`, `requests.ai_classifier_result`, `requests.ai_extracted_problem`, `requests.ai_extracted_solution`, `requests.submit_justification`. Analytics events per onboarding-spec section 10. [STRICT: after V3] (5 hours)
- [ ] **Item 5** — Real My requests page. Replace `app/(dashboard)/dashboard/my-requests/page.tsx` placeholder with a real list view. Query: `requests.designer_owner_id = auth.uid()`. Sort by most recent update. Filter by phase. Empty state per `docs/nav-spec.md` tone. (4 hours)

**Week 1 exit state:** All unknowns resolved. Both specs written. Vocabulary fully clean across the codebase. Intake check shipped and visible to users submitting requests. My requests page is real.

---

## Week 2 — Customer-critical infrastructure and placeholder pages

**Goal:** Ship security layer, finish all three placeholder pages as real pages.

**Budget:** 15 hours. **Planned:** ~13.5 hours. **Slack:** 1.5 hours.

- [ ] **Item 12** — Supabase RLS policies for requests, reflections, validations. Enforce org scoping at the database level. Write `create policy` SQL statements for each table covering: who can read (own org's rows only), who can insert (authenticated members of the org), who can update (creators and leads only), who can delete (leads or admins only). Test each policy against the existing schema. Document policies in `docs/rls-policies.md`. This is the one item with a real aspirational deadline (~2 months until first customer). (4 hours)
- [ ] **Item 6** — Real Submitted by me page. [STRICT: after V2] If V2 showed no submitter column exists, start with a 15-minute migration to add `requests.requester_id` pointing to `auth.users`, update Drizzle schema, run `db:push`. Then replace the placeholder page with a real list view. Query: requests where current user was the submitter. Sort, filter, empty state. (4 hours + 30 min migration if needed)
- [ ] **Item 7-build** — Real Reflections page. [STRICT: after S1] Implementation scales with the S1 spec. Conservative estimate assumes a feed or list view. If S1 reveals a richer writing experience with per-Request attachment, this becomes a longer item that may spill into week 3. (5 hours provisional)

**Week 2 exit state:** Security layer in place. All three Personal zone placeholder pages are real pages with real queries. Lane is no longer "promises in the sidebar" — every click leads to a functional page.

---

## Week 3 — The big onboarding push

**Goal:** Ship the full onboarding flow. Close nav-spec execution. Add cost protection and multi-team support.

**Budget:** 15 hours. **Planned:** ~16 hours (1 hour over; onboarding is best done in one focused block).

- [ ] **Item 8** — Full onboarding build. Execute the 13-step build order in `docs/onboarding-spec.md` section 11. Schema additions (`workspace_members.onboarded_at`, `analytics_events` table, new columns per onboarding-spec section 10). Persona detection logic in `lib/onboarding/detect-persona.ts`. Analytics helper in `lib/analytics/track.ts`. Design Head 4-screen flow (Welcome → Phase model → Sample team → First action). Designer 2-screen flow. PM 2-screen flow + intake check beat on first submission. Sample team seed script at `scripts/seed-sample-team.ts` with `is_sample: true` on every row. Sample clear flow. Five progressive disclosure moments per section 8. Weekly digest first-time email. Analytics event verification per section 10. [STRICT: after Item 4, after Item 1, after S1, after Item 11] (7 hours over 1-2 days)
- [ ] **Item 13** — Upstash Redis rate limiting for AI routes. Install `@upstash/ratelimit`, wrap each AI route handler (triage, context-brief, morning briefing, classifier). Set sensible limits per route. Test with rapid requests and confirm throttling. (1.5 hours)
- [ ] **Item 15f** — Commitments view. Build the team Commitments page per `docs/nav-spec.md` section 2. Query: requests committed to the current cycle for the selected team. List UI, empty state ("Nothing's committed yet. When your team picks what to work on next, it shows up here."). This closes the nav-spec execution loop — every sidebar item has a real destination. (5 hours)
- [ ] **Item 10** — Zone 3 team sections verification. Triggered item: activates once you've created a second team in the workspace. Verify `components/nav/team-section.tsx` renders correctly with real multi-team data. Debug any issues with collapsibles, counts, or data hooks. If you haven't created a second team by week 3, this slips to whenever it triggers. (2 hours)

**Week 3 exit state:** First-time users see a real onboarding flow with the intake check as the killer moment. Lane is cost-protected. The sidebar fully matches nav-spec.md. Multi-team works if tested.

---

## Week 4 — Polish and the "What's new" build

**Goal:** Add command palette, build "What's new" footer, take stock.

**Budget:** 15 hours. **Planned:** ~10 hours. **Slack:** 5 hours (reserved for "What's new" growing beyond estimate or for unexpected work).

- [ ] **Item 9** — Command palette rebuild. Install `cmdk`. Build actions registry for common commands (new request, new idea, jump to team, open radar, etc.). Wire pgvector semantic search for Request title lookup. [V4 determines whether pgvector is ready or needs setup; add 2 hours to this item if V4 revealed pgvector duplicate detection isn't built yet.] Re-add `⌘K` chord hint to sidebar search button. (8 hours)
- [ ] **"What's new" footer build** — Implementation based on S2 spec from week 1. If S2 landed on a simple changelog reading from a JSON file, this is ~2 hours. If S2 landed on a marketing surface with CMS integration, this is more. Adjust estimate based on the spec. (2 hours provisional)

**Week 4 exit state:** Lane is feature-complete against nav-spec, onboarding-spec, and all pre-launch Tier 2/3 features. The `⌘K` palette works. Users see a "What's new" surface in the footer.

**RE-SCOPE CHECKPOINT:** At end of week 4, stop and re-read weeks 5-7. Questions to ask:
- Is Item 14 (Design Phase UI) still the right use of the next three weeks, or has a customer conversation or demo surfaced something more urgent?
- Is the product demo-ready to show a real design leader? If yes, consider pausing the roadmap for a customer-facing week.
- What broke during weeks 1-4 that needs a cleanup session?
- What are you feeling good about and what feels forced?

**If the answer to "is Item 14 still right" is no, update this file and re-sequence. The roadmap serves you, not the other way around.**

---

## Week 5 — Start of Design Phase UI (Item 14 part 1)

**Goal:** Build the front half of the 5-stage design flow.

**Budget:** 15 hours. **Planned:** ~15 hours.

- [ ] **Item 14 part 1** — Sense screen (read-only view of context, research, past decisions; Sensing Summary text field; AI sidebar for related research). Frame screen (Design Frame structured form: problem in designer's words, success criteria, constraints, divergence from PM brief). Design Frame creation UI. Start of Diverge screen (iteration cards, "Add Direction" button). [STRICT: after S1, Item 1, Item 11] (~15 hours)

**Week 5 exit state:** Two of the five design stages are UI-complete. Designers can move a Request through Sense and Frame.

---

## Week 6 — Finish Design Phase UI + start Item 15 components

**Goal:** Finish the 5-stage design flow. Start two Item 15 components.

**Budget:** 15 hours. **Planned:** ~15 hours.

- [ ] **Item 14 part 2** — Finish Diverge screen (iteration management with 2-5+ directions, reflection fields per direction, comment threads per iteration, Figma version tracking, AI "Iteration Summary" generator). Build Converge screen (Decision Log entries, AI edge case generator, completeness meter, feedback threads). Build Prove screen (3 sign-off cards with Approve / Approve with comments / Request changes, structured feedback logging on rejection, engineering feasibility review, AI handoff checklist generator). Iteration management polish. Feedback threads. (~6 hours)
- [ ] **Item 15a** — Handoff doc generation improvements per CLAUDE.md Part 4. Enhance the auto-generated handoff doc with missing states, accessibility gaps, engineering notes. Mostly AI prompt and output formatting work. (4 hours)
- [ ] **Item 15d** — Private designer nudges per CLAUDE.md Part 9 item 6. In-app nudge UI and logic. Nudges go to the designer privately, never escalated to leads automatically. Contextual and friendly. (4 hours)
- [ ] **Item 15e** — Morning briefing improvements (start, ~1 hour of 3). Begin refinements to `lib/ai/morning-briefing.ts`. More per-role context, better summaries, handle edge cases. Continue in week 7. (1 hour)

**Week 6 exit state:** The entire 5-stage design flow is UI-complete. Lane has a working design phase experience, which is the core of what the product is *for*. Two Item 15 components shipped.

---

## Week 7 — Remaining Item 15 components and performance

**Goal:** Finish Item 15 components. Start performance pass.

**Budget:** 15 hours. **Planned:** ~15 hours.

- [ ] **Item 15e** — Finish morning briefing improvements (~2 hours remaining)
- [ ] **Item 15b** — Impact logging refinements per CLAUDE.md Part 5. Refine the existing impact record flow. PM calibration display improvements. (3 hours)
- [ ] **Item 15c** — Weekly AI digest cron. Pre-generate on Friday, store per org. Cron infrastructure via Vercel cron or similar. Handle scheduling, retries, error handling. Per CLAUDE.md Part 9 item 7. (6 hours)
- [ ] **Item 15g** — Performance pass (start, 4 of 7 hours). Profile slow pages. Optimize queries. Add indexes. Check bundle size. Reduce re-renders. Continue in buffer week. (4 hours)

**Week 7 exit state:** All Item 15 components shipped except finishing touches on performance.

---

## Week 8 — Buffer (only if earlier weeks slipped)

**Goal:** Absorb slippage. Finish performance pass. Bug fixes.

**Budget:** 15 hours. **Planned:** variable.

- [ ] **Item 15g** — Finish performance pass (remaining ~3 hours)
- [ ] **Item 15h** — Ongoing bug fixes. Not a discrete sequenced task — happens as issues are found. Log them here as you go.

**Week 8 exit state:** If you reached week 8 with nothing urgent left, you're done. Lane is feature-complete against the roadmap and ready for real customer onboarding.

---

## Strict dependencies at a glance

This is the dependency graph that made the sequencing decisions above. If you re-sequence, respect these.