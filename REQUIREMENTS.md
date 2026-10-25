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
> actual-result closure remains target only. Quarterly/yearly totals are approved (2026-10-23, #151) and built on the integration branch, not yet shipped.
> **2026-10-21 #58 approval:** Named agreement and its persistence contract are approved for local
> implementation/testing. Migration `0028` is prepared; hosted backup, staging acceptance and promotion
> are separate gates. See `docs/superpowers/plans/2026-10-21-request-agreement-persistence.md`.
> **2026-10-21 #59 approval:** Release/measurement implementation is authorized locally, with UTC date boundaries, attributed correction/void recovery, and admin handover when the Requester loses eligible access (who may release, correct and void was widened by #127 below). Relative deadlines use actual exposure; fixed dates stay fixed. See `docs/superpowers/plans/2026-10-21-release-measurement.md`. Hosted migration/acceptance and #60 closure remain separate.
> **2026-10-21 #60 approval:** Measured and exception closure, append-only closure corrections and linked follow-ups are authorized locally with no new table. The Requester closes (measured only from the UTC due date; exceptions any time after pickup with a reason) and corrects; admin handover stays available after closure when the Requester loses access. Every agreed guardrail needs an actual value. Any active non-guest member may create a follow-up after release. See `docs/superpowers/plans/2026-10-21-outcome-closure.md`. Hosted migration `0030` and acceptance remain separate gates; quarter/year totals remain target only.
> **2026-10-21 reviewers (Nikhil, supersedes the #58 trio gate and #60 exception rules above):** No
> required PM/Designer/Developer agreement. The requester may add any number of optional reviewers (none
> is fine); anyone may ask for a review before pickup. Reviewers answer Looks good or Raise a concern
> (with a reason). Reviews never block pickup; open concerns and unanswered reviews are confirmed at
> pickup. Editing the Request resets answers. Before pickup the requester (or an admin) deletes an unwanted
> Request for good. After pickup, work that is rolled back or can't be measured closes without a result
> (Rolled back, Can't be measured, Other with a reason); it stays on record and outside measured impact.
> Migration `0031`.
> **2026-10-22 #127 journey (Nikhil, supersedes the #59/#60 ownership wording above):** One status line,
> Open → In progress → Done → Measuring → Closed, derived from the saved facts. Any active non-guest member
> records, corrects or voids a release while the Request is Done or Measuring and not closed; each change is
> attributed in history. Closing (measured or without a result) and closure corrections stay with the
> Requester only. A workspace admin may hand a Request to a new Requester at any point after pickup
> (including after closure) once the current Requester has lost access. The person who closes is called the
> **Requester** everywhere: not owner, creator or release and outcome owner.
> **2026-10-21 trio plans retired (Nikhil):** Reviewers also replace every later trio plan. Build and
> release readiness are checklists for the person doing the work: they guide, never block, and nobody else
> signs off. Before pickup a change is an edit (which resets reviews); after pickup a material change before
> release becomes a linked replacement Request with its own optional reviewers. Assignment stays pickup by
> any member: no Designer assignment, start window or acknowledgement step. Earlier notes above are history.
> **2026-10-08 sequence selection:** Nikhil chose Request features first over starting trio agreement.
> The current bounded local increment is saved Request codes for list copying and workspace search;
> see `docs/superpowers/plans/2026-10-08-saved-request-codes.md` for its defaults and verification.
> Saved priority followed on 2026-10-09 (`0019`), as did Ask for review (`0018`). Hosted migration/release
> and the broader target pipeline are not implied; the launch sequence and its decisions are in
> `docs/superpowers/plans/2026-10-10-mvp-launch-linear.md` (accepted 2026-10-10).
> **2026-10-18 review boundary:** Nikhil moved design reviews entirely to Figma. Lane tracks the Request
> and keeps its design link; it does not collect review requests, design feedback or reviewer decisions.
> Saved historical review data is retained. This does not introduce Figma integration or change the
> separately planned named alignment contract.

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
   keep it with the Request as work advances, measure after launch over the decided window, and retain the comparison
   and learning. Show Request-level results and cumulative quarterly/yearly product results (§9).

Optional reviewers can look at a Request before work starts; nothing in this chain waits on their sign-off
(§4.4). The submitter owns recording results and closing the Request, even when someone else did the work. The comparison
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

Responsibilities belong to a Request's Requester, its reviewers and its current assignee. The Requester is
the person who created the Request, or whoever an admin handed it to after they lost access. These are
Request-scoped responsibilities, not new global roles.
Changing a profile label never grants review or closure authority. Only the Requester closes the Request;
PM is not a permission gate. Any active non-guest member may record, correct or void its release (#127).

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
   filter, saved `LAN-n` codes, saved priority, and the workspace search pane (`/`): Requests and Projects
   by saved code, title, description and Expected impact text; status, type and created-date filters (the
   viewer's local days); recent searches; a result preview (a bottom sheet on narrow screens); Enter on an
   exact saved code opens that Request (scope approved 2026-10-20).
5. Request detail: problem, supporting context, saved Expected impact, assignment, lifecycle actions,
   attachments, coordination comments and saved design links. Design review discussion and decisions stay
   in Figma (2026-10-18); the earlier Ask for review workflow is retired. The Expected impact summary is
   implemented and locally verified.
6. Members and invitations: Clerk Organization Profile owns invitations, delivery, resend, revoke, roles,
   and membership changes. Lane supplies no parallel invite tokens or membership mutations.
7. Profile settings: editable functional label and browser-local System / Light / Dark preference.
8. Invited-guest isolation and lightweight in-app notifications supporting the Requests loop.

### Approved — target contract, confirmed 2026-09-28; not fully implemented

The confirmed journey is:

**Create (optionally ask reviewers) → Pick up → Explore as needed → Check build readiness → Build →
Check release readiness → Release → Measure → Requester closes → Follow-up Request if further work is needed.**

- Reviewers are optional and never block progression (§4.4). Readiness checklists guide the person doing the
  work; they never block and need no one else's sign-off.
- Discovery and delivery are different commitments; exploration is nonlinear and requires no design diary.
- Picking up assigns the Request to that person and starts work.
- Expected impact is recorded at creation. One primary success
  criterion, relevant guardrails, complete build/release readiness and evidence support delivery. Numeric
  impact is not compulsory where an observable acceptance criterion is more appropriate.
- Done and Closed remain separate steps. The Requester closes, including Closed without a result. Closed
  never reopens; further work uses a linked follow-up with its own reviewers and its own Requester.
- Overview / Work / Build / Outcome may organize information without becoming mandatory workflow stages.
- Quarterly/yearly outcome summaries are confirmed target scope, derived from Request records with
  compatible metrics and no duplicate attribution (§9); no separate reporting route is selected yet.

Expected impact creation/review/detail is the current bounded local implementation, with validation in
progress. Optional reviewers replaced the planned trio alignment on 2026-10-21 (§4.4). Later parts of this target are
sequenced in `lane-roadmap.md`, not independently authorized by this contract.

2026-10-11 bounded Intake addition, explicitly approved by Nikhil: new primary metric units default
to `%` and remain editable. Either Expected impact kind may include one optional guardrail with
an absolute At most / At least numeric limit and an explicitly entered unit. The Expected impact
options menu opens a separate inset editor after the complete primary fields. Add/Save changes
collapses it to a sentence with Edit/Remove; Cancel restores the prior guardrail. Pending edits
survive draft recovery and must be added or cancelled before review. Committed guardrails are
preserved through signed review and saved Request detail. Count units should state their period;
percentage definitions should name their population. Relative change limits are deferred. This
uses the existing Expected impact JSON record and adds no monitoring or outcome closure.

2026-10-20 guardrail simplification, explicitly approved by Nikhil: a guardrail is metric +
comparison + threshold value/unit. Comparisons are less than, greater than, equal to,
less than or equal to, and greater than or equal to. Guardrails do not ask for current
values and missing guardrail baselines do not block pickup. Primary baseline requirements
remain. Historical values are preserved; new measurement snapshots use version 3.
Existing at_most and at_least retain inclusive meanings. No automatic monitoring is added.

2026-10-20 follow-up, explicitly approved by Nikhil: comparison menus put selection left and green symbols right, without brackets. The threshold field sits directly beside the comparison. Every numeric editor value offers Percentage (%), Count, Minutes and Seconds in the field. Custom metric creation uses search plus an inline Create metric action, with no separate name or unit form. New/edited numeric plans use version 4; v2/v3 saved validation remains unchanged. Switching seconds/minutes converts numbers; incompatible unit changes clear numbers. Selecting the same metric preserves its values. Custom names remain within the existing Request JSON; no catalogue table or route is added.

**Metrics library supersession — 2026-10-25 (#195, approved by Nikhil):** the "no catalogue table or route" line above is
superseded. Each workspace has a Metrics library of Metric definitions (name, unit, optional link, optional how-it's-counted
line) with an append-only history, owned by one module (`src/lib/metrics-library.ts`). Built so far (#196): the two tables
(migration 0037), the seven starter metrics filled on a workspace's first read, and Settings → Metrics (`/settings/metrics`,
Members and Admins; Guests are refused) listing active definitions, showing "Add where this lives" when there is no link.
Predictions still save names in the Request JSON until the picker work in #195 lands.
Inline add (#199) supersedes the 2026-10-20 inline "Create metric" with no name or unit form: when the picker finds no
metric with the typed name, Members and Admins add one from the picker with a name and a unit only. It is added to the
library with a history entry and selected on the main metric or guardrail. An active definition with that name is offered
instead. Guests can't add.
Each definition's page (#203) lists every Request that used it, from the Impact read model (`buildDefinitionUses`), so
visibility and result rules match the Impact page: main-metric uses and guardrail uses apart, each grouped by Project, with
predicted beside actual (a guardrail's limit beside what was measured). A result still waiting shows as still due, with
its due date once released, never as zero; a Request closed without a result shows its reason. A definition merged into
this one brings its Requests; a merged-away definition's page points to the one they now count under. Nothing is grouped,
totalled or ranked by person.
Merging (#202): on a definition's page an Admin merges it with another definition in the same unit and chooses which one
is kept; different units are refused, and Members and Guests are refused on the server and see no merge controls. The kept
definition is unchanged; the other is marked "merged into" it, leaves the picker and the main list, and links to the kept
one. Both histories record the merge. Requests are not rewritten: their metrics resolve through the link, so Impact totals
combine at once. There is no unmerge, and a merged-away definition can't be merged again. An archived definition can be
merged away or kept.


2026-10-12 Intake simplification, explicitly approved by Nikhil: do not ask the requester where
they will check the result. Source/method is no longer required at creation; previously saved
source details remain preserved and readable. Keep the compact “Check in [X] days” interval.
This retains the existing post-launch review interval; it does not schedule notifications or
automatically close Requests. The Requester still records results and closes.

### Explicitly not authorized yet

- Any readiness, outcome, amendment or follow-up storage/screens, or success-criterion work beyond
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
- Optional Project and multiple Labels.
- An optional **Add link** control revealing the **Related link** field.
- Optional private attachments.

**Compact New Request decision — 2026-10-06:** the new form does not ask for affected people, desired
change, observed evidence or uncertainty in separate inputs, and has no Details or Feedback & links pills.
People can include that context in their description. Existing saved Request context and the four legacy
data keys, draft schema and signed-review tokens remain intact; nonempty earlier draft values appear in a
read-only **Details from your earlier draft** section during composition and review. This is a form
simplification, not a deletion of the target readiness/evidence contract or a backend migration.

A PRD, research file, design brief, or other document may support a Request but is never universally required.

**Approved bounded increment — 2026-10-05:** Projects are persistent workspace work areas such as B2B App,
B2C App, Website or Marketing. Anyone in the active workspace can create one from the Request composer.
Each Request may have one Project and one Request type (Bug, Improvement or New feature), both optional and
unset initially. Project grouping does not assign people, set priority or start work. Request type does not
replace or predetermine the AI framing classification. Preserve guest own-Request access when exposing
Project options. The approved implementation covers persistence, composer selection/creation and display/
filtering in existing Requests views; no separate Project management page. See
`docs/superpowers/plans/2026-10-05-request-projects-and-types.md` for implementation and verification status.

**Labels supersession — 2026-10-20:** Nikhil approved replacing the single Request type control with
multiple reusable workspace Labels. Bug, Improvement and New feature remain defaults, and existing
saved types become the corresponding labels. Any non-guest workspace member may create custom labels
from the shared New/Edit picker; guests cannot create labels. Labels share presentation across detail,
rows and filters. New feature retains its existing measurement-readiness meaning; labels never bypass
the AI gate, Open-only editing or creator/admin authorization. No label-management screen is added.
Migration `0024` is authorized only on verified, backed-up staging; production remains untouched.

**Project label scope follow-up — 2026-10-20:** Nikhil subsequently approved Workspace and Project
scopes, while retaining the separate Project assignment pill. Creation offers Workspace or the Request's
currently selected Project; without a Project, choose one on the Request first. Project labels are
available only for that Project. Changing Project preserves selected labels in the draft and requires
explicit removal of incompatible labels before saving. Existing labels remain workspace-wide.
Migration `0025` follows the same verified-backup and staging-only boundary. The picker matches name
prefixes as typed; Create new label appears only for nonempty text with no matches, then scope and
colour choices. Count changes keep the trigger content mounted, with identical round-dot sizes.

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

A saved Request stays Open until a member picks it up. Reviewers may be asked while it is Open; their
answers inform the person picking up and never block it (§4.4).

### 4.4 Optional reviewers — Approved for local implementation (2026-10-21)

Supersedes the named PM/Designer/Developer agreement gate. Workspace membership remains the access boundary.

- While creating a Request, the requester may add reviewers: "Add people who should look at this before
  work starts. Optional." Any number up to 20, including none.
- Before pickup, the requester and any member may add reviewers, with an optional short question (for
  example a designer asking a developer whether it can be built). Only the requester or an admin removes one.
- Reviewers are active members or admins, or (admin only) a pending email invitation. Guests, the person
  adding, and the requester cannot be reviewers. Each row shows the person's profile role as information only.
- A reviewer answers **Looks good** or **Raise a concern** with a reason. A concern clears only when that
  reviewer changes their answer or the Request is edited.
- Editing what the Request says (content, Expected impact, type, Project, labels) resets every answer and
  tells reviewers who had answered; priority does not.
- Reviews never block pickup. Picking up with open concerns or unanswered reviews asks for confirmation
  (one combined confirmation for bulk pickup). After pickup the reviewer list is read-only; unanswered
  reviews read "No answer before pickup". A reviewer who leaves the workspace stays listed, greyed out,
  and their answer no longer counts.
- Notifications are in-app only: added → reviewer; answered → whoever added them; reset → reviewers who had answered.
- Request rows show a marker for open concerns. No separate "waiting on me" page.
- Before pickup, the requester or an admin deletes an unwanted Request for good, with its comments, files and
  reviews. After pickup a Request cannot be deleted: it ends with a measured result or closes without a
  result (Rolled back, Can't be measured, Other with a reason).

### 4.5 Define success and preserve expectations — Approved target

**2026-10-06 timing clarification:** expected impact belongs in Request creation, including feature and
improvement submissions; it is not first collected after design or launch. The PM supplies the product
prediction when involved in submission. The submitter remains accountable for its recording and follow-through;
being a named PM or having a PM profile label does not transfer closure ownership. Drafts may remain incomplete.
The compact form implements Metric or Verified result and a “Check in [X] days” interval, with an
optional unknown numeric baseline. Source/method is no longer requested at creation (2026-10-12);
existing source details remain preserved. The same snapshot is preserved through signed review and shown read-only
on saved detail. This bounded code is implemented and locally verified. Launch, actual-result
collection/closure remain target only; period totals are approved (2026-10-23, #151) and built on the integration branch, not yet shipped.

Every delivery commitment has **one primary success criterion**. Secondary metrics are optional. Capture
the initial expectation and complete the measurement contract before pickup:

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
During discovery, baseline unknown is valid. Before pickup, the Request needs a defensible measurement
approach. New capabilities may use an absolute target rather than a before/after baseline.
Existing evidence can be linked; no mandatory report or particular research/testing method is introduced.
An unknown baseline is explicit, not a fabricated zero or permission to omit the intended result. The
discovery/bug handling and creation validation need to preserve this distinction in the focused design.

Before pickup, a change is an edit, which resets every review. After pickup and before release, material
changes to problem, scope, audience, timing, success or guardrails use a linked replacement Request with its
own optional reviewers. The original creator
explicitly confirms the original as Superseded, a permanent exception excluded from measured-impact totals.
Its Open/In Progress/Done column is retained; it cannot advance or reopen. Minor prose corrections append
original wording, correction and reason beside the immutable snapshot. Routine exploration within the
planned scope does not need a replacement. After release, targets cannot be rewritten to match observed results. AI must not invent
targets, baselines or evidence; additional AI capability beyond Intake still requires separate authorization.

### 4.6 Assign and schedule — Current behaviour versus approved target

**Current implementation and confirmed target (2026-10-21):** an eligible member picks up an Open Request;
this assigns it to that person and moves it to In Progress. Pickup requires a complete measurement plan;
reviews never block it, and open concerns or unanswered reviews ask for confirmation (§4.4). Self-pickup
must not take an existing assignment from someone else. There is no separate Designer assignment, start
window or acknowledgement step, and profile labels do not become permissions. Hosted migration and real
multi-user staging acceptance remain release gates.

No automatic ranking, prioritization score or separate Roadmap screen is authorized.

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
instrumentation and interpretation without becoming a mandatory approver or new global role.
Material changes use the amendment rule (§4.5); routine design iteration does not create a follow-up Request.

### 4.8 Confirm complete build readiness — Approved target

Lane should show the connection between the problem, selected direction, and implementation without becoming
an engineering tracker. Source code, pull requests, deployment operations, and engineering task management
remain in their specialist systems unless a later integration is explicitly approved.

Before production implementation of the planned release, the person doing the work checks:

- Scope, exclusions and acceptance criteria are clear.
- Relevant flows, designs and edge states are available.
- Technical approach and dependencies are understood.
- Success criteria, guardrails and measurement responsibilities are defined.
- Timing is clear, and any open review concerns have been considered.

Completeness applies to the planned release, not every future capability. Prototypes and technical experiments
can occur during discovery. Use existing links, evidence and concise confirmations rather than
duplicating design or engineering documents. Irrelevant checks may be marked not applicable with a brief
explanation; a failed relevant check may not be relabelled not applicable. The checklist guides and never
blocks; nobody else signs off, and the person doing the work may ask reviewers for a second opinion.

### 4.9 Confirm release readiness and release — Approved target

Before the stated release:

- Planned scope is implemented and verified, with no unresolved release-blocking defects.
- Relevant accessibility, security, performance and regression checks are complete.
- Measurement/instrumentation works and has been verified.
- Audience, rollout, rollback/recovery and operational ownership are clear.
- The person releasing confirms readiness for that release; existing evidence supplies the check, not a
  new report. Like build readiness, it guides and never blocks.

Record what became available, to whom and when, the extent of rollout, supporting release evidence and known
limitations. A merged PR or deployment alone does not prove customer exposure. PM coordinates product launch
and follow-through, engineering owns deployment in its tools, and design checks the implemented experience.
Links do not imply automatic integrations or release automation. Partial-release representation and control
details must be resolved in the release increment's plan before implementation.

### 4.10 Measure and close — Approved target

The Requester returns after delivery, records what happened, compares it with the original prediction, and
closes the Request. The comparison belongs to the Request and workspace learning—not to a personal score.

**Confirmed 2026-10-06; wording 2026-10-22 (#127):** the Requester (the person who submitted the Request, or
whoever an admin handed it to) closes it, including when someone else did the work. Anyone working on the
Request may record, correct or void the release, so measurement is never held up waiting for the Requester. For ordinary measured closure, actual results, their evidence/source and the agreed
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

**2026-10-22 (#127):** a Request has one status line, the same in the list, board, peek and Request page:

`Open → In progress → Done → Measuring → Closed`

It is derived from the saved work status, the release and the closure; it is never stored. "Closed without a
result" is a form of Closed. Readiness checklists are guidance, not extra board columns, permission roles or
gates. The two lifecycles below are the saved facts the status line is read from.

### Work lifecycle

`Open → In progress → Done`

- **Open:** saved work not yet started; it may be awaiting reviews or capacity.
- **In progress:** active design, development, or delivery work.
- **Done:** active work has ended. Done does not mean the outcome has been measured or the Request has been
  fully closed.

Done may record a truthful completion reason:

- Released
- Cancelled
- Stopped
- Superseded
- Not launched

Eligible members pick up work and mark Done; guests may not. Picking up assigns and starts work (§4.6); the
only pickup check is a complete measurement plan.

### Outcome lifecycle

The saved release and closure facts behind Done → Measuring → Closed.

- **Done (no release yet):** no outcome measurement is currently underway.
- **Measuring:** a release is recorded; the delivery has entered its agreed observation window.
- **Closed:** the Requester has recorded a measured result, or closed without a result.

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

### Who closes — the Requester

- The Requester closes the Request (measured, or without a result) and adds closure corrections. Nobody else
  does, admins included.
- Any active non-guest member records, corrects or voids the release while the Request is Done or Measuring
  and not closed; guests never do, and nobody does after closure. Each change is attributed in history.
- Functional label does not grant closure permission.
- If the Requester leaves or loses access, a Clerk organization admin hands the Request to another active
  non-guest member, with a reason, at any point after pickup (including after closure). Before any release,
  the handover starts the release record with no release in it.
- Handover must be visible and attributable; it may not happen silently. The former Requester loses close
  rights at once.

### Closed is permanent; corrections are append-only — Confirmed 2026-09-28

A Closed Request cannot reopen. Preserve its closure snapshot, commitment, outcome and evidence. Factual
errors may receive an attributable append-only correction displayed beside the original; never silently
overwrite history. A typo or mistaken evidence link is not new product work and must not inflate follow-up
counts. **Specified 2026-10-21 (#60):** only the Requester adds corrections, each naming
the corrected part (actual, guardrails, evidence, observation period or exception reason) with a reason; they
appear beside the unchanged closure record.

### Amendments and follow-up Requests — Confirmed 2026-09-28

| Situation | Treatment |
|---|---|
| Routine exploration within planned scope | Continue the same Request; no branch or change form. |
| Change before pickup | Edit the Request; editing resets every review. |
| Material change after pickup, before release | Create a linked replacement Request with its own optional reviewers; creator explicitly confirms the original as permanent Superseded exception. |
| New work after release or closure | Create a linked follow-up Request; the predecessor is not reopened. |

The user-facing action is **Create follow-up Request**, not a Git-style branch/merge workflow. A follow-up
links back to the original Request and references useful problem context, artifacts and outcomes; it states
what changed and why, and has its own Requester (whoever created it), reviewers and success criterion;
carried-over reviewers start unanswered. Its Requester closes it. Context can carry forward; review answers and outcome completion cannot.

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
- Reviewers, their answers and open concerns.
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
- Close action for the Requester only.
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
- **Quarter/year basis, approved 2026-10-23 (GitHub #151):** totals group by the release date (UTC), and a Request
  with no release date is never counted in any period. A total is made only where metric, unit, audience and window
  match exactly. Percentages are never summed, and Verified results are counted as good or bad, never summed.
  Operational work and closed-without-result Requests are never in a total. A shared result is counted once.
  Built on the integration branch; not yet shipped.
  **Metrics library match, approved 2026-10-25 (#195, #201):** "metric and unit match exactly" now means the same
  resolved Metric definition (a merged one counts as the one it was merged into; an archived one still counts), with the
  same audience (platform included) and window; the unit comes from the definition. Two definitions with the same name
  never add up. Totals and the Impact page show each definition's current name, and workspace search finds Requests by
  their definition names. Pass/fail checks and any metric the library can't place keep a line per saved name and unit,
  never shared with a definition's. This closes the name-text risk recorded in #151. Integration branch only.
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

> **2026-10-23 amendment (GitHub #151, approved by Nikhil):** teammate lists and manager views of an individual's
> Requests and results are approved ("I need teammate lists and manager views."). They show no per-person totals,
> scores or rankings, and they remain guest-excluded. The prohibition above keeps what it protects: no per-person
> scores, rankings, hit rates, averages or totals.

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
- **Inbox (#195 item 2, #204, 2026-10-25, on the integration branch):** "Inbox" replaces "Notifications" in all copy.
  The bell's popover is replaced by the `/inbox` page: the list on the left and the existing Request preview beside it
  (phones and touch open the Request's page instead). One read model (`src/lib/inbox-read-model.ts`) decides what it
  holds. For-your-information items are the stored notifications for picked up, Done, comments, Looks good and invite
  accepted; they clear when read (opening one reads it), and Mark all read clears everything. An item read during a
  visit stays in place, read, until the next visit. Guests see only items about their own submissions. The bell stays
  in the sidebar and leads to the Inbox. Comments notify the people on the Request as before, with no @mentions.
  Review asks, Concerns and resets are not For your information.
- **Needs you (#195 item 2, #205, 2026-10-25, on the integration branch):** the Inbox lists what needs the person
  above For your information, and the bell counts only these ("Inbox, 2 need you"). They are worked out from Request
  state at read time and never stored, so each clears itself and none repeats:
  - a review waiting on you, while the Request is Open and you haven't answered (an edit that resets answers asks again);
  - an open Concern on your Request, while it is Open; it clears when you edit (which resets the answer), the
    Reviewer changes their answer, or the work is picked up;
  - one "Record the release" exactly 3 days after Done (3 days after the latest void if a Release was voided),
    until the Release is recorded or the Request is closed;
  - one Result due from the measurement due date (UTC), until the Request is Closed.
  "Your Request" means you are its current Requester, so a handover moves these items to the new Requester and out
  of the former one's Inbox. Record the release now goes to the Requester, not whoever picked the work up. Only
  Admins and Members get Needs-you items; Guests (and Viewers, when that role lands) get none. The repeated
  reminders (#127: due soon, weekly overdue, weekly release reminder) are retired with the stored reminder types,
  and the reminder writer that ran when the bell was checked is removed: checking the bell writes nothing
  (migration 0040 deletes the stored reminder rows and refuses those types).
- **Inbox delivery (#195 item 2, #206, 2026-10-25, on the integration branch):** Needs-you items reach people outside
  Lane, one plain-text email per item with one link to the Request, never bundled, each at most once (the delivery
  log, migration 0041, holds each person's item once). A review asked (on a Request, at Intake, carried to a
  follow-up, or asked again by an edit that resets answers) and a Concern raised are sent right after the action; an
  item that has already cleared is never sent. Record the release and Result due are sent by the one daily job
  (`GET /api/inbox/daily`); running it twice sends nothing twice. Each Admin and Member chooses per workspace in
  Settings → Inbox delivery: Email (the default) or Off; Slack DM is offered once Slack is connected (#207). Off holds
  everything except Result due. For-your-information items are never emailed; Guests and Viewers get no Needs-you
  email. The email service is Resend. **Nothing is sent until Nikhil switches it on:** while `LANE_EMAIL_DELIVERY`
  is not `1` the messenger is a recording stand-in and the log records "would send"; while `CRON_SECRET` is unset
  the daily job refuses every call, and its `vercel.json` cron entry is added only in the change that switches
  email on. Items logged as "would send" before the switch are not sent again afterwards.

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
4. **Review value:** teams ask reviewers when it helps, and concerns reach the person picking up without
   redundant documents or a blocking gate.
5. **Next-problem evidence:** observed usage informs the next bounded increment of the confirmed pipeline.
6. **Outcome-learning validation:** teams return to record outcomes or truthful exceptions and find the comparison useful.
7. **Agent validation:** a separately approved bounded agent task saves effort without reducing human control.

Dates and enthusiasm do not advance gates. Evidence does.

---

## 14. Subsystem planning boundaries

The confirmed pipeline is not one implementation plan. Operational release gates remain prerequisites to
production. Expected impact creation/review/detail is implemented and locally verified.
**Optional reviewers** (2026-10-21, migration `0031`) replaced the bounded #58 trio alignment: reviewers,
Looks good / Raise a concern answers, reset on edit and a pickup confirmation, with no progression guard.

Later contract slices are scoped separately: the full success/evidence contract, nonlinear artifact context,
build/release readiness checklists, measurement and creator-owned closure, immutable history/corrections and
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
- Work lifecycle remains Open → In progress → Done (2026-10-22: shown as one status line with Measuring and Closed, §5).
- **2026-10-09:** Mark Done can be undone from the Requests list (and from Request detail once it is
  migrated, 2026-10-10) for 15 minutes after the move: the Request returns to In Progress and its Done
  notification is withdrawn. This is the undo of Mark Done, offered to the same members who can mark Done,
  not a reverse lifecycle move; Closed outcomes never reopen this way.
- **2026-10-09:** Saved priority (none, urgent, high, medium, low) is a triage signal members set from the
  list; it does not assign people or start work.
- **2026-10-18:** Design review happens entirely in Figma. Lane retains design links and Request tracking;
  no in-app reviewer picker, review feedback form, decisions or new review notifications. Historical
  review data remains stored; links from those records remain accessible. This supersedes Ask for review
  from 2026-10-09 and does not add a Figma integration.
- **2026-10-21:** Optional reviewers replace the named PM/Designer/Developer agreement and every later trio
  plan (§4.4). Readiness checklists guide the person doing the work and never block; after pickup a material
  change becomes a linked replacement Request; pickup by any member is the only assignment.
- **2026-10-20:** Workspace search scope approved as shipped (plan item 2.8): Requests and Projects, matched by
  saved code, title, description and Expected impact text; status, type and created-date filters; recent
  searches (in memory only); a result preview, in a bottom sheet on narrow screens. Rich result rows stay
  (title, metadata, snippet, date). Enter on an exact saved code (case-insensitive) opens that Request and
  an exact code ranks first; Enter on other results previews them and Cmd or Ctrl+Enter opens them. Dates
  and the created-date filter use the viewer's local days. No new routes, tables or AI calls.
- **2026-10-21:** Phase 2 critique decisions (Nikhil; `docs/design-system/page-quality.md`). The error frames'
  "let us know" links to the support address the privacy policy names (`uselaneapp@gmail.com`). Onboarding
  offers "Wrong account? Sign out". While the problem check runs, the composer's X and Esc cancel it and keep
  the draft; saving and uploading still hold the dialog. Group by Assignee keeps its per-person counts.
  Request detail shows a Status or Priority the viewer cannot change as plain glyph and text, not a chip
  (replacing the 2026-10-18 matching-chip rule for read-only values). When Clerk cannot load, sign-in and
  sign-up say so with a Reload button instead of a skeleton that never resolves.
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
- One status line (2026-10-22, #127): Open → In progress → Done → Measuring → Closed, derived, never stored.
- Done does not mean outcome closure.
- The Requester closes and corrects; any active non-guest member records, corrects or voids the release; a Clerk organization admin may hand the Request to a new Requester after pickup when the Requester has lost access (2026-10-22, #127).
- Truthful exception outcomes may close a Request: inconclusive, measurement unavailable, not launched or
  cancelled, rolled back, or superseded.
- Design work is nonlinear and artifact-led; continuous text logging is not required.
- No individual performance scoring or surveillance.
- Arc registry/MCP source → local Arc composition → Storybook → implementation → verification is the product frontend workflow.

**Confirmed 2026-09-28:**

_Superseded in part on 2026-10-21: optional reviewers replace the trio alignment, assignment and readiness
sign-off rules recorded here (§4.4 and the 2026-10-21 Locked entry). Kept as history._

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

- Final interaction labels and compact field presentation; how a material change after pickup is told
  apart from an ordinary correction.
- Guest-created Request sponsorship. Requester handover is decided (§5, 2026-10-22); neither may weaken guest isolation.
- Detailed partial-rollout representation, measurement-source handling and append-only correction authority.
- Large-journey unit of work and relationships beyond the confirmed follow-up link.
- Select the first bounded agent task.
- Journey representation and Request-to-journey relationships that make the shared record useful.
- Validate the locally implemented Expected impact creation/review/detail controls, including unknown
  baselines and both measurement modes. Discovery/bug handling beyond creation, period basis, compatible-metric
  aggregation and shared-result deduplication remain focused design/implementation decisions.
- Define any additional workspace-level process signals beyond the confirmed outcome summaries.
- **Proposed 2026-10-13 (plan item 2.5; not build authority until Nikhil amends the 2026-10-09 entry):**
  saved priority may also be set from Request detail, as the signed launch plan's 2.5 panel shows it, by the
  same members and with the same meaning (a triage signal that assigns no one and starts no work). A priority
  edit on a Done Request restarts its 15-minute Undo window, which is measured from `updated_at` (launch
  plan decision 8.19); detail makes that reachable.

### Foundation clarification — confirmed 2026-10-06

_Superseded in part on 2026-10-21: optional reviewers replace the trio alignment, assignment and readiness
sign-off rules recorded here (§4.4 and the 2026-10-21 Locked entry). Kept as history._

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
  **2026-10-11:** Nikhil signed the sketch (`docs/superpowers/plans/2026-10-11-creation-to-outcome-sketch.md`).
  Detail reads in journey order with Alignment and Outcome sections; the panel and the 44px strip summarize
  them. Decisions: naming the other two seats is optional at creation; the creator always holds one seat,
  never taken from the profile label; after a recorded concern only the creator revises the Request; the
  assignee label is "Assignee", not "Owner"; and only a workspace admin changes an existing assignee or
  replaces a named PM, Designer or Developer (this narrows §4.6: the creator still assigns into an empty slot
  and an unassigned Designer may still pick up; replacement still never erases a concern). Phase 2 reserves
  this structure and renders none of it until the alignment and outcome increments are approved.
  **2026-10-13:** Nikhil chose a centred dialog for the New Request composer; /intake is a launcher under the page strip.

### Scope amendment — 2026-09-28

Nikhil confirmed the full contract and the proposal to reconcile existing requirements/roadmap before coding.
The older “outcome learning is only an unselected hypothesis until a paying customer asks” wording is superseded
for the specific Request-level contract above. Requests remains the product surface; this is not permission
to add a suite, an engineering tracker, integrations, background automation or individual performance metrics.

The 2026-10-06 Expected impact creation/review/detail increment is separately authorized and implemented
locally and verified. Optional reviewers replaced the planned trio alignment on 2026-10-21. Every further
implementation, schema, new route, AI capability and release still needs its explicit approval gate. Current
release evidence and operational gates are unchanged. Historical planning snapshots do not override this dated amendment.
