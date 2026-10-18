# New Request measurement form implementation

**Approval:** Nikhil approved building the reviewed wireframe in the actual repository on 15 October 2026.

**Goal:** Ship the approved New Request composer using existing Arc controls and current Supabase-derived tokens, with durable measurement data and current values required before pickup.

**Architecture:** Add a versioned measurement branch to the existing expected-impact JSON snapshot. Preserve legacy records, signed AI review, workspace authorization, draft recovery and private attachments. Reuse the existing Intake and Request detail routes.

## Scope

- Keep borderless title/description and Project, Request type, Priority, link and attachment controls.
- Keep compact dropdowns, Goal and the full Define measurement section; omit Team check-in.
- One draft, no separate metric/guardrail save steps. Retain Lane's required problem-framing review before final creation.
- Generic metric presets, typed custom metrics, optional target, current value, shared audience/platform/window or exact dates, multiple optional guardrails and concrete pass/fail checks.
- Current values may be missing at creation. Both single and bulk pickup must refuse missing values. A documented new-feature exception applies only to the primary metric; guardrails still need current values.
- Allow the creator to add current values on the existing Open Request detail with concurrency protection.
- No results/closure workflow, new route, table, integration or AI call. No hosted migration or deployment in this local implementation.

## Delivery and checks

- [x] Domain: test typed units, zero versus unknown, optional targets, dates, guardrails, exceptions and compatible unit conversion; implement `request-measurement.ts` and extend the impact union.
- [x] Persistence: test complete signed snapshot, tampering rejection, priority, incomplete draft recovery and legacy compatibility; wire request schema, token, draft and Intake save.
- [x] Composer: reuse Arc Select custom triggers, Input, Checkbox and Button; implement approved sections and validate keyboard, responsive, long-label and error states using production components in Storybook.
- [x] Pickup: enforce readiness in atomic single/bulk transitions, add creator-only current-value editing while Open, and test authorization/concurrency boundaries.
- [x] Migration: add a canonical CHECK constraint migration for the versioned snapshot, preserve old records, verify against disposable local `lane_test` only. Hosted promotion requires verified backup and staging-first execution.
- [x] Integration: render the complete saved measurement summary, preserve existing review/uploads, run targeted unit/browser tests, typecheck, lint, design check and production build. Open the updated real-component preview.

## Local verification

- Full unit/database suite: 79 files, 815 tests passed against disposable `lane_test` after a verified local backup.
- Combined Intake, measurement and current-value browser suite: 64 tests passed. The final guardrail identity fix adds a regression; its full 11-test measurement suite passed afterward.
- Native browser checks: keyboard dropdown selection, malformed numeric input blocks review, correction resumes review, clearing invalid text resets validation, and removing identical guardrails retains the surviving row's own state.
- Actual composer inspected at desktop, 768px and 390px; controls align, content scrolls without horizontal overflow, and the primary action remains reachable.
- Production build, TypeScript, ESLint, Arc source check and diff whitespace checks passed. Existing draft, review, upload-recovery and Request-detail stories remain covered.
- Workspace search includes new preset labels, custom names and guardrails within its existing access boundaries.

**Release boundary:** No hosted database or deployment changes. Apply `0022_request_measurement_plan.sql` after a verified staging backup **before** deploying this app version; pickup uses its readiness function. Verify staging before production. Existing legacy impact records retain their previous pickup policy.

## 16 October refinement

Nikhil requested one compact dropdown pattern, consistent number/unit fields, stronger icon contrast, a coloured direction tag, contextual metric help, custom audience/platform options, and preservation of entered current values when measurement settings change.

- Reused Arc Select custom Button triggers, Badge and Popover help; inspected current MCP documentation. Every numeric unit uses the same compact selector inside its input. All field labels stay above controls.
- Open is a fixed status for new Requests, with a keyboard-accessible explanation. Creation does not skip pickup or create Done Requests.
- Audience, platform, relative window and exact-date edits retain primary and guardrail numbers. Incompatible unit changes still clear numbers rather than relabel a percentage as a count; seconds/minutes convert correctly.
- Custom audience/platform names are optional fields for backward compatibility, required when Custom is chosen, trimmed and capped at 100 characters. They survive draft/review/save and display in the summary. Existing snapshots keep their previous shape.
- Removed always-visible pickup instructions and the destructive measurement-change notice. Current-value policy remains available through contextual help and enforced at pickup.
- Verified 106 focused domain, intake, storage and action tests; 14 measurement browser scenarios in desktop light and 390px dark with reduced motion; 3 intake integration scenarios. TypeScript, scoped lint, Arc source check and production build passed.
- Release boundary is unchanged: migration 0022 was amended locally; no hosted migration or deployment was performed.
- Final edge checks: 26 draft-recovery tests passed, including inactive custom-name retention. Guardrail removal now restores focus after the Add control is re-enabled; all 3 relevant removal scenarios passed, including the 20-guardrail cap.

### 16 October compact-pill correction

- Applied existing accent and semantic colour tokens to property/measurement icons; removed chevrons from all composer pills.
- Section 3 is one wrapping row of audience, platform and measurement-window pills with accessible names but no repeated visible headings. Removed subtext in sections 2, 3 and guardrails.
- Measurement window now includes Custom dates. Reused official Arc Calendar inside Arc Dialog with From/To, staged Apply/Cancel, date-order validation and return focus. The old exact-dates disclosure is removed; existing saved date fields and baseline values are preserved.
- Added child-modal overlay styling so the calendar dims the parent composer. Arc Dialog's defaults remain unchanged.
- Verified all 16 measurement stories; 6 focused desktop integration/calendar scenarios and 8 phone dark/reduced-motion scenarios passed. Final nested-modal focus and composer-header regressions passed after overlay/scroll corrections. TypeScript, scoped ESLint, Arc source integrity and the final production build passed. Dark/light calendar and phone layout were inspected in the browser.
- Local preview only; no hosted migration or deployment.

### 16 October progressive metric layout

- Removed section numbers, metric/current-value info icons, the primary section subheading and the redundant Open status pill from creation.
- Renamed the first card Primary metric. Selecting a metric now reveals its current/target fields in that card; pass/fail and custom metrics retain their existing relevant controls and validation.
- Guardrails use the same compact structure: metric and boundary pills followed by aligned current/limit inputs, revealed after metric selection. The Remove action stays in the header.
- The goal fields, measurement settings, draft/review data and pickup rules are unchanged. This supersedes the earlier separate Goal card and contextual-help presentation above.
- Verified 16 measurement stories, 4 Intake integration stories and 4 focused 390px dark/reduced-motion stories. TypeScript, scoped ESLint, Arc source integrity, whitespace checks and the production build passed. Inspected the actual composer in the local browser; no hosted deployment.
