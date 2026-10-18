# Baseline and Results Decision Plan

**Status:** Product direction accepted for planning on 13 October 2026. Nikhil approved the revised wireframe and explicitly requested implementation in the actual repository on 15 October. The bounded New Request implementation is tracked in [the implementation plan](2026-10-15-new-request-implementation.md): composer, saved measurement snapshot, current-value recovery and pickup readiness. Results/closure remain planning only. This approval does not authorize hosted deployment.

**Goal:** Replace compulsory impact forecasts with defined measures, observed starting values, optional guardrails and a readable record of actual results at Request closure.

**Architecture:** Keep measurement and results inside existing Intake and Request detail. Preserve the existing work lifecycle and introduce the already-planned outcome lifecycle through a separately approved increment. Use typed, versioned measurement definitions and observations; calculate comparisons deterministically from supplied data.

**Tech stack:** Existing Next.js, React, TypeScript, Arc components, Lane semantic tokens, Clerk, Drizzle and Supabase. No additional provider, analytics integration or AI capability is needed for this proposal.

## Product decision

### Intake wireframe decision — 15 October 2026

Nikhil explicitly retained the **Set the goal** section and the complete **Define measurement** section shown in his reference. This supersedes the earlier recommendation to remove the Goal field or hide the measurement section during intake.

- Keep a generic metric chooser, **Current value**, and **Target after release**. Keep **Audience**, **Platform**, **Measurement window**, and the optional disclosure for exact start/end dates. Remove **Team check-in**.
- Use one **Create Request** action for the whole draft. Metric, goal, measurement and guardrail edits do not need separate Apply or Save steps.
- Start with empty Request text, no selected metric and no prefilled current/target/limit numbers. The screenshots' signup example and guardrail values were test data, not product defaults.
- Current values are mandatory before pickup. A brand-new feature may use an explicit per-metric **No existing data** exception; selecting the New feature tag alone does not waive an existing baseline. Missing values remain unknown, never zero. The primary exception does not automatically exempt guardrails.
- Targets remain optional in the approved wireframe and its New Request implementation. No mandatory-target gate is added.
- Exact measurement dates replace the relative window after release. Current values and results must use comparable audience, platform and period length. All form labels remain above their controls, and current/target or current/limit values share one unit per metric.

The remaining measurement and closure guidance below is historical planning context where it conflicts with this Intake decision. Local implementation is recorded separately from staging and production release evidence.

### Earlier measurement rationale

Remove the mandatory guessed target. A requester should be able to say “640 of 1,000 people complete signup today; we want more people to finish” without promising that a design change will reach 80%.

Use **Metrics** while defining the Request and **Results** when recording its outcome. Retain the everyday explanation “What should improve?” above the metric chooser. “Baseline” remains an internal term. During intake, use **Current numbers** and reveal inputs appropriate to the selected measure. At closure, preserve that saved observation as **Before** and ask for **After**. Never overwrite the starting numbers with the closing observation.

For example: record 60 of 100 people finishing signup before the product changes; enter 75 of 100 at closure. Lane shows 60% → 75%, up 15 percentage points. The requester enters observations at two different times, not a prediction followed by a verdict.

The primary measure answers what should improve. A guardrail answers what must stay within an acceptable limit. An existing operational requirement can justify a limit; it is not a forecast. Without an agreed success threshold, Lane must not say “Target met” or declare a Request successful from a small positive change.

Predictions can be useful in other contexts. The proposed Lane decision is narrower: people should not have to invent them to request design work.

## Scope and preserved rules

