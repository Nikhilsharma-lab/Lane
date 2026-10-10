# Lane Master Product Requirements

> **Status:** Product contract, created 2026-08-14; inception-to-closure contract confirmed 2026-09-28.
> **Purpose:** Define what Lane must do, what it must never do, what is already shipped, and which future
> requirements still need approval before implementation.
> **Scope rule:** A requirement marked **Approved — current** is build authority within the current roadmap
> gate. A requirement marked **Approved — target** or **future contract** is a locked rule but not permission to
> build it before the roadmap gate changes. **Proposed** and **Unresolved** items are never build authority.
> **2026-09-28 authority:** Nikhil confirmed the pipeline and documentation reconciliation. Alignment inside
> Requests is the first increment to plan. Confirmation does not authorize application code, new schema/routes,
> integrations, extra AI calls, migrations, deployment, or the whole pipeline in one build.
> **2026-10-06 foundation clarification:** the shared product/journey record, impact prediction at Request
> creation, requester-owned actual-result closure, quarterly/yearly outcome summaries and three-party
> alignment are confirmed product requirements. Documented exception outcomes may close but are excluded
> from measured-impact totals. This strengthens the target; it does not claim those capabilities are live.
> **2026-10-06 implementation status:** Expected impact creation (Metric or Verified result), signed review
> and read-only saved detail are implemented and locally verified. Named trio agreement, launch,
> actual-result closure and quarterly/yearly totals remain target only.
> **2026-10-08 sequence selection:** Nikhil chose Request features first over starting trio agreement.
> The current bounded local increment is saved Request codes for list copying and workspace search;
> see `docs/superpowers/plans/2026-10-08-saved-request-codes.md` for its defaults and verification.
> Saved priority followed on 2026-10-09 (`0019`), as did Ask for review (`0018`). Hosted migration/release
> and the broader target pipeline are not implied; the launch sequence and its decisions are in
> `docs/superpowers/plans/2026-10-10-mvp-launch-linear.md` (accepted 2026-10-10).

This is the product-behaviour master, not a monolithic implementation plan. `AGENTS.md` remains the primary
repository instruction file. `lane-roadmap.md` controls sequence, `DESIGN.md` controls the visual system,
`phase-0-ux-skeleton.md` and approved Paper artboards control journeys and states, and focused implementation
plans control code changes. If those documents disagree, work stops until the conflict is reconciled.

---

## 1. Product thesis

Lane is a problem-first product operating system for product teams. It helps a team turn an unclear or
solution-shaped request into an understood problem, carry that problem through design and delivery, and learn
what happened after release.

**Two foundations, confirmed 2026-10-06:**

1. **One source of truth for the product and its journeys.** Requests, agreed decisions, current journey
   context, design/development references, release history and outcomes must connect in a shared record.
   A disconnected list of Requests does not fulfil this principle. The maintained journey representation
   and linking model still need a bounded design decision (§7).
2. **Expected impact compared with actual results.** Capture predicted impact when creating a Request,
   agree it before work advances, measure after launch over the decided window, and retain the comparison
   and learning. Show Request-level results and cumulative quarterly/yearly product results (§9).

Named PM, Designer and Developer agreement governs progression across this chain. The submitter owns
recording results and closing the Request, even when a different person is its named PM. The comparison
supports understanding team/product effectiveness; it is not a prediction-accuracy or employee score.

Lane is built on one belief: **surveillance produces performance; support produces truth.** It may measure the
health of a Request and the effectiveness of a workflow, but it must never rank, score, time, or profile an
individual PM, designer, or developer.

### Permanent product principles

- The problem is the unit of attention; a requested solution is not accepted as the problem by default.
- The same product view is available to PMs, Designers, and Developers. These are editable functional labels,
  not permissions.
- Humans own interpretation, ethics, taste, craft, predictions, and final decisions.
- AI may clarify, organize, challenge, summarize, and prepare reviewable work. It may not silently decide for
  the team.
- Truthful uncertainty is valid. Lane must not pressure people to fabricate evidence or impact numbers.
- Lane connects the product-development journey; it does not replace specialist tools that already perform a
  job well.
- One user-touchable, independently testable increment is shipped at a time.

### Permanent refusals

- No time tracking, last-active indicators, utilization, velocity, worklogs, activity heat maps, or individual
  performance dashboards.
- No PM calibration scores, designer rankings, developer rankings, leaderboards, or prediction-accuracy
  profiles tied to people.
- No role-specific dashboards or hidden actions based on PM / Designer / Developer labels.
- No mandatory linear design process, mandatory design diary, or continuous text logging.
- No autonomous agent output that cannot be inspected, edited, rejected, or traced to its inputs.
- No feature merely because Plane, Lane Archive, or another product contains it.

---

## 2. Users and access model

### Functional labels

Every profile has one editable label:

- PM
- Designer
- Developer

The label describes the person's usual contribution. It does not change screens, data visibility, lifecycle
actions, or collaboration rights.

### Workspace permission tiers

- **Admin:** Clerk organization administration and membership control.
- **Member:** participates in the shared Request workflow.
- **Guest:** sees and comments on only their own Requests; cannot pick up work or access Members.

Clerk is the sole authority for users, sessions, organizations, memberships, roles, and invitations. Identity,
active organization, and organization role are always derived from the Clerk session; client-supplied user
identifiers are never trusted. Lane does not duplicate Clerk membership or invitation state in Postgres.
Every read and write is constrained to the active Clerk organization. Guest remains conditional on a Clerk
plan that exposes a production `org:guest` custom role.

