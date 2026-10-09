# Lane UX, copy and launch review plan

**Status:** Refreshed after the 2026-10-06 Expected impact and Request review increments. The compact composer is the accepted input foundation; Metric/Verified result creation, signed review, link/file confirmation, review recovery and read-only saved detail are implemented and locally verified. The review preview awaits visual acceptance; save/upload recovery and arrival are next. The saved Request's named-trio agreement state, launch, actual-result closure and period totals remain target only. Earlier first-use work remains subject to full-journey rehearsal. The launch cut remains open. This is a collaborative review plan, not approval to implement every proposed change below.

**Goal:** Give one clearly defined audience a useful, understandable first Request and a coherent ongoing workflow, then prepare that agreed product for market.

**Approach:** Review one page and its connected states at a time. Start with the product promise and first-Request loop. Show the existing experience, agree the necessary changes, implement that bounded decision with the existing library source, and verify it before moving on. Marketing must describe the resulting product truthfully.

**Foundation:** Next.js, React, TypeScript, existing ReUI compositions and Base UI controls; Coss only for missing individual controls. Keep the selected shell, Tabler icons and semantic colour system. Clerk retains authentication and membership authority.

**Product foundation — confirmed 2026-10-06:** one source of truth for the product and its journeys; predicted-versus-actual Request impact and quarterly/yearly product results. Record the prediction during creation, require named PM/Designer/Developer agreement before progression, and have the submitter record results at the agreed post-launch window before closure. Nikhil explicitly confirmed that the submitter owns closure (even if another person is the PM) and that a documented exception may close but stays outside measured-impact totals. Full authority is in `REQUIREMENTS.md`; no application/schema changes are part of this clarification.

## Active phase and phase sequence

Nikhil confirmed working phase by phase. He subsequently corrected the sequence: review the first-time experience before the populated Requests page. The initial Requests copy pass was not a complete first-time journey review. Phase numbers below now follow that correction; the later page inventory remains a coverage checklist, not permission to skip ahead.

| Phase | Outcome | State |
| --- | --- | --- |
| 1 — Product foundation | Agree the first audience, costly problem, useful result and honest launch promise | Shared product/journey record, expected/actual impact, period summaries and trio agreement confirmed; recruitable audience and launch cut remain open |
| 2 — First-time experience | Review signup/verification → workspace create/join → role selection → empty Requests landing, including invited users | Earlier bounded work retained; complete journey acceptance and hosted checks remain open |
| 3 — First Request | Expected impact at creation → review → saved Request awaiting named trio agreement | Current: impact creation/review/detail implemented and locally verified; named trio agreement remains target only |
| 4 — Returning and everyday use | Refine login/recovery, populated Requests, detail, discussion and progression | Follows Phase 3; initial list copy pass retained for later review |
| 5 — Supporting surfaces | Refine Members, Profile, notifications, shared navigation and failure states | Follows Phase 4 |
| 6 — Market readiness | Align marketing, observe prospective users and close the release gates | Follows Phase 5 |

### Phase 1 decision brief — discussion draft

**Existing capability:** a person describes a design request; Lane checks the wording and proposes a problem framing for them to review; the saved Request carries context, comments and Open/In Progress/Done status. This does not establish team agreement, validate evidence or demonstrate an outcome.

**Audience hypothesis:** an in-house design lead receiving Requests from PMs and teammates. The lead champions adoption; requesters and designers both need a useful experience. This narrows the audience for discussion and is not a replacement for the audience in PRODUCT.md.

**Initial problem hypothesis:** a request names a desired solution without enough context, so someone must chase the underlying need before deciding what to do. Nikhil's account below expands this beyond clarity to shared decision authority, competing priorities, evidence and outcome follow-through. The initial hypothesis alone is insufficient for the experience he described.

**Desired result to validate:** after submitting and reviewing a Request, the requester feels accurately represented and the recipient understands the need well enough to decide the next step. Better wording alone is insufficient evidence of value.

**Initial candidate promise:** “Give your team the context behind every design request.” This and the earlier framing-led candidate are now under review against the broader founder problem below. Neither is approved public copy. Avoid suggesting AI confirmation makes a Request agreed, ready to build or factually validated.

