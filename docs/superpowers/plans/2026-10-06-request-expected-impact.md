# Request Expected Impact Implementation Plan

> **For agentic workers:** Execute the checked scope task by task with the existing parallel ownership. The user has authorized this increment; no additional implementation approval question is needed. Checkboxes below are verification gates, not claims that a release has shipped.

**Goal:** Record what a Request should achieve at creation, preserve that expectation through review and save, and show it on the existing Request detail page.

**Architecture:** Extend the existing Intake form, scoped draft and signed review token with one typed Expected impact snapshot. Store it in a nullable `requests.expected_impact` JSONB column so existing Requests remain readable. Reuse the free ReUI Field/InputGroup/Select compositions inside the current `c-dialog-1` composer and direct-entry form; do not add a route or a second workflow.

**Tech Stack:** Next.js 16, React 19, TypeScript, React Hook Form, Zod, ReUI with supplied shadcn Base UI controls, Drizzle/Postgres, existing Clerk guards, Vitest and Storybook browser tests.

## Global Constraints

- Approved 2026-10-06 scope is Expected impact at Request creation, review and saved detail. It applies to all Request types, including Bug, Improvement and New feature.
- PM / Designer / Developer remain profile labels, not permissions. The requester records the expectation and owns future result follow-through; a named PM or PM profile label does not transfer that responsibility.
- One primary success criterion. Use Metric or Verified result; do not force every Request into a business metric.
- Current value may be unknown. Store an empty baseline as `null`, never a fabricated zero. A metric still requires an explicit numeric target and unit.
- Drafts may be incomplete. Review and new saves require a complete expectation. AI continues to classify only title/description; it must not invent or evaluate targets, baselines or evidence.
- Preserve the borderless title/description, Project/type pickers, Related link, private attachments, existing validation and recovery. Context belongs in the description; do not restore separate Context/Evidence fields. Existing legacy draft details remain visible read-only.
- Preserve routes, shared workspace visibility, guest boundaries and Open → In Progress → Done. Server actions receive `{orgId}` and derive identity through the existing session guards.
- No actual-result entry, launch recording, automatic due dates, reminders, alignment/versioning workflow, closure/follow-ups, reporting or additional AI calls in this increment.
- Canonical SQL is applied to staging first, only after a fresh verified backup. Production promotion is a separate release action. Tests that reset a database run only against loopback `lane_test`.

## Approved contract

| Mode | Required at review/save | Optional |
| --- | --- | --- |
| Metric (`kind: "metric"`) | Metric name, numeric target, unit, data source/method, whole number of days after launch | Current value (`baseline: null` means not measured yet) |
| Verified result (`kind: "verification"`) | Specific observable success criterion, source/method for checking it, whole number of days after launch | No numeric baseline, target or unit required |

`src/lib/request-impact.ts` is the shared contract. Its limits are metric 120 characters, unit 40, source 1,000, verified result 2,000 and review window 1–3,650 whole days. Numeric measurements may be zero, negative or decimal; non-finite values are rejected. “Verified result” names the intended method of measurement, not proof that the result has happened.

The snapshot reviewed by the requester is signed with the existing request/workspace/person token. Save reads Expected impact from that token, never from an extra client-supplied payload. Editing the expectation requires returning to composition and obtaining a fresh review. New saves with a valid older token lacking impact return a recoverable field error; an idempotent retry with a current signed impact snapshot still returns the already saved Request’s original ID. This makes the reviewed creation snapshot immutable within the current application flow; it is not a claim that the JSONB column has a database immutability trigger or that future agreement versioning exists.

## Task 1: Validate, preserve and persist the expectation

**Files:**
- Create: `src/lib/request-impact.ts`, `src/db/migrations/0016_request_expected_impact.sql`.
- Modify: `src/lib/request-schema.ts`, `src/lib/intake-draft.ts`, `src/lib/triage-token.ts`, `src/app/(app)/intake/actions.ts`, `src/db/schema/requests.ts`, `src/test/global-setup.ts`.
- Tests: `src/lib/request-impact.test.ts`, `src/lib/request-schema.test.ts`, `src/lib/intake-draft.test.ts`, `src/lib/triage-token.test.ts`, `src/app/(app)/intake/expected-impact-actions.test.ts`, `src/db/request-impact-schema.test.ts`.

**Interface:** `ExpectedImpact` is the strict discriminated union; `ExpectedImpactDraft` allows incomplete fields. `requiredExpectedImpactSchema` converts the draft to a complete snapshot at review. `requests.expectedImpact` is `ExpectedImpact | null` for legacy compatibility.