### Responsibility versus permission

Responsibilities belong to a Request creator, named PM / Designer / Developer participants, current assignee,
or explicitly transferred outcome owner. These are Request-scoped responsibilities, not new global roles.
Changing a profile label never grants an alignment seat or closure authority. Only the creator (or an
explicitly transferred outcome owner) closes the outcome; PM is not a permission gate.

---

## 3. Product scope and authority

### Approved — current implementation scope

The current implementation is the Requests loop. This inventory is not a production-readiness claim: the
Clerk cutover record still requires hosted invitation-return and production verification. Read
`docs/superpowers/plans/2026-09-24-clerk-clean-cutover.md` for environment-specific release evidence.

1. Clerk authentication: sign up, email verification, sign in, password recovery, and invite acceptance.
2. Onboarding: Clerk organization creation or invited-organization activation → functional label → Requests.
3. Intake: title, freeform description, Expected impact (Metric or Verified result), optional Project, Request
   type, related link, private attachments, and the AI problem gate. Expected impact is implemented locally
   through signed review and save; local checks passed.
4. Requests board: one shared workspace board grouped Open / In Progress / Done, with an optional status
   filter, saved `LAN-n` codes, saved priority, and the workspace search pane (`/`) for Requests by code
   and title.
5. Request detail: problem, supporting context, saved Expected impact, assignment, lifecycle actions,
   attachments, comments, and Ask for review (named teammates respond in place; see
   `docs/superpowers/plans/2026-10-09-ask-for-review.md`). The Expected impact summary is implemented and
   locally verified.
6. Members and invitations: Clerk Organization Profile owns invitations, delivery, resend, revoke, roles,
   and membership changes. Lane supplies no parallel invite tokens or membership mutations.
7. Profile settings: editable functional label and browser-local System / Light / Dark preference.
8. Invited-guest isolation and lightweight in-app notifications supporting the Requests loop.

### Approved — target contract, confirmed 2026-09-28; not fully implemented

The confirmed journey is:

**Create and name participants → Align → Schedule and explore as needed → Confirm build readiness → Build →
Confirm release readiness → Release → Measure → Creator closes → Follow-up Request if further work is needed.**

- Named PM, Designer and Developer participants must align before prioritization or execution. A recorded
  disagreement blocks progression; neither the creator nor an administrator may override it.
- Discovery and delivery are different commitments; exploration is nonlinear and requires no design diary.
- Assignment is separate from alignment and authorization to start.
- Expected impact is recorded at creation and forms part of the trio's agreement. One primary success
  criterion, relevant guardrails, complete build/release readiness and evidence support delivery. Numeric
  impact is not compulsory where an observable acceptance criterion is more appropriate.
- Active-work completion and outcome closure remain separate. The creator owns closure, including truthful
  exceptions. Closed never reopens; further work uses a linked follow-up with fresh alignment and ownership.
- Overview / Work / Build / Outcome may organize information without becoming mandatory workflow stages.
- Quarterly/yearly outcome summaries are confirmed target scope, derived from Request records with
  compatible metrics and no duplicate attribution (§9); no separate reporting route is selected yet.

Expected impact creation/review/detail is the current bounded local implementation, with validation in
progress. Alignment inside existing Requests remains a separately scoped target; its bounded design, schema
proposal, acceptance tests and implementation plan must be approved before coding. Later parts of this target are
sequenced in `lane-roadmap.md`, not independently authorized by this contract.

### Explicitly not authorized yet

- Any alignment, readiness, outcome, amendment or follow-up storage/screens, or success-criterion work beyond
  the approved Expected impact creation/review/detail increment, before the relevant focused plan is approved.
- Handoff briefs, iteration summaries, prediction confidence, or individual calibration.
- Figma, analytics, GitHub, Linear, or other product integrations.
- Agent workflows beyond the shipped Intake gate.
- New design-stage, phase, track, initiative, epic, or custom-workflow systems.

The target contract replaces the older claim that Request-level outcomes are merely an unselected idea.
It does not lift unrelated feature bans or authorize agent workflows. Validate each increment before the next.

---

## 4. End-to-end Request journey

### 4.1 Create the Request — Approved current

Anyone allowed by workspace access may submit a Request. The Request begins with the underlying problem, not
a prescribed interface or implementation.

Current Intake supports:

- A short title.
- A freeform description of the need or observed problem, including any useful context or feedback.
- Expected impact as Metric or Verified result, preserved through signed review and saved detail; locally
  implemented and locally verified. Current value may remain unknown; drafts may remain incomplete.
- Optional Project and Request type.
- An optional **Add link** control revealing the **Related link** field.
- Optional private attachments.

**Compact New Request decision — 2026-10-06:** the new form does not ask for affected people, desired
change, observed evidence or uncertainty in separate inputs, and has no Details or Feedback & links pills.
People can include that context in their description. Existing saved Request context and the four legacy
data keys, draft schema and signed-review tokens remain intact; nonempty earlier draft values appear in a
read-only **Details from your earlier draft** section during composition and review. This is a form
simplification, not a deletion of the target alignment/readiness/evidence contract or a backend migration.

A PRD, research file, design brief, or other document may support a Request but is never universally required.