**Main challenge:** if Lane only rewrites an ask, a team may prefer a prompt and its existing tracker. The review must establish whether Lane improves the actual exchange of context enough to justify another tool. This is a hypothesis to test, not a competitive-market conclusion.

**Founder response received:** Nikhil described recurring experience with solution-led instructions, private approaches to individual designers, competing prioritization pressure, absent success criteria, questionable metric claims and no post-launch feedback. The first recruitable audience and launch scope remain unresolved; no multiple-choice option has been inferred as selected.

### Phase 1 founder evidence — 2026-10-05

Source: Nikhil's account in this conversation. These are reported experiences, not independently verified incidents or claims about every PM/team. No customer interviews or market validation have occurred during this review.

| Reported experience | Underlying problem to test | Possible product response — proposal only |
| --- | --- | --- |
| PMs arrive with “make this change” and expect it to be followed as given | Design has delivery responsibility without meaningful participation in defining the problem or approach | Preserve the proposed solution as context; give participants an explicit chance to clarify, question and agree before commitment |
| Requests arrive randomly and PMs approach designers individually | Work and commitments can bypass shared visibility | Make a shared Request the agreed record for a commitment; do not assume software can prevent conversations outside Lane |
| Each PM pressures designers to prioritize their work above others | Existing commitments and tradeoffs are insufficiently visible; conflict relies on design-head intervention | Make shared commitments, agreed timing and the consequences of reprioritization visible; avoid requiring the design head to arbitrate every Request |
| No stated metric, desired result or definition of success | The team cannot judge whether work is worthwhile or successful | Agree a specific observable result and relevant evidence; permit honest unknowns or discovery rather than demanding invented numerical targets |
| Some numbers are reportedly fabricated or exaggerated to expedite work | Unsupported claims can be presented as established evidence | Distinguish claim, source, assumption and uncertainty; allow challenge/correction. AI must not certify truth or score a person's honesty |
| After launch PMs move on without telling designers what changed | The team loses the connection between delivered work and results | Record an outcome owner and an agreed review point, then return results or a truthful exception to the shared Request |

**Revised problem hypothesis:** designers are asked to execute commitments without a shared decision about the problem, priority or success, and without a reliable return of evidence after release. Better request wording addresses only one part.

**Revised direction for discussion:** Lane helps product and design agree what deserves work, why it matters and what success means, with a visible record of what happened afterward. This is a possible product direction, not a claim about the current build or a decision to implement the full pipeline for launch. Engineering remains part of the previously approved named-trio target; this account does not remove that discipline.

**Existing contract connection:** `REQUIREMENTS.md` §§4.4–4.6 and §4.10 already describe explicit shared alignment, meaningful success/evidence, assignment separate from starting work and creator-owned outcome closure. Those are approved future behavior and remain unimplemented scope here. Prioritization authority and adoption need further discussion; do not add an approval hierarchy, priority score, integrations or new AI to fill the gap automatically.

**Adoption constraint:** the working agreement must have backing from the people who can allocate and protect design capacity. A designer filling in Lane alone may still face the same private pressure. Position around useful joint decisions and reciprocal commitments; avoid blaming a discipline or making Lane a tool for policing people. Avoid turning every request into a long form.

### Founder clarification — shared visibility is central

**Confirmed intent:** Nikhil, as design head, can say “not now.” The desired product should reduce reliance on that personal intervention by giving stakeholders visibility of **who is working on what and when**. The problem is not simply an absent decision authority. Do not turn Lane into a design-head approval desk.

**Product interpretation for discussion:** shared Requests should make work and commitments understandable to the workspace team within existing permissions. Intake helps establish useful context; AI reframing supports that experience and is not sufficient as the entire product promise. Retain the earlier success/evidence and post-launch feedback needs rather than reducing this to another status tracker.

**Information hierarchy for the Requests review:** the problem/Request, current owner, work status and what is next for pickup. Relevant context should explain why the work matters and changes in priority. These are information needs, not approval for new columns, fields, routes or scheduling functionality.

**Meaning of “when,” clarified by Nikhil:** show who is working on a Request currently and which Request is prioritized next. The future person is unknown until pickup. An admin may deprioritize it. Nikhil subsequently confirmed free choice of pickup, so this priority cannot be presented as a guaranteed execution order. The earlier proposed start/finish-date interpretation is superseded for this shared-view discussion; do not introduce calendar scheduling or predicted future assignees on that basis.

