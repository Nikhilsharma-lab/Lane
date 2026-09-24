# Lane Master Product Requirements

> **Status:** Working product contract, created 2026-08-14.
> **Purpose:** Define what Lane must do, what it must never do, what is already shipped, and which future
> requirements still need approval before implementation.
> **Scope rule:** A requirement marked **Approved — current** is build authority within the current roadmap
> gate. A requirement marked **Approved — future contract** is a locked product rule but is not permission to
> build it before the roadmap gate changes. **Proposed** and **Unresolved** items are never build authority.

This is the product-behaviour master, not a monolithic implementation plan. `AGENTS.md` remains the primary
repository instruction file. `lane-roadmap.md` controls sequence, `DESIGN.md` controls the visual system,
`phase-0-ux-skeleton.md` and approved Paper artboards control journeys and states, and focused implementation
plans control code changes. If those documents disagree, work stops until the conflict is reconciled.

---

## 1. Product thesis

Lane is a problem-first product operating system for product teams. It helps a team turn an unclear or
solution-shaped request into an understood problem, carry that problem through design and delivery, and learn
what happened after release.

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

Responsibilities may belong to a Request creator, current assignee, or explicitly transferred owner. That
does not create a new global role. For example, only the Request creator owns outcome closure, but PM is not a
permission gate.

---

## 3. Product scope and authority

### Approved — current and shipped

The current product is the Requests loop:

1. Clerk authentication: sign up, email verification, sign in, password recovery, and invite acceptance.
2. Onboarding: Clerk organization creation or invited-organization activation → functional label → Requests.
3. Intake: title, description, optional evidence fields, private attachments, and the AI problem gate.
4. Requests board: one shared workspace board grouped Open / In Progress / Done, with an optional status
   filter.
5. Request detail: problem, supporting context, assignment, lifecycle actions, attachments, and comments.
6. Members and invitations: Clerk Organization Profile owns invitations, delivery, resend, revoke, roles,
   and membership changes. Lane supplies no parallel invite tokens or membership mutations.
7. Profile settings: editable functional label and browser-local System / Light / Dark preference.
8. Invited-guest isolation and lightweight in-app notifications supporting the Requests loop.

### Approved — future product contract, not current build authority

The following direction is approved conceptually but remains gated by the roadmap and the current
`AGENTS.md` restrictions:

- A Request can carry an expected impact and later record the actual outcome.
- Delivery completion and outcome closure are separate.
- Design work is nonlinear and artifact-led.
- A future Request workspace may organize information as Overview / Work / Build / Outcome without turning
  those views into mandatory stages.
- Future agents may perform bounded procedural design-operations work under human control.

### Explicitly not authorized yet

- New impact-prediction storage or screens.
- New outcome storage or screens.
- Handoff briefs, iteration summaries, prediction confidence, or individual calibration.
- Figma, analytics, GitHub, Linear, or other product integrations.
- Agent workflows beyond the shipped Intake gate.
- New design-stage, phase, track, initiative, epic, or custom-workflow systems.

These items require an explicit scope-gate change after validation. This document preserves their intended
behaviour so later planning does not restart from zero.

---

## 4. End-to-end Request journey

### 4.1 Create the Request — Approved current

Anyone allowed by workspace access may submit a Request. The Request begins with the underlying problem, not
a prescribed interface or implementation.

Current Intake supports:

- A short title.
- A description of the need or observed problem.
- Optional affected audience.
- Optional desired change.
- Optional observed evidence.
- Optional uncertainty.
- Optional useful link.
- Optional private attachments.

A PRD, research file, design brief, or other document may support a Request but is never universally required.

### 4.2 Pass the AI gate — Approved current

Before saving, the Intake gate classifies the submission as:

- Problem
- Solution
- Hybrid

For a solution or hybrid, Lane proposes a problem-framed version and explains why. The submitter may edit the
reframe and must confirm it before saving. The gate must preserve the submitter's meaning, expose uncertainty,
and fail recoverably. It must not fabricate user evidence.

### 4.3 Define expected impact — Proposed contract; decision incomplete

The creator is expected to state what measurable change they predict. AI may help clarify the expression but
must not own or invent the prediction.

The proposed minimum contract is:

- One primary metric.
- Current baseline, or an explicit “baseline unknown.”
- Predicted change.
- Measurement window.
- Data source.
- Optional reasoning and evidence.

Still unresolved:

- Whether exactly one primary metric is mandatory for the first outcome-learning increment.
- When the prediction becomes immutable.
- Whether amendments are allowed and how the original prediction remains visible.
- Which qualitative impact formulations are acceptable when a numeric baseline is unavailable.

No impact-contract implementation may begin until these decisions are approved.