**Approved bounded increment — 2026-10-05:** Projects are persistent workspace work areas such as B2B App,
B2C App, Website or Marketing. Anyone in the active workspace can create one from the Request composer.
Each Request may have one Project and one Request type (Bug, Improvement or New feature), both optional and
unset initially. Project grouping does not assign people, set priority or start work. Request type does not
replace or predetermine the AI framing classification. Preserve guest own-Request access when exposing
Project options. The approved implementation covers persistence, composer selection/creation and display/
filtering in existing Requests views; no separate Project management page. See
`docs/superpowers/plans/2026-10-05-request-projects-and-types.md` for implementation and verification status.

### 4.2 Pass the AI gate — Approved current

Before saving, the Intake gate classifies the submission as:

- Problem
- Solution
- Hybrid

For a solution or hybrid, Lane proposes a problem-framed version and explains why. The submitter may edit the
reframe and must confirm it before saving. The gate must preserve the submitter's meaning, expose uncertainty,
and fail recoverably. It must not fabricate user evidence.

### 4.3 Save and expose the Request — Current implementation; target constraint added

An accepted Request appears on the shared board. Every non-guest member sees the same board and may open the
same Request. A guest sees only Requests they created; no broader guest entitlement is approved.

Saving does not authorize execution under the confirmed target. A Request may remain Open while waiting
for alignment or, once aligned, while waiting for capacity. Naming participants before agreement is allowed;
commitment to roadmap work, formal discovery and delivery execution are blocked until alignment.

### 4.4 Name the trio and align — Approved target

Every team Request has a named PM, Designer and Developer. A creator representing one discipline names the
other two people for this Request. The three participate upstream, not as reviewers of finished design.
Workspace membership remains the access boundary; Request participation is not inferred from profile labels.
The exact guest-created Request sponsorship path must be resolved before that path enters implementation.

Use one compact shared agreement, reusing Intake and existing evidence rather than requiring separate briefs:

| Subject | What the team agrees |
|---|---|
| Problem and audience | Who is affected, what is happening and why it matters. |
| Scope | What the Request covers and explicitly excludes. |
| Success and guardrails | Expected result, evidence and relevant things that must not deteriorate (§4.5). |
| Timing | Discovery timebox or delivery commitment, why it matters and any dependencies. |
| Complexity | Added user decisions/settings, technical maintenance, support burden and opportunities to simplify. |
| Unknowns | Uncertainty that matters and how it will be resolved. |

These are content requirements, not six mandatory essays or a fixed field layout. Links and existing artifacts
may supply context. Complexity has no mandatory numerical score.

Two valid commitments:

- **Discovery:** align on the problem, boundaries, questions, timebox and evidence that would justify building.
  No speculative delivery date may be presented as an agreed discovery commitment.
- **Delivery:** align on a sufficiently understood direction, scope, success criteria and timing. Existing
  evidence may make a separate discovery period unnecessary. Build readiness still applies (§4.8).

The creator's confirmed submission records their agreement to that version; the other two must explicitly
align. All three must agree to material subsequent versions. Final control labels are a UX decision.

**Disagreement is a hard guard:**

- A dissenter records a short, specific reason explaining what must change before they can align.
- Discussion, clarification and amendments remain possible; progression to the next commitment does not.
- Silence, elapsed time, assignment, creator status and administrator status cannot supply agreement.
- No administrator override, automatic timeout approval or creator bypass is permitted. Enforce on the server.
- The team revises the agreement and obtains fresh alignment; preserve the original concern and resolution.
- Departure or unavailability may require attributable participant replacement. The replacement must align;
  replacement never erases an unresolved concern or acts as a way to evade it. Recovery details remain scoped
  implementation decisions.
- The creator may withdraw/stop a Request with a recorded reason. Agreement to proceed is not required to
  stop pursuing it; creator-owned truthful exception closure remains available.

### 4.5 Define success and preserve expectations — Approved target

**2026-10-06 timing clarification:** expected impact belongs in Request creation, including feature and
improvement submissions; it is not first collected after design or launch. The PM supplies the product
prediction when involved in submission. The submitter remains accountable for its recording and follow-through;
being a named PM or having a PM profile label does not transfer closure ownership. Drafts may remain incomplete.
The compact form now implements Metric or Verified result, source/method and days after launch, with an
optional unknown numeric baseline. The same snapshot is preserved through signed review and shown read-only
on saved detail. This bounded code is implemented and locally verified. Trio agreement, launch,
actual-result collection/closure and period totals remain target only.

Every delivery commitment has **one primary success criterion**. Secondary metrics are optional. Capture
the initial expectation and agree the measurement contract before progression:

| Item | Contract |
|---|---|
| Criterion | Specific change or observable result expected. |
| Starting point | Baseline, or a justified alternative where a baseline does not apply. |
| Target | Result that would meet expectations. |
| Evidence | Source and method for establishing the result. |
| Review window | When and over what period the outcome is assessed. |
| Guardrails | Relevant things that must not deteriorate, with acceptable limits. |

A numeric business prediction is not compulsory for every kind of work. A specific, verifiable acceptance
criterion with evidence is valid; “improve UX” is not. Use only relevant guardrails, not an arbitrary count.
During discovery, baseline unknown is valid. Before delivery commitment, the trio must establish a defensible
measurement approach. New capabilities may use an absolute target rather than a before/after baseline.
Existing evidence can be linked; no mandatory report or particular research/testing method is introduced.
An unknown baseline is explicit, not a fabricated zero or permission to omit the intended result. The
discovery/bug handling and creation validation need to preserve this distinction in the focused design.