**Confirmed pickup rule:** Nikhil stated, “anyone can pick whatever they want.” Any person eligible to pick up work can choose any available Open Request regardless of priority; skipping the suggested next Request needs no admin approval. Priority guides pickup and does not enforce an order. This clarification concerns priority, not an expansion of guest access or permission to take over an already-owned Request. Do not add a reason field, approval step or queue-order guard to bypass a higher-priority Request.

**Confirmed direction versus open mechanics:** current ownership and next-work priority are separate. Admin deprioritization changes the visible priority; it does not authorize interrupting active work, assigning a future person, overriding alignment or automatic priority scoring. Whether upcoming priority is one selected Request or an ordered list, and how its initial position is established, remain design decisions. Priority is separate from the existing Open → In Progress → Done lifecycle, not a new status. Consider “Suggested next” or “Priority” in the UI; avoid wording that guarantees what will be picked next.

**Contract reconciliation before implementation:** `REQUIREMENTS.md` §4.6 includes earlier future assignment and start-window behavior. The new shared-view intent must guide this review, but do not silently rewrite all assignment/alignment rules or outcome review windows. Record the precise launch behavior once queue and pickup mechanics are settled, then reconcile affected canonical requirements before changing code.

**Success to validate:** before approaching a designer or escalating to the design head, a stakeholder can understand existing commitments and discuss the tradeoff using the same visible information. Visibility supports the conversation; it does not automatically decide every priority conflict. No utilization, activity tracking, automatic ranking or personal performance scoring is implied.

**Authority, visibility and pickup questions answered:** the design head has escalation authority; the everyday view should expose current work/owners and suggested next work. Pickup remains a free choice within existing access rules. The founder's chosen mechanism is visibility and guidance, not mandatory queue enforcement.

**Phase 1 exit:** record one primary audience and problem, one observable useful result, the current-capability launch promise, and what stays outside this launch. Confirm those choices with Nikhil, then open the Phase 2 welcome/Intake review. No app code changes are part of this discussion draft.

### Composer follow-up — Projects and Request type (2026-10-05)

- **Confirmed Project meaning:** Nikhil proposed ongoing work areas such as App, Website, Marketing, B2B App and B2C App. Treat these as user-named workspace groupings, not a fixed list of product types or a new delivery lifecycle.
- **Confirmed creation authority:** when asked whether admins alone or anyone should create Projects, Nikhil answered **“anyone.”** Do not require an admin or a PM/Designer/Developer profile label to create one. Workspace membership remains the tenancy boundary; creating a Project does not grant access to other people's restricted Requests.
- **Approved interaction:** a searchable Project picker in New Request; create a Project by name from the picker and select it without leaving the draft. Show existing matches to help prevent accidental duplicates. One optional Project per Request and filtering within All Requests. Project grouping does not assign someone, set priority or start work. The data contract supports an optional short description without adding another creation step.
- **Approved Request type:** one optional, clearable choice of **Bug, Improvement or New feature**, initially unset. These describe the kind of change; they are separate from the required AI problem/solution/hybrid classification. Generic multi-select Labels and labels for platform/area/quality concerns are outside this increment.
- **Decision status:** Nikhil authorized this bounded implementation with “now make the changes.” Canonical requirements now record the persistence/access exception. Implementation and verification evidence live in [the Projects and types plan](2026-10-05-request-projects-and-types.md); no separate project-management screen is authorized.

## 1. Scope and decision discipline

- The user has reopened positioning, flow and even the core idea for discussion. Earlier product decisions are evidence to examine, not a reason to dismiss a proposed improvement.
- A proposal is not a decision. Record changes to product behavior or terminology explicitly before implementing them, then reconcile the relevant canonical documents. Do not silently replace the existing core idea or build the unimplemented alignment/outcome pipeline.
- Separate current implementation, previously approved future direction, new hypotheses and verified user evidence. No fabricated customer insights, testimonials, conversion metrics or impact claims.
- Remove an element when it does not help the current task, a real decision, recovery, trust or accessibility. Repeated guidance is a candidate for removal; rare but essential error and permission states are not.
- Do not equate a minimalist screen with low user effort. Fewer fields can still create more clarification later. Test the whole handoff.
- New routes, tables, AI calls, provider/security changes and integrations need a specific recorded decision. No automatic expansion from this review.
- Preserve the no-surveillance principle, shared functional-role experience, workspace isolation and private attachments. Never solve UX friction by weakening a guard.
- Work in this Codex task and Storybook. One agreed page increment at a time; no static replacement prototype presented as application code. No automatic commits, pushes, deployments, paid upgrades or customer invitations.