### 4.4 Accept and expose the Request — Approved current

An accepted Request appears on the shared board. Every non-guest member sees the same board and may open the
same Request. A guest sees only Requests they created or are otherwise explicitly entitled to see under the
guest contract.

### 4.5 Pick up the work — Approved current

An eligible member may pick up an Open Request. Lane assigns it to that authenticated person and moves it to
In Progress. The action is not restricted by functional label.

### 4.6 Explore and converge — Approved future contract

Design work is exploratory and nonlinear. Lane must not require Sense / Frame / Diverge / Converge / Prove,
or any other fixed sequence.

The intended work model is artifact-led:

- Designers continue to explore in the tools appropriate to the work.
- Lane may reference research, flows, prototypes, designs, experiments, and decisions.
- Continuous manual narration is not required.
- At meaningful convergence points, AI may prepare a concise decision snapshot from available context.
- A human may confirm, edit, or dismiss that snapshot.
- The history records meaningful decisions, not performative activity.

Candidate convergence points, not mandatory workflow states:

- The problem is understood well enough to explore.
- A direction is selected.
- The work is ready for implementation.

### 4.7 Build and release — Approved future contract

Lane should show the connection between the problem, selected direction, and implementation without becoming
an engineering tracker. Source code, pull requests, deployment operations, and engineering task management
remain in their specialist systems unless a later integration is explicitly approved.

The exact handoff contract, supported links, release evidence, and integration boundaries remain unresolved.

### 4.8 Measure and close — Approved future lifecycle contract

The creator returns after delivery, records what happened, compares it with the original prediction, and
closes the outcome. The comparison belongs to the Request and workspace learning—not to a personal score.

---

## 5. Locked lifecycle contract

Lane maintains two connected lifecycles.

### Work lifecycle

`Open → In Progress → Done`

- **Open:** accepted work that no one has picked up.
- **In Progress:** active design, development, or delivery work.
- **Done:** active work has ended. Done does not mean the outcome has been measured or the Request has been
  fully closed.

Done may record a truthful completion reason:

- Released
- Cancelled
- Stopped
- Superseded
- Not launched

The existing MVP behaviour remains: eligible members may pick up work and mark delivery Done. Guests may not.

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

### Closure ownership

- The Request creator owns outcome closure.
- Functional label does not grant closure permission.
- If the creator leaves or loses access, an owner or admin explicitly transfers outcome ownership to another
  active member.
- Transfer must be visible and attributable; it may not happen silently.
- The exact administrative recovery path is a future implementation decision.

---

## 6. Request information architecture

The current Request detail remains the shipped authority. The following future organization is an approved
concept for Paper exploration, not a route or schema instruction:

### Overview

- Confirmed problem frame.
- Creator, assignee, and lifecycle.
- Affected audience and evidence.
- Expected-impact summary when outcome learning is authorized.

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

These labels are information views, not a new lifecycle, permission model, or mandatory process.

---

## 7. Large features and customer journeys

The proposed unit of work is one independently measurable product bet per Request. A complete customer
journey may remain one Request only when it has one primary problem, one creator, one release decision, and
one outcome contract.

When different journey moments have independent problems, releases, or success measures, they should become
separate Requests. Lane must not introduce initiatives, epics, or a project hierarchy merely to contain them.

Still unresolved:

- Whether related Requests need an explicit lightweight relationship.
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

Lane may eventually help a workspace understand whether its problem-framing and delivery system is improving.
Permitted learning is attached to Requests or sufficiently aggregated workflow patterns.

Candidate permitted signals, still requiring separate approval:

- Distribution of measured, inconclusive, unavailable, and not-launched outcomes.
- Recurring problem themes.
- Prediction-versus-actual patterns aggregated across Requests.
- Time spent by a Request in broad lifecycle states only when it cannot be used to rank people.

Permanently prohibited:

- Accuracy, speed, throughput, or effectiveness scores per person.
- PM, designer, or developer comparisons.
- Individual cycle-time rankings.
- Activity, presence, keystroke, or “last active” monitoring.
- Manager-facing views that expose an individual's behavioural history as performance evidence.

The phrase “designer effectiveness” or “PM effectiveness” must be interpreted as the effectiveness of the
supported process and resulting product decisions, never an employee score.

---

## 10. Functional requirements for the shipped Requests product

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

- Owner/admin membership actions are distinct from functional labels.
- Invitations are email-bound and retain a copyable fallback link.
- Email failure does not invalidate a successfully created invitation.
- Pending invitations support resend and revoke.
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

Plane is Lane's strict frontend reference for information architecture, layout, interaction patterns,
component composition, states, responsive behaviour, keyboard behaviour, and component organization.
Lane independently implements those patterns in its own stack, vocabulary, visual identity, and product scope.