Alignment records the agreed version. Before release, material changes to problem, scope, timing, success or
guardrails preserve the previous version and require renewed alignment. Routine exploration within that
agreement does not. After release, targets cannot be rewritten to match observed results. AI must not invent
targets, baselines or evidence; additional AI capability beyond Intake still requires separate authorization.

### 4.6 Assign and schedule — Current behaviour versus approved target

**Current implementation:** an eligible member picks up an Open Request; this assigns it to that person and
moves it to In Progress. No trio alignment currently guards this action.

**Confirmed target:** the Request creator may assign the Designer; an eligible Designer may volunteer through
Pick up when unassigned; an administrator may assign. One accountable Designer is assigned at a time, while
other people may contribute. Self-pickup must not take an existing assignment from someone else. Assignment
does not start work, accept a deadline or supply alignment. A replacement Designer must acknowledge the
current agreement; profile labels do not become global permissions.

The trio agrees a start window. Administrators help resolve competing capacity commitments but cannot waive
alignment. No automatic ranking, prioritization score or separate Roadmap screen is authorized. Aligned is
not the same as scheduled. The exact assign/accept/start UI and concurrency-safe transition contract belongs
in the focused implementation plan.

### 4.7 Explore and converge — Approved target

Design work is exploratory and nonlinear. Lane must not require Sense / Frame / Diverge / Converge / Prove,
or any other fixed sequence.

The intended work model is artifact-led:

- Designers continue to explore in the tools appropriate to the work.
- Lane may reference research, flows, prototypes, designs, experiments, and decisions.
- Continuous manual narration is not required.
- Meaningful decisions can be recorded concisely with existing artifact links. AI-prepared snapshots remain
  a separately gated future capability; they are not required for this pipeline.
- The history records meaningful decisions, not performative activity.

Design, product and engineering remain involved throughout. Data contributors may help establish baselines,
instrumentation and interpretation without becoming a fourth mandatory approver or new global role.
Material changes use the amendment rule (§4.5); routine design iteration does not create a follow-up Request.

### 4.8 Confirm complete build readiness — Approved target

Lane should show the connection between the problem, selected direction, and implementation without becoming
an engineering tracker. Source code, pull requests, deployment operations, and engineering task management
remain in their specialist systems unless a later integration is explicitly approved.

Before production implementation of the agreed release:

- The trio has aligned on the current agreement.
- Scope, exclusions and acceptance criteria are clear.
- Relevant flows, designs and edge states are available.
- Technical approach and dependencies are understood.
- Success criteria, guardrails and measurement responsibilities are defined.
- Timing is agreed and no unresolved blocking concern remains.

Completeness applies to the agreed release, not every future capability. Prototypes and technical experiments
can occur during aligned discovery. Use existing links, evidence and concise confirmations rather than
duplicating design or engineering documents. Irrelevant checks may be marked not applicable with a brief
explanation; a failed relevant check may not be relabelled not applicable. The trio confirms readiness;
there is no administrator bypass.

### 4.9 Confirm release readiness and release — Approved target

Before the stated release:

- Agreed scope is implemented and verified, with no unresolved release-blocking defects.
- Relevant accessibility, security, performance and regression checks are complete.
- Measurement/instrumentation works and has been verified.
- Audience, rollout, rollback/recovery and operational ownership are clear.
- The trio confirms readiness for that release; existing evidence supplies the check, not a new report.

Record what became available, to whom and when, the extent of rollout, supporting release evidence and known
limitations. A merged PR or deployment alone does not prove customer exposure. PM coordinates product launch
and follow-through, engineering owns deployment in its tools, and design checks the implemented experience.
Links do not imply automatic integrations or release automation. Partial-release representation and control
details must be resolved in the release increment's plan before implementation.

### 4.10 Measure and close — Approved target

The creator returns after delivery, records what happened, compares it with the original prediction, and
closes the outcome. The comparison belongs to the Request and workspace learning—not to a personal score.

**Confirmed 2026-10-06:** the person who submitted the Request owns this obligation, including when the named
PM is someone else. For ordinary measured closure, actual results, their evidence/source and the agreed
measurement period must be recorded first. A result below prediction is valid learning and may close;
exceeding the prediction is not required. An overdue review remains outstanding rather than auto-closing.
An explicitly recorded exception under §5 may close without a measured number and stays outside measured
impact totals. Lane records and compares supplied measurements; automatic analytics collection or causal
verification is not implied and no integration is authorized here.

Compare the original expectation, actual result and guardrails using the agreed source/window; record relevant
limitations. Existing data or verification evidence is enough when it meets the criterion. Lane must not
require a retrospective essay or imply causal proof from a before/after change alone. New post-release work
uses the follow-up contract (§5), even while measurement of the original Request remains open.

---

## 5. Locked lifecycle contract

The approved target maintains two connected lifecycles. Alignment/readiness are separate conditions, not
extra board columns or permission roles. Only the work lifecycle exists in the current implementation.

### Work lifecycle

`Open → In Progress → Done`

- **Open:** saved work not yet started; in the target it may be assigned, awaiting alignment or awaiting capacity.
- **In Progress:** active design, development, or delivery work.
- **Done:** active work has ended. Done does not mean the outcome has been measured or the Request has been
  fully closed.

Done may record a truthful completion reason:

- Released
- Cancelled
- Stopped
- Superseded
- Not launched

The existing implementation still lets eligible members pick up work and mark Done; guests may not. The
target replaces automatic start-on-assignment with §4.6 and must enforce alignment/readiness at the relevant
transition. Until that increment is implemented and verified, do not claim the new guards are live.

