# Research: which impact data already exists per Request (#144)

Question: for a planned impact dashboard, which data already exists for each Request?
Scope: schema, migrations 0028–0031, the 2026-10-21 plans, and the status docs. Findings only; no product code changed.
Snapshot: branch `theme-file` (HEAD `7165765`). It contains the #58, #59 and #60 commits (`24ddf82`, `baf8fcf`, `d2e259f`).

Note on range: the ticket asked for 0028–0030. Migration `0031_simple_request_agreement.sql` (unapplied anywhere) rewrites parts of 0028 and 0030, so it is included.

## Short answer

| Data | Stored today? | Where (column) | Notes |
|---|---|---|---|
| Expected impact | Yes | `requests.expected_impact` (0016, 0021, 0022, 0027) | Current value only. Overwritten on edit. No revision history. |
| Release date | Yes (after release) | `requests.release_state.release.exposureDate` (0029) | Null until someone records a release. |
| Measurement due date | Yes (after release) | `requests.release_state.release.dueDate` (0029) | Stored as a UTC date. "Days remaining / overdue" is calculated at read time, not stored. |
| Actual result | Yes (after measured closure) | `requests.outcome_closure` (0030) | Holds a copy of the agreed expectation, the actual, guardrail actuals, evidence and observation period. |
| Exception with reason | Yes (after an exception closure) | `requests.exception_closure` (0028 shape, extended 0030, codes narrowed 0031) | Holds the reason code and free-text reason. |
| Correction history (outcome) | Yes | `requests.closure_corrections` (0030) | Append-only array. Enforced by SQL trigger. |
| Correction history (release) | Yes | `requests.release_state.history` (0029) | Append-only. Covers corrections, voids and transfers. |
| Correction history (expected impact) | No | n/a | Edits overwrite the value. Nothing keeps earlier predictions. |
| Related Requests | Partly | `requests.follow_up_of` (0030) | Follow-up links only. Replacement links were dropped in 0031. |

## What is stored today

### Expected impact
- Column: `requests.expected_impact jsonb` (migration 0016; Drizzle `src/db/schema/requests.ts` line 57, typed as `ExpectedImpact`).
- Shapes (`src/lib/request-impact.ts`, `expectedImpactSchema`):
  - `metric`: metric name, baseline, target, unit, source, review days, optional guardrail, optional extras.
  - `verification`: result text, source, review days, optional guardrail.
  - `measurement` (v2–v4, from 0022 and 0027): structured plan with a primary metric, guardrails and a measurement window.
- A partly filled draft is kept in `requests.measurement_draft` (0023). It is not used for completed impact.
- Unit and metric are free text, not a structured metric key. Comparing Requests by "same metric" would need matching on text.
- Editing an Open Request's expected impact resets reviews (0031 `reset_reviews_on_edit`). It does not keep the old value.

### Release date and measurement due date
- Column: `requests.release_state jsonb` (migration 0029; `requests.ts` line 41, typed as `ReleaseState`).
- Current release fact (`src/lib/request-release.ts`, `ReleaseFact`): `exposureDate`, `audience`, `evidence`, `dueDate`, `startDate`, `windowKind` (`fixed` or `relative`).
- Due date rules (`releaseWindow`): a fixed window uses the agreed end date. A relative window adds the agreed review days to the exposure date, in UTC. The result is stored as `dueDate`.
- "Due today / N days overdue" is calculated by `releaseMeasurement(now)`. It is not stored.
- Ownership: `release_state.ownerId`. Authorship stays in `requests.created_by`.
- SQL guards (0029 `protect_release_history`): history cannot be edited or deleted, a release needs an appended event, and released work must stay `done`.

### Actual result (measured closure)
- Column: `requests.outcome_closure jsonb` (migration 0030; `request-outcome.ts` `OutcomeClosure`, version 1).
- Stores: `expected` (a copy of the agreed expectation at closure), `release` (copy), `primary` (numeric actual with unit, or pass/fail), `guardrails` (each with its agreed limit and its actual), `evidence`, `observedFrom` / `observedTo`, owner, actor, close time, operation key.
- Only the current owner can close, and only from the UTC due date (plan `2026-10-21-outcome-closure.md`; SQL checks in 0030).

### Exception with reason
- Column: `requests.exception_closure jsonb`, validated by `valid_agreement_exception`.
- Current codes (migration 0031 and `request-outcome.ts` `EXCEPTION_REASONS`): `rolled_back`, `cannot_measure`, `other`.
- The 2026-10-21 outcome-closure plan lists four codes (`cancelled`, `rolled_back`, `measurement_unavailable`, `inconclusive`). That list is superseded by 0031 and the code.
- Only one closure per Request: SQL `requests_single_closure` (0030) allows `outcome_closure` or `exception_closure`, not both.
- Old `superseded` exceptions were converted to Open by 0031.