- One primary measure and optional guardrails. Start with none; **Add guardrail** and **Add another** progressively reveal editors using the same preset and custom metric types. Each saved guardrail collapses to an editable summary.
- Preserve a concrete pass/fail verification route for work that is not sensibly measured numerically.
- Preserve the submitter's responsibility for results and closure regardless of their PM, Designer or Developer profile label, with the existing target contract's explicit owner-transfer recovery when necessary.
- Work remains Open → In Progress → Done. Done does not imply a release or measured outcome.
- Outcome remains the approved target Not started → Measuring → Closed. It is not currently implemented.
- A negative result or breached guardrail can close with evidence and an explicit next decision. Closure records what happened; it does not certify success. Unfinished agreed delivery cannot be labeled Done to use this path.
- Preserve truthful exceptions, permanent closure, attributable corrections and linked follow-up Requests.
- Keep the named trio's agreement and no-bypass rules. A measurement proposal must not silently change permissions or implementation order.
- Use existing Arc components and Lane tokens. All form labels sit above their controls; number rows are compact and responsive.
- No new dashboard route, custom metric administration screen, integrations, reminders, cron, automated collection, significance engine, AI analysis or individual rankings.

## What exists today

Verified in the local checkout on 13 October 2026:

| Area | Current implementation | Work this proposal adds |
|---|---|---|
| Primary metric | Freeform name, optional baseline, required target and editable unit | Defined templates, observations and no compulsory target |
| Alternative | Verified result text | Preserve a concrete check and record its actual verification |
| Guardrail | One optional name, absolute numeric limit and unit | Structured current/actual observations and limit evaluation |
| Timing | Check-in interval | Release anchor and actual observation dates |
| Saving | Draft recovery, signed AI review and persisted expected-impact snapshot | Versioned measurement compatibility across those boundaries |
| Results | Read-only expectation summary | Actual-result entry and a comparison record |
| Closure | Mark Done for work | Creator-owned outcome closure and its required recovery paths |

Hosted deployment was not inspected for this planning exercise. Local implementation does not prove staging or production availability.

## Concrete metric choices

Offer a small menu of recognizable questions. These are templates with clear definitions, not generic suggestions such as engagement, quality or business impact.

| Requester chooses | Example | Current numbers | Normal direction |
|---|---|---|---|
| More people finish a task | Signup completion | Completed attempts and eligible started attempts | Higher completion rate |
| People finish a task faster | Time to complete checkout | Median duration, unit and number of measured completions | Lower duration |
| Fewer attempts fail | Failed payment attempts | Failed attempts and eligible payment attempts | Lower failure rate |
| Fewer people need help | People contacting support about checkout | Unique people needing help and eligible people in the same population | Lower support-contact rate |
| More eligible people use something | Use of a new export action | Unique users of the action and eligible users | Higher adoption rate |

Completion, failure, support and adoption share a rate model, but have distinct event and eligibility definitions. Do not treat visitors, people, sessions and attempts as interchangeable.