### Outcome lifecycle

`Not started → Measuring → Closed`

- **Not started:** no outcome measurement is currently underway.
- **Measuring:** the delivery has entered its agreed observation window.
- **Closed:** the creator has recorded a measured result or a truthful exception outcome.

A Request may close with:

- Measured result
- Inconclusive result
- Measurement unavailable
- Not launched or cancelled
- Rolled back
- Superseded by another Request

Every non-measured closure requires a reason in plain language. The interface must not visually shame or
deprioritize exception outcomes.
**Reconfirmed 2026-10-06:** these exception outcomes are separate from measured results and excluded from
measured-impact totals; display their counts and reasons separately so period reporting does not hide them.
Measured results may be positive, neutral or negative; Closed never means successful by default. An unlaunched
or cancelled Request may close directly from Not started with its reason, without a fabricated Measuring step.

### Closure ownership

- The Request creator owns outcome closure.
- Functional label does not grant closure permission.
- If the creator leaves or loses access, a Clerk organization admin explicitly transfers outcome ownership to another
  active member.
- Transfer must be visible and attributable; it may not happen silently.
- The exact administrative recovery path is a future implementation decision.

### Closed is permanent; corrections are append-only — Confirmed 2026-09-28

A Closed Request cannot reopen. Preserve its closure snapshot, commitment, outcome and evidence. Factual
errors may receive an attributable append-only correction displayed beside the original; never silently
overwrite history. A typo or mistaken evidence link is not new product work and must not inflate follow-up
counts. Correction authority and presentation must be specified before implementation.

### Amendments and follow-up Requests — Confirmed 2026-09-28

| Situation | Treatment |
|---|---|
| Routine exploration within agreed scope | Continue the same Request; no branch or change form. |
| Material change before release | Preserve the previous agreement, record the amendment and realign. |
| New work after release or closure | Create a linked follow-up Request; the predecessor is not reopened. |

The user-facing action is **Create follow-up Request**, not a Git-style branch/merge workflow. A follow-up
links back to the original Request and references useful problem context, artifacts and outcomes; it states
what changed and why, has its own creator/participants/success criterion and obtains fresh alignment. Its
creator owns its closure. Context can carry forward; approval and outcome completion cannot.

The original remains Closed if closed, or keeps its outstanding measurement obligation if still Measuring.
When subsequent work changes the measured experience, record the effect on the earlier measurement and its
limitations; never silently attribute the same result independently to both Requests. Use truthful exception
closure if the earlier result is no longer interpretable.

Reasons such as new requirement, new evidence, defect or changed dependency/constraint explain the relationship.
Track amendments and follow-ups at Request level, not as personal blame or quality scores. Necessary learning
and preventable rework are not equivalent. No automatic classification, rankings or analytics dashboard is
authorized by recording this history. Exact relationship storage and UI remain implementation-plan decisions.

---

## 6. Request information architecture

The current Request detail remains the shipped authority. The following future organization is an approved
concept for Paper exploration, not a route or schema instruction:

### Overview

- Confirmed problem frame.
- Creator, assignee, and lifecycle.
- Named trio, current agreement, unresolved concerns and alignment/readiness when implemented.
- Affected audience and evidence.
- Expected-impact summary implemented locally in existing detail; local checks passed. Actual-result
  collection and comparison remain target only.

### Work

- Referenced research and design artifacts.
- Meaningful, human-confirmed decision snapshots.
- Open questions and relevant evidence without a mandatory diary.

### Build

- Selected direction and implementation context.
- References to external engineering work and release evidence when explicitly supported.
- No duplicate issue tracker or source-control system.

### Outcome

- Original prediction.
- Measurement window and source.
- Actual result or truthful exception.
- Comparison and concise Request-level learning.
- Creator-owned close action.
- Closed snapshot, attributable corrections and follow-up links when implemented.

These labels are information views, not a new lifecycle, permission model, or mandatory process.

---

## 7. Large features and customer journeys

The proposed unit of work is one independently measurable product bet per Request. A complete customer
journey may remain one Request only when it has one primary problem, one creator, one release decision, and
one outcome contract.

When different journey moments have independent problems, releases, or success measures, they should become
separate Requests. Lane must not introduce initiatives, epics, or a project hierarchy merely to contain them.

**2026-10-05 exception:** the explicitly approved flat Projects in §4.1 group Requests by ongoing work area.
They currently add no initiative/epic hierarchy, project lifecycle or outcome rollup. The 2026-10-06 target
adds product/Project-level period summaries (§9); it does not authorize a hierarchy or new Project route.

**2026-10-06 foundation:** Lane must be the shared product/journey record, showing how Requests and their
decisions/results relate to the experience people use. The current journey and its change history must be
distinguishable. Decide whether the authoritative journey is maintained in Lane or referenced through a
versioned external artifact, and how Requests attach to its steps, before creating new storage or screens.
Do not claim the present Project picker or flat Request list already provides this capability.

**Resolved 2026-09-28:** follow-ups have an explicit predecessor link and fresh commitments (§5). This does
not authorize an initiative/epic hierarchy or a general-purpose relationship graph.

Still unresolved for independently scoped planning:

- The final unit-of-work boundary for large journeys and whether additional non-follow-up relationships help.
- How a journey-level artifact is referenced without creating a new Docs or Initiatives product.
- How to prevent fragmentation without turning Lane into a project-management hierarchy.