### Correction history
- Closure corrections: `requests.closure_corrections jsonb NOT NULL DEFAULT '[]'` (0030). Each entry has field, correction, reason, actor, time and revision.
  - Measured closures can correct: actual, guardrails, evidence, observation period.
  - Exception closures can correct: reason only.
  - SQL (0031 `protect_request_closure`) makes earlier entries unchangeable and allows one new entry at a time.
- Release history: `release_state.history` (0029). Each event has input (release, correction, void or transfer), previous and new release fact, previous and new owner, revision and operation key.
- Agreement and review events: table `request_agreement_events` (0028, kept by 0031). Its use for review answers was not checked in detail.

### Related Requests
- Column: `requests.follow_up_of uuid` (0030), with a same-workspace foreign key, an index, and a check that a Request cannot follow itself.
- Immutable once set (0031 `protect_request_closure`).
- Multiple follow-ups per original are allowed (plan). Reverse lookup (original to its follow-ups) is a query on this column, not a stored link.
- Replacement links (`request_replacements`, 0028) were dropped in 0031. The `superseded` path no longer exists.

## What is planned but not built

- **Impact dashboard:** no plan file. None of the five 2026-10-21 plans mention a dashboard. `lane-roadmap.md` says #60 has "no reporting screen". `REQUIREMENTS.md` (around line 179) says "no separate reporting route is selected yet".
- **Reporting rules (confirmed target, 2026-10-06, `REQUIREMENTS.md` around lines 660–672):** derive reports from the same Request expectations, releases and outcomes; keep the submitted prediction and each agreed revision; compare the same metric, unit, audience and window; show measured, still-due and exception outcomes separately; define the quarter/year basis (not yet defined).
- **Dashboard prerequisite gaps** (from the rules above): see the "missing" list.

## What is missing for the dashboard

1. **Prediction history.** Expected impact is overwritten on edit. `REQUIREMENTS.md` says to "preserve the submitted prediction and each agreed revision." The 0028 snapshot that did this was removed by 0031. Only closed Requests keep a copy (`outcome_closure.expected`).
2. **Expectation for exception closures.** An exception closure does not copy the expectation. A dashboard must read the live `expected_impact`, which may have changed.
3. **Structured metric key.** Metric and unit are free text, so cross-Request grouping is fragile.
4. **Quarter/year basis and cutoff.** Not defined (`REQUIREMENTS.md` lists it as a reporting requirement).
5. **Indexes for "due soon" queries.** Due dates live inside JSON (`release_state`). No index on that path exists in 0029–0031.
6. **Attribution and deduplication rules.** Not defined. The rules say the same shared result must not be counted for several Requests.

## Is #60 live in production?

No. Evidence:
- **Code:** commit `d2e259f` ("feat: close Requests with actual impact or a reasoned exception (#60)", 2026-10-21) is on `origin/main` and on this branch.
- **Database:** `docs/SESSION-STATE.md`, section "October 21 — staging 0028 → 0030 applied": 0028–0030 were applied to **staging** only. It says "Production is untouched" and "any production migration" is still not done.
- **Migration 0031** (the simplification) is unapplied everywhere (`docs/SESSION-STATE.md`, #74 section).
- So the production database should not have the `release_state`, `outcome_closure`, `closure_corrections` or `follow_up_of` columns. Any #60 feature would fail there until a migration is applied.
- Caveat: the docs do not confirm which app deployment is serving production today. The older production notes describe a pre-Clerk deployment.
- Also: the #60 e2e spec (`e2e/request-outcome.spec.ts`) was written but not run on hosted services.

## Sources

- Schema: `src/db/schema/requests.ts` (lines 41–58, 90), `src/db/schema/request-agreements.ts`
- Migrations: `src/db/migrations/0016_request_expected_impact.sql`, `0021_…`, `0022_request_measurement_plan.sql`, `0023_…`, `0027_…`, `0028_request_agreements.sql`, `0029_request_release.sql`, `0030_request_outcome_closure.sql`, `0031_simple_request_agreement.sql`
- Types: `src/lib/request-impact.ts`, `src/lib/request-release.ts`, `src/lib/request-outcome.ts`, `src/lib/request-reviewer-rules.ts`
- Plans: `docs/superpowers/plans/2026-10-21-release-measurement.md`, `…-outcome-closure.md`, `…-request-agreement-persistence.md`, `…-leftover-build-plan.md`, `…-request-peek.md`
- Status: `docs/SESSION-STATE.md`, `lane-roadmap.md`, `REQUIREMENTS.md`, `PRODUCT.md`
- Git: `git branch -r --contains d2e259f`; `git merge-base --is-ancestor`