- [x] Establish failing coverage for both modes, unknown baseline, zero/negative/decimal values, incomplete drafts, invalid days, empty strings and length limits. Use an explicitly synthetic fixture such as:

  ```ts
  const impact = {
    kind: "metric", metric: "Signup completion", baseline: null,
    target: 65, unit: "%", source: "Signup funnel", reviewAfterDays: 30,
  } as const;
  expect(expectedImpactSchema.parse(impact)).toEqual(impact);
  expect(expectedImpactSchema.safeParse({ ...impact, target: null }).success).toBe(false);
  ```

- [x] Validate impact before the existing AI call; keep the AI input exactly `{title, description}`. Preserve partial impact in scoped drafts and sign complete impact in the review token. Verify tampering, workspace/person binding, old-token recovery, spoofed save arguments and idempotent saves.
- [x] Add the nullable JSONB column and CHECK constraint through migration 0016. Accept SQL NULL for existing rows; validate both complete modes for new non-null values. Keep Requests RLS and grants unchanged.
- [x] Run the focused suite against the existing guarded disposable local database. The global setup refuses non-loopback databases and any name other than `lane_test`:

  ```sh
  pnpm exec vitest run src/lib/request-impact.test.ts src/lib/request-schema.test.ts src/lib/intake-draft.test.ts src/lib/triage-token.test.ts 'src/app/(app)/intake/expected-impact-actions.test.ts' src/db/request-impact-schema.test.ts
  ```

## Task 2: Compose and review with source-backed controls

**Files:**
- Create: `src/components/requests/expected-impact-fields.tsx`, `src/components/reui/composer/select.tsx`.
- Modify: `src/app/(app)/intake/intake-form.tsx` and its existing mocked action/story fixtures.
- Reuse: `src/components/reui/intake/field.tsx`, `src/components/reui/composer/input-group.tsx`, the supplied Input/Textarea controls and `src/components/requests/expected-impact-summary.tsx`.
- Tests: `src/stories/intake.stories.tsx`, `src/stories/request-composer.stories.tsx`, `src/stories/fixtures/request-impact.ts`.

**Interface:** `ExpectedImpactFields({value, onChange, disabled, errors})` consumes `ExpectedImpactDraft`. The shared summary accepts only a complete `ExpectedImpact` and contains no editable controls.

- [x] Inspect free ReUI `c-field-1` and `c-field-3` and their supplied APIs; retain installed source hashes in the [source record](../../design-system/reui-coss-sources.md). Use Field/FieldLabel/FieldError, a controlled Base UI Select and InputGroup's `days` suffix. No Coss Select substitution is needed.
- [x] Add one inline Expected impact section. A small “Measure with” Select chooses Metric or Verified result. Metric uses Metric, optional Current value, Target value and Unit; Verified result uses Success criterion. Both share Data source and Measure after launch. Desktop groups related values; phone stacks them within the existing scrolling dialog.
- [x] Keep intermediate numeric text editable, convert only finite values, and preserve an empty control as `null`. Switching modes preserves the shared source/timing and restores the previous mode's in-session values. Preserve keyboard selection and focus, associate field errors, and carry `reui-theme` into the Select portal.
- [x] Show the complete expectation on human review. Editing returns to composition; successful re-review creates a fresh signed snapshot. Missing impact in an older recovered review returns the requester to the fields without losing title, description, metadata or attachments.
- [x] Extend focused browser cases for required impact before AI, both modes, unknown baseline, draft recovery, mode switching, signed review display and return-to-edit. Retain the existing Project, upload, AI and save recovery cases.

## Task 3: Show the saved expectation without inventing results

**Files:**
- Create: `src/components/requests/expected-impact-summary.tsx`.
- Modify: `src/components/requests/detail-view.tsx`, `src/stories/request-detail.stories.tsx` and the existing typed detail fixtures as needed.

- [x] Render a labelled Expected impact region using the saved snapshot. Metric shows Metric, Current value, Target value, Data source and Measure after launch. A null baseline reads “Not measured yet.” Verified result shows Success criterion, Data source and the same timing.
- [x] Keep Requests with `expectedImpact: null` readable without fabricated targets, empty result forms or blocking migration prompts. Verify both populated modes and the legacy-null detail state.
- [x] Keep the summary read-only. Do not relabel the prediction as an actual result, introduce reporting or change pickup/completion behavior.

## Task 4: Verify the complete bounded increment

- [x] Run the full Intake and composer browser stories on desktop/light, plus affected detail cases; repeat the seven impact/detail cases on phone/dark. Desktop execution also covers the existing auth/error/upload recovery states. Do not run a second browser suite concurrently with the shared Storybook/Vite process:

  ```sh
  STORYBOOK_THEME=light STORYBOOK_WIDTH=1440 pnpm test:storybook src/stories/intake.stories.tsx src/stories/request-composer.stories.tsx src/stories/request-detail.stories.tsx
  STORYBOOK_THEME=dark STORYBOOK_WIDTH=390 pnpm test:storybook src/stories/intake.stories.tsx src/stories/request-composer.stories.tsx src/stories/request-detail.stories.tsx
  ```