Completion rate is completed transactions divided by started transactions; starts and completions must be defined. This follows [GOV.UK's completion-rate guidance](https://www.gov.uk/service-manual/measuring-success/measuring-completion-rate).

Each template provides the format, unit and ordinary improvement direction. Use a meaningful measure name, such as **Signup completion**, rather than a separate top-level **Task or feature** field. Keep the event definition, included population and observation period in compact expandable metric details. Request type, Project and Priority chips cannot supply those measurement definitions. Remove the global `%` default from time or count measures. Do not ask users to assemble a definition from three unrelated freeform boxes.

Put **Add custom…** last in the metric picker. The compact editor asks for a meaningful name, format (**Percentage**, **Count** or **Duration**) and whether higher or lower is better; reveal unit and period where the chosen format needs them. Preserve the metric definition and included population in expandable details. A percentage can be entered directly or calculated from counts. Custom metrics use the same validation, comparison and guardrail behavior as presets; no formula builder or separate metric-administration screen is introduced. Additional formats such as satisfaction scales still require a precise definition and a separately scoped decision.

Selecting any preset or custom metric reveals its relevant **Current numbers** fields. A completion rate may accept **64%**, with **Enter counts instead** revealing completed and started counts. A duration needs a value, unit and consistent statistic; a count needs its measurement period, such as **20 support requests per week**. Do not show a generic `%` input for every choice.

For counts, show both the period and any relevant exposure. “Support contacts fell from 20 to 10” is not a reliable improvement claim if usage also collapsed. A count-only result can remain a descriptive count when exposure is unavailable.

For duration, retain the same statistic before and after. Never compare an average with a median or silently change seconds to minutes. Product task duration is not employee time tracking.

## Baseline requirements

Numbers from before the change are required for a before/after comparison. A baseline helps establish what changed; [GOV.UK's service-benefits guidance](https://www.gov.uk/service-manual/measuring-success/measuring-service-benefits) also emphasizes establishing the starting point.

**Accepted planning rule, reflecting Nikhil's preference on 13 October:** people can create a Request and add the starting numbers any time while it is Open, before someone picks it up. Pick up currently starts work, so it is the visible enforcement point. A measured Request with missing starting numbers shows “Add current numbers before picking up”; both the interface and server must refuse starting delivery until the measurement is ready. This is an accepted proposed behavior, not a guard already present in the app.

The durable rule is **before delivery work starts**. If assigning a person and starting work become separate actions under the existing target contract, assigning someone remains possible; Start work carries this check. The current named-trio agreement rules still apply. A material measurement added or revised after an agreement must be included in the version the trio agrees before work proceeds.

This requirement applies to the before/after delivery route. An explicitly agreed first-observation route for a new capability, or a pass/fail verification route, does not require a fictitious before-number. Investigation undertaken to establish the starting measurement may proceed under the existing target's bounded discovery agreement. It must not be mislabeled as delivery or used to bypass agreement. The team chooses the route before starting that work, not after seeing disappointing results.

The creator remains responsible for supplying or confirming the starting numbers. No separate access to analytics is assumed. Missing values remain null, never zero, and Open stays available for gathering the information.

The minimum comparable observation contains:

- The task/event and eligible population.
- The observed value, with underlying numerator and denominator for a rate when available.
- The exact period the observation represents.
- The unit and statistic, supplied by the template where possible.

Validate counts and durations as nonnegative finite values. Binary completion/failure rates require a numerator no greater than the denominator. Event counts per person are a different type and must not be mislabeled as a percentage of people. Reject reversed observation dates and preserve the counting rule.

Allow entry of a percentage copied from an existing report. If its sample size is unavailable, retain that fact, label the sample unavailable and do not imply statistical certainty. Prefer underlying counts when available; calculate the percentage instead of asking the user to calculate it.

Do not reinstate a separate creation-time “Where will you check?” questionnaire. Existing attachments and links can support the numbers. At closure, one report, screenshot or concise measurement note must support the recorded observations. Lane records the supplied evidence; it does not independently certify it.

**Check in 14 days** remains one compact interval after the recorded release. It is distinct from “these numbers cover 1–14 November.” The former says when to return; the latter determines whether the comparison is meaningful. Display observation dates in the metric's compact detail rather than a second scheduling form. Any suggested dates require confirmation; submission date is not an observation date.

## Missing numbers and new capabilities

| Situation | Treatment |
|---|---|
| Existing measure, baseline known | Record it and compare against the same definition later |
| Baseline not yet measured | Keep it explicitly missing while Open; collect and agree it before Pick up starts delivery work |
| New capability with an existing journey | Prefer measuring the existing journey, such as task completion or time |
| Entirely new measure | Agree a first-observation route; record the result without claiming improvement. If closing without a comparison, use an inconclusive outcome with the reason “No comparable before measurement” |
| A concrete capability must work | Use an observable check and evidence, such as keyboard completion of the whole checkout |
| Baseline cannot be recovered | Close with the existing truthful exception route and reason; retain available actual numbers but do not count them as measured improvement |

Absence of a feature is not automatically a zero baseline. Zero is valid only when it is a real observation under the same definition. A zero denominator is undefined, not 0%.

Offer **Number** or **Pass/fail check** when defining what should improve. Pass/fail checks must describe the task and conditions. “Improve usability” is not a check. “A keyboard-only user can complete checkout without a focus trap” is. At closure, record **Passed**, **Failed** or **Could not verify**, with evidence or a precise reason verification was unavailable. A passed check is a verified capability, not an invented percentage impact; it needs no fictitious numeric baseline.

Distinguish a result check from agreed delivery acceptance. If keyboard completion is itself a promised capability and still fails, that delivery is unfinished. A failed post-delivery result can close honestly only after the agreed delivery is complete. **Could not verify** remains an explicit inconclusive exception, never a pass.

## Guardrail behavior

Guardrails protect aspects that must not deteriorate beyond an agreed limit. This role is distinct from the primary improvement metric in [Microsoft's metric taxonomy](https://www.microsoft.com/en-us/research/group/experimentation-platform-exp/articles/patterns-of-trustworthy-experimentation-during-experiment-stage/).

Keep the separate inset **Add guardrail** editor already established in Lane. Choose a preset or **Add custom…**, provide its current observation and set an explicit **At or below** or **At or above** limit. The selected template supplies the format and ordinary unit; retain its population definition in compact details. Each saved guardrail collapses into one editable line. **Add another** opens a fresh editor without expanding all saved guardrails.

For example: “People needing signup help: currently 4%; must stay at or below 5%.” That gives a baseline, an intelligible constraint and a later comparison. No automatically invented limit and no default percentage on arbitrary support counts.

At closure:

- Evaluate inclusive limits against the saved definition and precision.
- Show **Within limit**, **Outside limit**, or **Not measured**.
- Show the observed change as well. A move from 3% to 4% can be within a 5% limit and still be deterioration.
- A missing result is never a pass. If an agreed guardrail cannot be measured, normal measured closure is unavailable; use a measurement-unavailable exception, specify that the guardrail is missing and preserve any primary observations. A guardrail cannot simply be deleted at closure.
- A breach remains visible when the Request closes. It does not force the user to keep the Request open or alter the threshold.
- Account for every saved guardrail separately. One guardrail passing cannot hide another breach or missing observation. More guardrails also mean more results to record; add one only for a specific plausible downside of the change.

Multiple optional guardrails are accepted for the revised wireframe and planning contract. Absolute limits are enough; relative tolerances remain outside this increment. Production support still requires its own approved implementation scope.

## Request journey

### Create

The composer keeps its borderless title and description, followed by compact property chips: **Request type**, **Project** and **Priority**, plus the existing link and attachment actions. **Bug**, **Improvement** and **New feature** are mutually exclusive Request type choices, not three independent tags. Preserve existing property behavior; no new taxonomy or screen is implied.

Replace Expected impact with Metrics. Selecting a preset or custom metric reveals only its relevant **Current numbers** inputs; choosing a pass/fail check reveals its concrete criterion. There is no separate Task or feature field. Metric definition and population remain available in compact expandable details. A complete numerical section folds to a sentence such as:

> Signup completion · 640 of 1,000 attempts (64%) · Check in 14 days

The 15 October wireframe decision retains the Goal section and visible measurement settings. Optional guardrails can be added to the same Request draft without a separate save action. Targets remain distinct from observed current and closing values; never present a target as an observation.

### Agree and deliver

The trio agrees the problem, delivery scope, direction, metric definition or concrete check, starting observation where applicable and any guardrails. Preserve the agreed version. Material changes require renewed agreement under the existing target contract. Freeze the comparison basis at release; later corrections remain visible.

Release must be explicitly recorded. Mark Done cannot silently supply a launch date. Check-in dates are calculated from that release; this proposal adds no notifications or automatic closure.

### Record and close

Inside Request detail, the creator uses **Record results**. Definitions and starting values are already present and read-only as **Before**. Ask for **After**, its actual period, evidence and any material comparison limitation; for a concrete check, ask for its verification state and evidence. Repeat the same compact entry for every saved guardrail.

Lane calculates a preview immediately. **Close outcome** records the outcome snapshot after that preview. Negative, unchanged and inconclusive results are valid; positive change is not a closure requirement. This remains separate from the existing **Mark Done** action. **Done** means the agreed work was delivered. **Closed** means the requester recorded what happened and the next decision. Closed does not mean successful.

| What happened | Treatment |
|---|---|
| Agreed functionality is missing or broken | Delivery is unfinished; complete the agreed scope rather than marking it Done and calling the defect a disappointing outcome |
| The agreed change was delivered, but the metric stayed flat or worsened | Record the observations and evidence, choose the next decision and close honestly |
| The primary measure improved but a guardrail breached | Preserve both facts prominently; closure requires evidence and an explicit next decision |
| Someone proposes further product work | Create a linked follow-up with its own scope and agreement; do not quietly extend the completed Request |

For a disappointing outcome or guardrail breach, require a next decision: **Accept the tradeoff** with a reason, **Pursue a linked follow-up**, or **Rolled back** with the recorded action and reason. Recording rollback is a factual report, not a button that performs a deployment. A plan to roll back must not be represented as a completed rollback.

A follow-up does not have to be completed before the original Request closes. It must be considered and agreed separately; creating it does not automatically assign more work to the original designer. The requester owns the result and this next decision regardless of profile role. Closed remains permanent; new work never silently reopens or expands it.

An owner can explicitly close with a truthful exception such as measurement unavailable, not launched, rolled back or superseded. Keep the reason and available observations. Do not hide exception closures from later reporting.

## Results presentation

Put the useful numbers first. Use one primary comparison (or concrete verification result), compact guardrail rows and expandable measurement details. Reuse existing Request detail rather than creating an analytics dashboard.

**Illustrative values only; not Lane results:**

> **Signup completion rose from 64% to 76%**
>
> **+12 percentage points**

| Measure | Before | After | Reading |
|---|---:|---:|---|
| People completing their first signup attempt | 640 / 1,000 (64%) | 760 / 1,000 (76%) | Observed increase of 12 percentage points |
| People needing signup help | 40 / 1,000 (4%) | 30 / 1,000 (3%) | Within the agreed maximum of 5% |

Below it, show who was included, both actual observation periods, evidence and who recorded the outcome. This example uses two comparable 14-day periods, each with 1,000 eligible first-time mobile signup users and one initial attempt per person. The support measure counts distinct people from each corresponding group, not the number of contacts. Its figures are illustrative observations, not a causal claim.

Display hierarchy:

1. One headline describing the observed change, plus the actual before/after values.
2. Primary measure and every guardrail comparison, with textual states as well as color.
3. Sample size, observation periods and any comparison issue.
4. Evidence and an optional short explanation; details expand on demand.
5. The next decision, linked follow-up or recorded rollback where applicable, closure record and any later factual correction alongside the original.

Do not add a trend line from two points, fake statistical confidence, an overall impact score or a celebratory success state simply because a number rose. Without causal evidence, the headline says what changed after release, not what the design caused.

If the primary measure improves but the guardrail breaches, both facts remain in the headline or its immediate subline. If the records are not comparable, lead with **Results cannot be compared** and show the observations without an improvement claim.

## Calculation and comparison rules

| Case | Required behavior |
|---|---|
| Rate from counts | Numerator / denominator × 100; validate the relevant population and counting rule |
| Percentage change | Show after − before in percentage points first |
| Relative change | Optional detail only; (after − before) / before × 100 when the baseline is nonzero |
| Zero baseline | Show absolute change; relative change is unavailable |
| Lower is better | A lower error rate or duration is favorable; preserve the numeric sign in the displayed change |
| Different durations | Convert compatible units explicitly; retain the same statistic |
| Different audiences, instrumentation or definitions | Flag the comparison; do not silently produce an improvement verdict |
| Different traffic | Show denominators; raw event counts do not imply per-user improvement |
| Missing sample | Label it; do not manufacture one or infer certainty |
| Tiny observed change | Preserve calculation precision and disclose rounding; no universal significance threshold |

For the illustrative 64% → 76% example, the absolute difference is **12 percentage points** and the relative increase is **18.75%**. They must never share an ambiguous “+12%” label.

A before/after comparison cannot isolate seasonality, concurrent releases or population shifts on its own. Lane should retain a short limitation note and linked related Requests. It should not attempt to replace an experimentation platform.

## Data preservation and authority

The logical record needs a versioned metric definition or concrete check, baseline observation where applicable, actual observation or verification state, an optional list of guardrails with their limits and observations, release anchor, next decision and immutable closure snapshot. Store definitions with the Request so later template updates cannot reinterpret old results. This is a logical model, not an approved database migration.

Maintain these boundaries in the eventual engineering specification:

- Preserve historical Expected impact records, their targets, Verified results and null/unknown values. Do not turn old targets into baselines or silently discard them.
- Use explicit version-aware readers. Old drafts must remain recoverable; do not tighten the draft reader in a way that deletes them.
- Bind the exact reviewed measurement snapshot into the signed review. Editing it requires fresh review; retain user/workspace binding and current expiry behavior.
- Calculate closure summaries on the server from validated observations. A client-provided delta or outcome label is not authoritative.
- Derive identity from the session and preserve workspace and guest own-Request isolation on data, evidence and mutations.
- Permit closure only for the creator or explicitly transferred outcome owner. A PM label or admin role does not silently grant closure authority.
- Use version checks and transactional persistence for concurrent edits/closure. Repeated submissions must not create duplicate outcomes.
- Corrections preserve the original observation and closure. New product work uses a follow-up rather than reopening Closed.

## Quarterly and yearly results

Build this only after Request-level observations and closure are working with real teams. It consumes the same records, not another reporting form.

Start with reporting coverage and individual results: how many are measured, still waiting, inconclusive or closed by exception. As a proposed reporting basis, group by recorded release quarter and show an explicit as-of date; later-arriving outcomes update that cohort. Never infer a release from Done. Unlaunched work remains visible separately.

Measured observations and measured improvement are different. Unchanged and negative comparisons stay in ordinary measured results. First observations and partial results stay visible under their reasoned exception, without being counted as comparative improvement. No reporting view should discard them merely because they do not show a gain.

Do not sum percentage-point changes, percentages, medians or unrelated units. Compatible rates can be pooled only from non-overlapping underlying counts with the same definitions. Results influenced by several Requests must not be credited independently to each. Shared-result representation and deduplication need their own approved specification before numerical aggregation ships.

No individual performance score, target accuracy score, ROI claim or annualized saving is derived from these observations.

## Bounded delivery sequence

This is a product decision plan. Each approved implementation slice still needs its own exact schema, action and test specification. The sequence below does not silently reorder the accepted launch/alignment plan.

### 1. Confirm the contract and review both ends

- [x] Record Nikhil's preferred timing: save while Open, add current numbers before Pick up starts delivery; preserve explicit discovery/new-capability/verification paths.
- [x] Record removal of the mandatory primary target and acceptance of concrete pass/fail and truthful exception paths.
- [x] Record one primary measure, custom metrics and multiple optional guardrails added progressively for the revised wireframe.
- [x] Record honest closure for completed delivery with flat/negative results or a guardrail breach, an explicit next decision and separately agreed follow-up work.
- [ ] Review the revised disposable creation wireframe and its matching closed result together, including a negative result, multiple guardrails, a concrete check and a missing-baseline case. A later production-component Storybook review remains necessary before implementation sign-off.
- [ ] Obtain a scoped implementation decision and reconcile `REQUIREMENTS.md` §§1, 3–5, 9 and 15; `AGENTS.md`; `lane-roadmap.md`; and the affected 10/10 launch and 10/11 creation-to-outcome decisions. Conversation approval of this planning direction does not silently amend those contracts or authorize a migration.

The review should establish whether a requester can choose a measure and supply its starting values without an explanation from us, and whether a teammate can read the result and distinguish change from proof of causation.

### 2. Save concrete measurements end to end

Reuse `src/lib/request-impact.ts`, `request-schema.ts`, `intake-draft.ts`, `triage-token.ts`, Intake actions/form, `expected-impact-fields.tsx` and `expected-impact-summary.tsx`. Add a small static template definition module if needed; no workspace catalog administration.

- [ ] Specify versioned legacy/new records and observation validation.
- [ ] Implement chosen metric entry, review, persistence, draft recovery and detail display as one usable slice.
- [ ] Update the canonical database constraint through an approved migration; verify backup and staging before production.
- [ ] Update data/search readers that currently inspect expected-impact JSON keys.
- [ ] Verify old records remain readable and recoverable and changed measurements cannot reuse an old signed review.

Relevant test homes: `src/lib/request-impact.test.ts`, `intake-draft.test.ts`, `triage-token.test.ts`, `src/db/request-impact-schema.test.ts`, Intake `expected-impact-actions.test.ts`, and Intake/composer/detail stories.

### 3. Integrate the agreed measurement with alignment and release

- [ ] Have the existing separately scoped alignment increment consume the measurement version and baseline policy.
- [ ] Enforce the starting-number requirement on the server when Pick up starts delivery; carry it to Start work if assignment is separated. Preserve legitimate discovery and withdrawal.
- [ ] Implement an explicit release record and immutable comparison basis within the approved release/readiness work.
- [ ] Verify assignment, Done and profile labels cannot bypass those responsibilities.

Do not show a working “Measuring” promise until the release anchor and outcome persistence actually exist.

### 4. Deliver creator-owned results and closure

Use existing Request detail, its actions and shared auth guards. The outcome domain/storage and recovery flows require a focused specification before coding.

- [ ] Implement actual entry and comparison preview for the saved measurement definition or concrete check.
- [ ] Implement transactional closure with evidence, observed results, every guardrail state, the explicit next decision and truthful exceptions.
- [ ] Include explicit owner-transfer recovery, append-only corrections and follow-up handling required by the current contract.
- [ ] Verify creator/transferred-owner permissions, guest isolation, concurrent closure and permanent Closed behavior.
- [ ] Review real pilot results before selecting period reporting as the next increment.

## Required acceptance examples

| Scenario | Expected result |
|---|---|
| 640/1,000 → 760/1,000 | 64% → 76%, +12 percentage points; optional +18.75% relative |
| Median time 120s → 90s | 30 seconds less; optional 25% decrease |
| Count 0 → 5 | +5; no infinite or fabricated relative percentage |
| Empty baseline | Missing state; never coerced to zero |
| Rate denominator zero | No calculated rate; prompt for a valid observation or truthful exception |
| Maximum guardrail 5%, actual 5% | Within limit |
| Maximum guardrail 5%, actual 6% | Outside limit; closure still possible with breach preserved |
| Guardrail actual missing | Not measured; never marked within limit |
| Two guardrails, one within and one outside its limit | Both states remain visible; closure records the breach, evidence and next decision |
| Custom count or duration metric | Relevant unit/period or statistic is preserved; no automatic percentage default |
| Direct current percentage with no counts | Preserve the entered rate and label sample unavailable; do not fabricate a denominator |
| Concrete pass/fail check | Passed, Failed or Could not verify with evidence or an explicit unavailable-verification reason; no fictitious numeric baseline |
| Agreed delivery capability is still broken | Delivery is unfinished; do not label it Done to use outcome closure |
| Delivered change worsened the measured result | Preserve the negative result; permit closure with evidence and the next decision |
| Closed Request has a linked follow-up still Open | Original stays Closed; follow-up needs separate scope and agreement |
| Baseline from another audience | Comparison issue shown; no unqualified improvement headline |
| New capability without comparable before | First observation or verification; no invented lift |
| Old target-based Request | Original baseline, target, source and text remain readable |
| Unauthorized or stale close | Server rejects it and preserves the valid record |
| Correction after closure | Original remains visible; correction is attributable; Closed remains Closed |

No application behavior, canonical requirement, database or deployment was changed in this planning pass. The accepted decisions above authorize the planning and disposable prototype update only; production implementation remains separately scoped.