---

## 8. Agentic design-operations contract

### Approved principles

Future agents may assist with bounded procedural work such as:

- Organizing supplied context.
- Structuring research material.
- Identifying missing evidence, unanswered questions, and edge cases.
- Preparing a draft decision snapshot.
- Checking work against an approved design system.
- Suggesting an existing design-system component or flagging a genuine gap.

### Required safeguards

- Every input used is inspectable.
- Every output is reviewable, editable, and rejectable.
- The responsible human remains visible.
- No agent changes lifecycle, prediction, ownership, or closure without explicit confirmation.
- No agent invents research findings, metrics, customer evidence, or certainty.
- No hidden background automation, cron workflow, or external side effect is implied.
- Agent activity may be audited for safety and reliability but never used to surveil people.

### Unresolved before any agent build

- The first bounded task worth automating after Intake.
- The minimum company and design-system context required.
- How source provenance is displayed.
- What constitutes acceptable agent quality and failure.
- Which action requires confirmation at each boundary.
- The validation evidence required before expanding autonomy.

---

## 9. Learning without surveillance

**Confirmed target — 2026-10-06:** Lane shows predicted versus actual impact for each Request and cumulative
quarterly/yearly product outcomes. This is a foundation, not an optional generic analytics idea. Learning
is attached to Requests and shared product results; no person-level effectiveness score is authorized.

Reporting requirements for the bounded design:

- Derive reports from the same Request expectations, releases and outcomes; no second reporting form.
- Preserve the submitted prediction and each agreed revision. Never rewrite a target after seeing results.
- Compare the same metric definition, unit, audience and measurement window. Keep absolute change,
  percentage-point change and relative percent change distinguishable.
- Aggregate only compatible, non-overlapping results. Do not add different metrics, percentages or the
  same shared result attributed independently to several Requests into one invented total-impact score.
- Show measured results, still-due/not-yet-measured work and exception outcomes distinctly. Exclude
  exceptions from measured-impact totals without excluding them from the report's coverage.
- Show evidence, limitations and related Requests when contributions cannot be isolated. A before/after
  change alone is not proof that a specific Request caused it.
- Define the quarter/year basis (launch cohort or measurement period), reporting cutoff, deduplication
  and treatment of cross-period/shared results before implementation. No aggregation formula is approved yet.
- Support team learning from positive, neutral and negative outcomes; beating easy forecasts is not a
  valid standalone effectiveness score. Existing privacy/access boundaries apply to summaries too.

Other candidate signals, still requiring separate approval:

- Distribution of measured, inconclusive, unavailable, and not-launched outcomes.
- Recurring problem themes.
- Time spent by a Request in broad lifecycle states only when it cannot be used to rank people.

Permanently prohibited:

- Accuracy, speed, throughput, or effectiveness scores per person.
- PM, designer, or developer comparisons.
- Individual cycle-time rankings.
- Activity, presence, keystroke, or “last active” monitoring.
- Manager-facing views that expose an individual's behavioural history as performance evidence.

The phrase “designer effectiveness” or “PM effectiveness” must be interpreted as the effectiveness of the
supported process and resulting product decisions, never an employee score.
The confirmed amendment/follow-up record supports accountability for decisions; counts alone must never be
presented as evidence of an individual's performance or used to rank PMs, Designers or Developers.

---

## 10. Functional requirements for the current Requests scope

### Authentication and onboarding

- Email confirmation returns the person to the correct Lane environment and continuation point.
- Authentication failures expose a recoverable, specific state.
- **Approved 2026-09-24:** sign up → create/join a Clerk workspace → choose a PM / Designer / Developer
  functional label → enter Requests. The label remains editable and grants no permissions.
- Clerk Organizations uses **Membership required**. Clerk owns the pending `choose-organization` task;
  interrupted organization setup resumes through the existing `/login` route, not a parallel Lane flow.
- A pending or organization-less session cannot access Requests or save Lane's onboarding label. A valid
  active Clerk organization must exist first; current scope remains one workspace.
- Invitation and workspace-creation UI stays Clerk-owned; Lane does not recreate a post-create invite step.
- Invitation acceptance handles signed-out, wrong-account, expired, revoked, accepted, and workspace-limit
  branches.

### Requests and Intake

- A solution-shaped Intake cannot be saved without a confirmed problem reframe.
- Gate timeout and failure preserve the person's input and provide recovery.
- Attachments remain private and workspace-scoped.
- The board provides empty, loading, populated, filtered, and failure states.
- Request detail provides Open, In Progress, Done, loading, forbidden, and not-found states.
- Comments expose empty, posting, posted, and failed states without duplicate feedback.

### Membership and notifications

- Clerk organization admin/member/guest permissions are distinct from functional labels.
- Clerk owns email-bound invitations, delivery, resend, revoke, acceptance and membership state.
- Lane must recover routing/authorization failures without recreating invitation tokens or a parallel mailer.
- Older local-invite copy-link/Resend behaviour is historical, not a current Clerk implementation requirement.
- In-app notifications support the shipped Request loop without a subscriber/watch-all-activity system.

### Profile and theme

- Functional label changes do not change permissions.
- Theme offers System, Light, and Dark.
- Theme preference is browser-local under current scope.
- Night Studio is independently authored rather than mechanically inverted.

---

## 11. Enterprise-grade quality requirements

Enterprise-grade means trustworthy operation, not maximum feature count.

### Security and privacy