For every material frontend increment:

1. Inspect the matching Plane source and all relevant states.
2. Read the matching local `src/components/ui` source.
3. Check the official shadcn registry when a primitive is missing or uncertain.
4. Use Base UI APIs and composition; never assume Radix behaviour.
5. Specify the journey, states, light mode, dark mode, and meaningful breakpoints in Paper.
6. Implement with Lane's semantic Tailwind v4 tokens.
7. Verify keyboard, focus, accessible names, responsive behaviour, and relevant states.

Paper is a reviewable visual specification. Editing Paper never updates code, staging, or production
automatically. Only reviewed, implemented, tested, and deployed code changes the product.

---

## 13. Delivery and validation model

### Permanent delivery rule

Ship one user-touchable, independently testable increment at a time. Each increment must be explainable by
Nikhil in plain English before it is considered complete.

### Increment workflow

1. Confirm the user problem and validation signal.
2. Update this requirement contract or a focused subsystem specification.
3. Resolve every product decision required by that increment.
4. Audit Plane, local components, and shadcn; create Paper states when material UI is involved.
5. Write a focused implementation plan with tests and exact file boundaries.
6. Implement test-first.
7. Verify locally and on Lane Staging.
8. Have Nikhil perform the user journey in plain language.
9. Promote the verified increment to production.
10. Record what was learned before selecting the next increment.

### Validation gates

1. **Operational readiness:** authentication, isolation, recovery, deployment, and staging are trustworthy.
2. **Intake value:** real teams repeatedly use the gate and prefer the resulting problem frames.
3. **Requests workflow value:** the board becomes part of real work rather than a duplicate tracker.
4. **Next-problem evidence:** observed usage identifies the next unmet problem.
5. **Outcome-learning validation:** teams voluntarily return to record outcomes and find the comparison useful.
6. **Agent validation:** a bounded agent task saves procedural effort without reducing trust or human control.

Dates and enthusiasm do not advance gates. Evidence does.

---

## 14. Subsystem planning boundaries

The complete vision must not become one implementation plan. When authorized, it is divided into focused,
independently testable plans:

1. Requests excellence and Intake-gate validation.
2. Impact contract.
3. Outcome lifecycle and creator-owned closure.
4. Nonlinear Work workspace and artifact references.
5. Build/release context and external-tool boundary.
6. Request-level learning without individual surveillance.
7. First bounded design-operations agent.

Only one subsystem may enter implementation at a time. Later plans consume the verified contract produced by
earlier increments; they must not pre-build speculative infrastructure.

---

## 15. Decision ledger

### Locked

- Problem-first Intake with AI classification and submitter-confirmed reframing.
- PM / Designer / Developer are labels, not permissions.
- **2026-09-24:** workspace-first onboarding with Clerk Membership required; choose the functional label
  only after an active organization exists, then enter Requests.
- Work lifecycle remains Open → In Progress → Done.
- Outcome lifecycle is separate: Not started → Measuring → Closed.
- Done does not mean outcome closure.
- The creator owns outcome closure; owner/admin may explicitly transfer that responsibility if necessary.
- Truthful exception outcomes may close a Request: inconclusive, measurement unavailable, not launched or
  cancelled, rolled back, or superseded.
- Design work is nonlinear and artifact-led; continuous text logging is not required.
- No individual performance scoring or surveillance.
- Plane → local UI → shadcn → Paper → implementation → verification is the permanent frontend workflow.

### Awaiting Nikhil's decision

- Approve the exact Impact Contract fields and one-primary-metric rule.
- Approve prediction lock timing and amendment history.
- Approve the independently measurable Request rule for large customer journeys.
- Define the lightest useful relationship between related Requests, if any.
- Define what Lane owns at design-to-development handoff.
- Select the first bounded agent task.
- Define acceptable workspace-level process signals.
- Decide whether real pilot evidence now justifies changing the current `AGENTS.md` ban on impact prediction,
  outcome features, handoff, and agent workflows.

### Current scope conflict that must be resolved before expansion

`AGENTS.md`, `PRODUCT.md`, and `lane-roadmap.md` currently make Requests the only committed product and defer
outcome learning and agentic design operations until validation or a paying-customer trigger. The newly locked
lifecycle is preserved here as an approved future contract. It does not override that gate. Before any
expansion code is planned, Nikhil must explicitly choose either:

- Keep the existing pilot gate and validate the shipped Requests loop first; or
- Amend the canonical scope with a named first outcome-learning increment and its validation test.

That choice changes sequencing, database scope, routes, Paper coverage, test strategy, and release risk, so it
must not be inferred.