## 2. Foundation workshop — in progress

Resolve these before finalizing a page's job or launch claim:

1. **Audience:** who can Nikhil recruit for the first 5–10 teams, who feels the pain, who submits Requests and who does the work? Product docs currently name product/design leaders as buyers and PM/Designer/Developer as users; this is not customer validation.
2. **Pain:** what happened in a recent real request that cost that team effort? Where did it arrive, what was missing, who chased the context, and what did they do instead?
3. **Reason to choose Lane:** what useful result should happen here that a form, chat thread or existing tracker does not already give that team? Challenge the AI framing step against that result.
4. **First value:** what must a submitter and a recipient understand after the first Request? A saved row or completed signup alone is not evidence of value.
5. **Market scope:** decide whether this release is the existing free pilot or a paid launch. Keep the current pilot/operational requirements visible until a deliberate change is made.

### Starting hypothesis — not agreed positioning

For design leads in product teams receiving unclear asks, Lane helps turn a design request into a problem the team can understand and act on, with the original context preserved.

Possible plain-language promise for discussion: **“Turn unclear design requests into problems your team can act on.”** This is a proposed direction, not final marketing copy or evidence of reduced rework.

The current app supports Intake, confirmed framing and Open → In Progress → Done. Expected impact creation, signed review and saved detail are implemented and locally verified. Cross-functional agreement, release measurement and outcome closure are approved future direction, not current capabilities to promise at launch. If we choose those as the launch reason to buy, we must explicitly choose a different scope and schedule.

## 3. Page-by-page order and complete coverage