- Strict tenant isolation for every read, write, attachment, invite, and notification.
- Session-derived identity for every protected action.
- Least-privilege membership controls.
- No secrets in client code, logs, screenshots, commits, or chat.
- Safe handling of untrusted links, files, AI input, and output.

### Data and operations

- Migrations are canonical and run on Lane Staging before production.
- A verified manual export precedes every migration until managed backups exist.
- Failures are observable and recoverable without exposing sensitive details.
- Production and staging remain separate Supabase and Vercel projects.
- Vercel and Supabase must be upgraded before the first payment under the recorded pilot decision.

### Accessibility and interaction

- WCAG 2.2 AA is the floor.
- Every action is keyboard operable with a visible focus state.
- Colour is never the only state carrier.
- Loading, empty, success, error, forbidden, and disabled states are deliberately specified.
- Mobile behaviour preserves complete tasks, not merely scaled desktop layouts.
- Reduced-motion preferences are honored.

### Performance and resilience

- Common interactions provide immediate acknowledgement and prevent accidental duplicate submission.
- Lists fail gracefully at current caps and add pagination only at the recorded trigger.
- External service failure preserves valid local work wherever possible.
- User input survives recoverable network and AI-gate failures.

---

## 12. Frontend and design-system requirements

Arc UI is Lane's sole product design authority for layout, components, theme, typography, motion and
interaction patterns. `DESIGN.md` and the official Arc/Arc Pro skills define the visual implementation.
`REQUIREMENTS.md` remains the authority for Lane's product behavior and scope. Marketing is separate.

For every material frontend increment:

1. Inspect the actual Arc registry or licensed MCP source and its documented props.
2. Read the matching local `src/components/arc` source and the Lane behavior it wraps.
3. Specify the journey and relevant states in Codex/Storybook, including light and dark modes and meaningful breakpoints.
4. Compose Arc components with Lane actions, data and permissions; document any adaptation.
5. Verify keyboard, focus, accessible names, responsive behaviour, motion and relevant states.

Storybook is a reviewable local preview. Editing it does not update staging or production; only reviewed,
implemented, tested and deployed code changes the hosted product.

---

## 13. Delivery and validation model

### Permanent delivery rule

Ship one user-touchable, independently testable increment at a time. Each increment must be explainable by
Nikhil in plain English before it is considered complete.

### Increment workflow

1. Confirm the user problem and validation signal.
2. Update this requirement contract or a focused subsystem specification.
3. Resolve every product decision required by that increment.
4. Audit Arc source and local behavior; create Codex/Storybook states when material UI is involved.
5. Write a focused implementation plan with tests and exact file boundaries.
6. Implement test-first.
7. Verify locally and on Lane Staging.
8. Have Nikhil perform the user journey in plain language.
9. Obtain release approval and promote the verified increment to production.
10. Record what was learned before selecting the next increment.

### Validation gates

1. **Operational readiness:** authentication, isolation, recovery, deployment, and staging are trustworthy.
2. **Intake value:** real teams repeatedly use the gate and prefer the resulting problem frames.
3. **Requests workflow value:** the board becomes part of real work rather than a duplicate tracker.
4. **Alignment value:** the named trio can resolve concerns and agree a commitment without redundant documents;
   attempted progression without agreement is denied, including creator/admin and stale-version attempts.
5. **Next-problem evidence:** observed usage informs the next bounded increment of the confirmed pipeline.
6. **Outcome-learning validation:** teams return to record outcomes or truthful exceptions and find the comparison useful.
7. **Agent validation:** a separately approved bounded agent task saves effort without reducing human control.

Dates and enthusiasm do not advance gates. Evidence does.

---

## 14. Subsystem planning boundaries

The confirmed pipeline is not one implementation plan. Operational release gates remain prerequisites to
production. Expected impact creation/review/detail is implemented and locally verified.
**Trio alignment inside existing Requests** remains the next agreement scope to plan:
participants, compact agreement, recorded concerns and a server-enforced no-bypass progression guard.
Assignment/start separation and agreement versioning must be included wherever required to make that guard
truthful. Its plan must define exact schema, actions, states, Storybook coverage and regression tests before coding.

Later contract slices are scoped separately: the full success/evidence contract, nonlinear artifact context,
complete build/release readiness, measurement and creator-owned closure, immutable history/corrections and
follow-ups. Closure must not ship without its truthful exceptions and no-reopen/follow-up recovery contract.
The order of later releases is chosen from dependencies and observed use; it is not a dated delivery promise.
Workspace analytics and agentic operations remain separate, unselected hypotheses.

Only one subsystem may enter implementation at a time. Later plans consume the verified contract produced by
earlier increments; they must not pre-build speculative infrastructure. **2026-10-10:** this rule is waived
for Phase 1 (the speed foundation) of the MVP launch plan only; the Phase 2 page migrations return to one
increment at a time.

---

## 15. Decision ledger

### Locked

- Problem-first Intake with AI classification and submitter-confirmed reframing.
- PM / Designer / Developer are labels, not permissions.
- **2026-09-24:** workspace-first onboarding with Clerk Membership required; choose the functional label
  only after an active organization exists, then enter Requests.
- Work lifecycle remains Open → In Progress → Done.
- **2026-10-09:** Mark Done can be undone from the Requests list (and from Request detail once it is
  migrated, 2026-10-10) for 15 minutes after the move: the Request returns to In Progress and its Done
  notification is withdrawn. This is the undo of Mark Done, offered to the same members who can mark Done,
  not a reverse lifecycle move; Closed outcomes never reopen this way.