- [x] Run scoped ESLint, `pnpm typecheck`, `pnpm build` and `git diff --check` after runtime changes stop. Inspect desktop/light and phone/dark compose, selection, validation, review and saved-detail captures. Automated checks do not establish visual acceptance.
- [x] Allowlist the verified Lane Staging database, create a fresh restricted-access custom-format export, verify its table/data entries and restore parsing, then apply the canonical transactional 0016 SQL. Compare existing row counts; inspect the new constraint, legacy-null reads, RLS and grants. Keep credentials out of logs. Record exact evidence before claiming staging success; production remains unchanged.
- [x] Open and inspect the actual local app. Verify form interaction without creating fake production data or spending a real AI call solely for a visual check. Record which checks use synthetic Storybook fixtures versus local PostgreSQL versus hosted staging.
- [x] Synchronize `DESIGN.md` and `marketing/DESIGN.md`, append source/adaptation provenance, and have the lead record final checks and remaining limits here or in `docs/design-system/checkpoint.md`. This document alone is not release evidence.

## Completion boundary

This increment is complete when a requester can compose either form of Expected impact, recover an unfinished draft, review the exact expectation, save the signed snapshot and read it on the existing Request. Future actual results remain the requester's responsibility in the approved product contract, but the corresponding collection, launch timing, alignment and reporting screens are not implemented by this plan.


## Verification record — 2026-10-06

- Data/action/draft/token tests: **86 passed** across eight isolated files; `.next-audit/expected-impact-unit-after-db-fix.log`. The review token draft limit was increased after a real maximum-length multilingual/JSON-escaped round-trip regression exposed lost drafts. Earlier edited problem text is retained as `previousProblem` while impact is added.
- Disposable loopback PostgreSQL `lane_test`: **19 passed**; `.next-audit/expected-impact-db-fixed.log`. The first run exposed double-encoded JSON in the test fixture; the corrected test uses `connection.json` and checks actual JSON objects. Canonical migration SQL did not require a change.
- Full desktop Intake: **37 passed**; `.next-audit/expected-impact-intake-full-desktop.log`. Existing composer: 17/18 on its first run; the Project-and-clear case passed unchanged on an isolated rerun after a popup-close pointer-event race. No runtime fix was inferred from that transient test failure.
- Affected detail: **3 passed** on desktop. Seven focused impact/detail cases passed on phone/dark; strengthened legacy-review recovery passed again on both sizes. Mode switching retains each mode's in-session values and the common source/window.
- Scoped ESLint, TypeScript, production build and whitespace checks passed. `.next-audit/expected-impact-build.log` records the final build. These checks do not establish production release readiness.
- Ten synthetic Storybook screenshots are in `test-results/expected-impact/`; desktop/light and phone/dark compose/review were inspected. Phone metric entry scrolls vertically with the action reachable. The rebuilt authenticated app at `http://localhost:3000/` was opened and inspected with the new composer visible. No live AI call or fake Request was submitted for visual inspection.
- Staging migration **0016 applied** to allowlisted Lane Staging `jznepeqghjixcrpuddym`. Fresh mode-0600 public-schema/data archive: `backups/lane-staging-pre-0016-2026-10-06T07-32-51-048Z.dump` (32,002 bytes); archive entries and full restore parsing verified before apply. Manifest: `.next-audit/impact-staging-backup.json`; apply/verification: `.next-audit/impact-staging-migration.log`. Existing row counts and Requests RLS/grants stayed unchanged. This is schema verification, not a hosted end-to-end AI creation test. Production was not migrated or deployed.
- No code was committed or pushed. Named trio agreement, launch, actual-result closure, exceptions and cumulative reporting remain the confirmed target for later bounded increments.

## UI cleanup after visual review — 2026-10-06

The user accepted the direction and requested a cleaner UI. The description starts at three rows instead of five and continues growing with content. Both impact rows share the same three-column desktop grid, with Data source spanning two columns. The Expected impact heading has clearer weight; the repeated footer instruction is removed. The same ReUI controls, fields, draft and save behavior remain.

Scoped ESLint and production build passed. The three existing required-impact, mode-switching and contextual-create stories passed on desktop and phone (six executions). Six compose screenshots in `test-results/expected-impact-cleanup/` were inspected; mobile fields stack and the action remains reachable. The rebuilt localhost composer was opened with the existing draft retained. No database change was needed.