The source-checked state checklist is [Phase-0 UX skeleton, Part B](../../../phase-0-ux-skeleton.md#part-b--screen-inventory--states), refreshed 2026-10-06. It covers all **10 current Lane page routes**, the marketing homepage, Clerk-owned steps, dialogs and nested recovery states. Part C describes the confirmed target, including the subsequent impact/ownership clarification. `/auth/callback` is a transition, not another product page. Use that checklist as the single state inventory; do not treat older plan tables as a competing order.

**End-to-end journey:** signup or invitation → verification → workspace setup → role → empty Requests → New Request → preparing review → human review → create → upload/recovery if needed → saved arrival → populated Requests → Request detail → pickup/discussion/completion. Login/password recovery, invitations, notifications, Members and Profile are connected branches, not screens to silently omit.

**Next design sequence after the foundation clarification:**

1. **Expected impact in creation:** Metric or Verified result, source/method, days after launch and optional unknown baseline are implemented and locally verified. The initial prediction is preserved through signed review and saved detail. The four vague research questions remain removed and AI does not invent targets.
2. **Request review (R1–R6):** implemented and locally verified: original/AI-suggestion/mixed branches, selected link/files, back/edit, loading, failure, expiration and source-bound correction preservation. Visual acceptance remains with Nikhil. Current AI reads title/description only; human review is not trio agreement. See [the bounded implementation](2026-10-06-request-review.md).
3. **Save and arrival (S1–S4):** preserve saving/upload recovery and reliable navigation. The new target arrival is a saved Request awaiting alignment, not permission to start merely because creation succeeded.
4. **Saved Request and agreement:** named PM/Designer/Developer, missing participants, waiting, specific concerns, all aligned and material changes requiring realignment. Carry the expected result and measurement window into the same record. Current pickup-to-In Progress is not the target guard.
5. **Work, readiness and launch:** define how existing pickup/comments/files (W1–W6) connect to agreed progression, readiness and actual audience/release date. Work finished is different from launched and outcome closed.
6. **Actual results and closure:** submitter-owned due review, actual versus expected, evidence, learning, overdue/unavailable results, documented exceptions and permanent closure/follow-ups. Define the complete chain now and implement coherent bounded increments.
7. **Product/journey and quarter/year view:** define the shared journey record and links alongside these steps; derive period reporting from the same Request outcomes, with explicit period basis, compatible metrics, overlap handling and exceptions shown separately. No new screen or aggregation formula is selected yet.
8. **Supporting paths and rehearsal (A1–A7, E1–E5):** complete notifications, Members/invitations, Profile, login/recovery and shared navigation checks; run first/invited/returning user journeys and align marketing with the implemented release. Inspect shared navigation throughout.

The first-entry steps remain before Intake in the user's journey. Continuing from the currently accepted composer does not declare those earlier screens or release gates complete. The bounded Expected impact code is recorded in [its implementation plan](2026-10-06-request-expected-impact.md); this status update does not authorize the remaining target sequence.

## 4. The working loop for every page

1. **Inspect:** open the real current page or production-component Storybook state, follow its entry/exit paths, and read the controlling source. Separate verified behavior from a usability hypothesis.
2. **State its job:** who arrives, what they know, the one primary outcome and what must be visible to get there.
3. **Bring a concrete proposal:** current versus proposed copy, a keep/change/remove list, and the proposed sequence when the flow changes. Show why each removal helps, including any lost information or recovery.
4. **Decide together:** Nikhil resolves the material product/flow choices. Routine implementation details follow that decision; do not ask for the same authorization again.
5. **Implement the agreed page:** reuse the actual installed ReUI source/APIs; disclose a source gap before substituting a custom control. Keep behavior outside the decision intact.
6. **Prove the result:** render whole-page desktop/light and phone/dark views; verify keyboard/focus, accessible names, error/recovery, content preservation and relevant permissions. Add or adjust meaningful behavior tests for flow changes; do not add tests that only mirror wording. Inspect at 200% zoom and with realistic long/empty data where relevant.
7. **Record and close:** mark implemented, locally verified, user-reviewed and deployed separately. Carry open issues into the ledger with a reason and trigger. Show the updated page, then start the next review.

Each page record contains: current evidence; job; candidate copy; keep/change/remove decisions; exact source files; state checklist; user decision; verification evidence; remaining limitations. Write detailed implementation steps only once that page's direction is settled.

## 5. First page review — historical starting point

**Historical observation before the subsequent welcome simplification:** the admin welcome showed a page introduction, a second introductory heading and description, a create CTA, two helper paragraphs, an invite link, a three-step guide, and a collapsed example. Source: `src/app/(app)/requests-welcome.tsx`. Preview: [Requests welcome](http://localhost:6006/?path=/story/patterns-requests-welcome--admin).

**Job:** help a person bring a real design request into Lane and understand what will happen to it. Teaching Lane's whole method is secondary.

| Keep | Consider changing | Candidate to remove or move |
| --- | --- | --- |
| One obvious create action; honest optional-details guidance; accessible example; permission-aware invite access | Lead with the user's next action; explain when a Request is saved/shared; make the concrete example the optional explanation | Repeated “clarify the problem” introductions; the always-visible three-step lesson; repeated invitation explanation when the existing invite entry is sufficient |

**Candidate copy, not approved or applied:**

- Heading: “Start with a design request”
- Supporting line: “Describe what’s happening. Lane helps you clarify the problem before you share it with your team.”
- Primary action: “Create Request”
- Optional help: “See an example”

Judge the candidate after the audience/pain answers. It must not imply the AI understands or verifies the user's evidence. The proposal removes repeated teaching, not the user's ability to inspect an example or invite someone.

**Superseded sequence:** the separate optional-details step and pre-AI review were removed by the approved compact composer work. The four optional inputs and their pills were removed on 2026-10-06. Next is the single AI-result review, as recorded in §3. Existing AI confirmation remains required.

## 6. Evidence-backed questions for later page discussions

These are hypotheses to investigate, not a task list approved for automatic implementation.

- **Setup before value:** role selection is mandatory but says it changes no access. Is it needed before the first Request, or can it be collected at a more useful moment? Source: `src/app/(auth)/onboarding/role-form.tsx` and `page.tsx`.
- **Resolved extra steps:** Intake now goes `compose → checking → framing → creating`, followed by file upload/recovery when needed. The removed wizard is historical. Review the remaining AI confirmation and return paths, not a nonexistent optional-details step.
- **Resolved classification badges:** review and saved detail no longer display the internal classification labels. Review still has three meaningful variants and retains explicit AI attribution. Classifier values remain internal; do not reintroduce their jargon as UI copy.
- **Task context changes:** the overview is a flat table, while detail uses a grouped secondary list. Search/sort/page state is restored on return, but the detail context is different. Review with real navigation tasks before changing either composition.
- **Navigation redundancy:** current-workspace-only dropdown, sidebar and toolbar status filtering, multiple create/profile entries. Remove duplication only where it reduces confusion without damaging discoverability or mobile use.
- **Members label versus scope:** the Clerk host currently exposes Members and General. Decide what Lane intends to let people manage, while keeping provider ownership and privileges intact.
- **Data limits:** the latest-200 cap has no older-record navigation. Do not imply table pagination searches all history. Decide the pilot treatment using expected real workspace volume; backend changes are a separate explicit increment.
- **Product promise:** distinguish the current request-clarification/work-tracking loop from the unbuilt alignment-to-outcome contract. “Done” must not imply measured business success.

## 7. Validation and release gate

Proposed lightweight usability round: recruit five people from the chosen audience, including requesters and recipients where possible. Use their own recent design requests with consent. This is qualitative issue-finding, not statistical proof of market fit; do not add product analytics or tracking infrastructure as a side effect.

Ask each person to explain what Lane is for, submit a Request, review/correct the suggested framing, find the saved item, understand who can see it and what happens next. Ask a recipient to find the context, comment and progress the work. Observe hesitation, errors, lost context and needed facilitator help. Have users describe whether they would use the result in their existing workflow and what it replaces; record refusals as useful evidence.

Before public release:

- [ ] Every page above is either reviewed/verified or explicitly removed by a recorded product decision, including nested and failure states.
- [ ] No unresolved issue that blocks a core task, loses entered data, misrepresents saving/sharing, or crosses a permission boundary.
- [ ] The landing-page promise matches implemented behavior and the chosen audience can explain the value in their own words.
- [ ] Full signup/invite/recovery/first-Request journeys run on the intended release environment; production cutover, workspace and private-file isolation have fresh evidence.
- [ ] Reconcile open launch items in `lane-roadmap.md`, `DEFERRED.md` and the Clerk cutover plan. Existing test passes and a polished UI do not close these gates.
- [ ] Choose free pilot versus paid launch explicitly. Keep the documented hosting/backups/payment requirements in force; do not purchase upgrades during this UX phase.
- [ ] Prepare release verification, rollback and a usable support/reporting path using existing approved capabilities; obtain deployment authorization separately.

## 8. Implementation/documentation map

- Page implementation and state owners: `src/app/(app)/requests-welcome.tsx`, `src/components/requests/tasks/`, `src/components/requests/detail-view.tsx`, `src/app/(app)/intake/intake-form.tsx`, `src/components/auth/`, `src/app/(auth)/`, `src/components/settings/`, `src/components/shell/`, `marketing/app/page.tsx` and `marketing/components/`.
- Live state evidence: existing `src/stories/` and the page/state matrix in `docs/superpowers/plans/2026-10-02-reui-page-flow-migration.md`. Add relevant examples beside the owning stories after a decision; do not claim fixture checks verify provider workflows.
- Once decisions change: update `PRODUCT.md` for audience/promise, `REQUIREMENTS.md` for behavior, `lane-roadmap.md` for release scope, `phase-0-ux-skeleton.md`/`conventions-plan.md` for journeys, and `DEFERRED.md` for consciously postponed issues. `DESIGN.md` remains the ReUI/icon/colour authority.
- Existing docs contain historical board/grouping, navigation and visual-language descriptions. Reconcile affected sections when a decision is confirmed; do not use an old description as proof of current UI.

## 9. Progress and decisions

- [x] Read current product/delivery constraints and canonical planning documents.
- [x] Verify page count and inspect existing first-use copy and Intake sequence.
- [x] Start audience/pain discovery with Nikhil; initial pain account received, recruitable audience still open.
- [x] Record Nikhil's reported pain around unilateral requests, priority pressure, evidence and missing outcome follow-through; recruitable audience remains open.
- [x] Record current ownership, advisory priority, admin deprioritization and free pickup; no predicted next assignee or schedule.
- [x] Draft the first Requests-welcome keep/change/remove proposal.
- [ ] Agree audience, primary pain, first value and launch scope.
- [x] Implement the bounded Requests/welcome copy and hierarchy pass after Nikhil's “go ahead”; verify locally as recorded below.
- [ ] Complete first-time journey acceptance and hosted rehearsal: signup/verification, workspace create/join, role selection and empty Requests. Do not infer full completion from the approved composer.
- [x] Compact New Request composer implemented and locally verified; accepted by Nikhil on 2026-10-06.
- [x] Implement the separately approved Expected impact creation → signed review → saved-detail increment locally.
- [x] Complete Expected impact local validation and user review; the cleaned composer was accepted. Named trio agreement, launch, actual-result closure and quarter/year totals remain target only.
- [x] Refresh the source-grounded state checklist and record review as the next screen.
- [x] Implement and locally verify the authorized R1–R6 review increment beyond the Expected impact summary.
- [ ] Accept the review preview, then address save/upload recovery and saved arrival (S1–S4) before named-trio agreement.

The initial planning pass changed no app code. The following bounded implementation is now available for review; this does not mark the entire UX phase complete.

## 10. Requests initial copy/hierarchy pass — local implementation

**Scope:** existing Requests overview and first-use welcome, retaining the installed ReUI DataGrid, Empty and Accordion compositions. No new priority storage, queue action, route or permission. The shared shell, layout geometry and pickup behavior are preserved.

- Removed the overview's redundant “Here’s a list…” introduction; kept the guest visibility explanation.
- Moved the existing assignee column ahead of the submitter and labeled it “Owner.” The internal `pickedUpBy` column ID stays stable so saved visibility/sorting state survives. Missing owner names on In Progress/Done read “Unknown member,” rather than implying that the Request has not been picked up.
- Renamed “View” to “Columns” and filter-reset actions to “Clear filters.” The title field now says “Filter by title…” and has a matching accessible name. Filtering behavior still covers the displayed Request title/problem, not people or the complete Request body.
- Updated return-focus recovery to use the filter's new accessible name.
- First-use now has “No Requests yet,” a consistent “New Request” action and the optional-details reassurance. Removed the always-visible three-step lesson and repeated invitation explanation. Kept the admin invitation action and collapsed, explicitly illustrative example with its uncertainty caveat.
- “Suggested next” remains a product decision awaiting its own precise data/action plan; no mock priority is shown as a working feature.

**Source review:** inspected the installed `c-data-grid-34`, `c-empty-1`, `c-accordion-1` examples and their existing local APIs. Re-read Plane's pinned `project-issues.tsx` empty-state distinction and list-row interaction source; no Plane code copied. Source URLs and hashes remain in `docs/design-system/reui-coss-sources.md`.

**Files:** `src/app/(app)/requests-overview.tsx`, `requests-welcome.tsx`, `request-workspace-keyboard.tsx`; `src/components/requests/tasks/columns.tsx`, `data-table-toolbar.tsx`, `data-table.tsx`; existing Requests/welcome stories and first-use test assertions.

**Fresh verification:** 22 desktop/light + 22 phone/dark browser cases and six existing first-use unit cases pass; scoped ESLint, TypeScript and production build pass. Two existing selectors/assertions still named removed controls and were updated before the final passing run. Logs are `.next-audit/requests-ux-copy-{desktop,phone,unit,lint,typecheck,build}.log`. No new tests that merely mirror copy were added.

**Visual evidence:** Requests and welcome inspected at desktop/light and phone/dark. Captures in `test-results/requests-ux-copy/`. Storybook contains the live production components: [Requests in shell](http://localhost:6006/?path=/story/patterns-requests--populated-in-shell), [first-use welcome](http://localhost:6006/?path=/story/patterns-requests-welcome--admin). The phone table retains the source's horizontal scrolling; this pass does not redesign that composition.

**Review boundary:** implemented and locally verified; user acceptance, priority functionality, provider end-to-end verification and deployment remain separate. The build does not establish that every repository test or launch gate passes.