- **2026-10-09:** Saved priority (none, urgent, high, medium, low) is a triage signal members set from the
  list; it does not assign people or start work. Ask for review lets a member ask named teammates for
  feedback on a design reference inside a Request; responses are recorded in place.
- **2026-10-10 launch decisions** (`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md` §8, defaults
  accepted by Nikhil): a free, invite-only pilot for design leads at small product teams; server and
  database co-located in Tokyo (`hnd1` + `ap-northeast-1`); optimistic UI un-deferred as a launch
  requirement; early production cutover for one or two pilot teams, then one small increment per PR;
  read-only GET route handlers for search, reviewers, notifications and the unread count are approved as
  new routes; error monitoring, Speed Insights and an uptime monitor; Supabase Pro when real pilot data
  arrives; a filtered result count in the Requests toolbar; the Geist preview retired; the Linear-derived
  token values re-authored as Lane-owned tokens before any page sign-off; "Intake" names the flow and
  "New Request" the action and breadcrumb. The creation-to-outcome replan is a sketch session before
  Phase 2, not waived.
- Outcome lifecycle is separate: Not started → Measuring → Closed.
- Done does not mean outcome closure.
- The creator owns outcome closure; a Clerk organization admin may explicitly transfer responsibility if necessary.
- Truthful exception outcomes may close a Request: inconclusive, measurement unavailable, not launched or
  cancelled, rolled back, or superseded.
- Design work is nonlinear and artifact-led; continuous text logging is not required.
- No individual performance scoring or surveillance.
- Arc registry/MCP source → local Arc composition → Storybook → implementation → verification is the product frontend workflow.

**Confirmed 2026-09-28:**

- Named PM / Designer / Developer alignment before commitment or execution; a specific recorded concern blocks
  progression. No creator/admin/timeout override. Replacement cannot erase dissent (§4.4).
- Bounded discovery or delivery commitment; no mandatory linear exploration or diary (§4.4, §4.7).
- Creator assignment, unassigned Designer self-pickup and admin assignment; assignment is not start permission.
  The trio agrees a start window; admins help resolve capacity conflicts without bypassing alignment (§4.6).
- One primary success criterion, numeric or otherwise verifiable, with starting point, target, evidence,
  window and relevant guardrails; preserve versions and never rewrite post-release targets (§4.5).
- Complete readiness for the agreed build and release, using existing evidence and concise confirmations (§4.8–4.9).
- Closed cannot reopen. Use append-only factual corrections or a freshly aligned follow-up for new work;
  post-release follow-ups do not erase outstanding measurement (§5).
- Reconcile canonical docs now; plan alignment first. No application/schema/deployment changes authorized yet.

### Remaining focused design/implementation decisions

- Final interaction labels and compact field presentation; schema/action boundaries and stale/concurrent
  alignment protection; how blocking material edits are distinguished from ordinary edits.
- Guest-created Request sponsorship, participant absence/replacement evidence, assignment acceptance and
  outcome-owner transfer recovery. None may weaken the confirmed no-bypass rule or guest isolation.
- Detailed partial-rollout representation, measurement-source handling and append-only correction authority.
- Large-journey unit of work and relationships beyond the confirmed follow-up link.
- Select the first bounded agent task.
- Journey representation and Request-to-journey relationships that make the shared record useful.
- Validate the locally implemented Expected impact creation/review/detail controls, including unknown
  baselines and both measurement modes. Discovery/bug handling beyond creation, period basis, compatible-metric
  aggregation and shared-result deduplication remain focused design/implementation decisions.
- Define any additional workspace-level process signals beyond the confirmed outcome summaries.

### Foundation clarification — confirmed 2026-10-06

- Lane's two foundations are a single source of truth for the product/journeys and expected-versus-actual
  impact at Request and quarterly/yearly product levels.
- Predicted impact is captured during Request creation, before design/delivery, and agreed by the named
  PM, Designer and Developer before progression. Existing no-bypass and material-realignment rules remain.
- The person who submitted the Request records actual results at the agreed post-launch window and owns
  closure. A PM label or named PM seat does not replace that ownership.
- Ordinary closure requires actual results; positive results are not required. A separately recorded
  exception with a reason may close and is excluded from measured-impact totals. These two ownership and
  exception choices were explicitly answered by Nikhil in the same conversation.
- Current AI review is not stakeholder agreement; current Mark Done is not outcome closure. Neither guard
  is implemented by this documentation. Replan the creation-to-outcome UX before continuing page polish.
  **2026-10-10:** that replan is scheduled as a sketch session before Phase 2 of the launch plan (where
  alignment and outcome will sit on the composer and on detail); Phases 0 and 1 are plumbing, not page
  polish.

### Scope amendment — 2026-09-28

Nikhil confirmed the full contract and the proposal to reconcile existing requirements/roadmap before coding.
The older “outcome learning is only an unselected hypothesis until a paying customer asks” wording is superseded
for the specific Request-level contract above. Requests remains the product surface; this is not permission
to add a suite, an engineering tracker, integrations, background automation or individual performance metrics.

The 2026-10-06 Expected impact creation/review/detail increment is separately authorized and implemented
locally and verified. Bounded alignment design/planning remains target work. Every further
implementation, schema, new route, AI capability and release still needs its explicit approval gate. Current
release evidence and operational gates are unchanged. Historical planning snapshots do not override this dated amendment.
