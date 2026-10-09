# Request review — bounded implementation

The user approved the next step after accepting Expected impact and the composer cleanup. This increment completes the pre-save human review inside the existing composer and `/intake` fallback.

## Result

- Show the original title, selected Project/type, original description and any editable AI suggestion without cramped side-by-side columns.
- Preserve the existing Expected impact summary and earlier draft details.
- Show the exact related link and queued filenames/sizes. Files upload after creation; AI reads title/description only.
- Keep Edit Request and Create Request as the two actions. Retain validation, loading, expiration, authentication and upload recovery.
- Bind an edited problem statement to the title/description it was reviewed against. A failed new review must not falsely associate older wording with changed text. Preserve the text and its known origin across draft restoration and sign-in.

## Implementation and checks

1. Add failing browser stories for link/file confirmation and original/suggestion/mixed branches in `src/stories/intake.stories.tsx`.
2. Add failing recovery stories in `src/stories/intake-review-recovery.stories.tsx`, then fix review-source binding in `intake-form.tsx` and the backward-compatible scoped draft contract. Add draft tests for legacy and bound wording.
3. Reuse installed free ReUI `c-item-2` Item controls for supporting rows and existing `c-alert-2` notices. Keep one composer surface; no additional Card. Sources and APIs remain recorded in `docs/design-system/reui-coss-sources.md`.
4. Check both modes and recovery in desktop/light and phone/dark; verify accessible links, long URL/filename wrapping, focus and edit retention. Run focused draft/unit tests, scoped lint and a production build. Inspect actual production-component Storybook states and open the local preview for the user.

No new database schema, routes, AI calls or integrations. Trio agreement, saved arrival changes, launch and actual-result closure are separate later increments. Storybook uses synthetic examples and mocked AI/save boundaries, not real submissions.

## Verification — 2026-10-06

- New supporting-details browser scenarios failed before implementation and passed afterward: problem, solution and hybrid branches. The complete Intake file passed **40/40 desktop scenarios** (`.next-audit/review-intake-desktop.log`); the three new scenarios also passed at phone width in dark mode (`.next-audit/review-supporting-phone-dark.log`).
- Recovery browser coverage passed **7 scenarios** across the new recovery file and existing legacy-review case: changed-source failed retry, changed-source reload, sign-in retention, expired-review correction/retry and legacy origin handling. Command: `node node_modules/vitest/vitest.mjs run --config vitest.storybook.config.ts src/stories/intake-review-recovery.stories.tsx src/stories/intake.stories.tsx --testNamePattern 'Changed Request|Sign In Preserves|Expired Review|Legacy Wording|Legacy Review Needs Impact'`. Result is retained in agent tool output session `46227`, chunk `08e412` (7 passed, 39 skipped), rather than a filesystem log.
- **13 draft unit tests passed**, including source-bound recovery and legacy drafts. Command: `node node_modules/vitest/vitest.mjs run --config .next-audit/compact-composer-unit.config.mts src/lib/intake-draft.test.ts`; tool output chunk `a64f8f`.
- Scoped ESLint and TypeScript passed. Production build exited zero (`.next-audit/request-review-build.log`); the rebuilt local app is running on port 3000.
- Seven production-component screenshots were inspected under `test-results/request-review/`: original/solution/hybrid reviews, long link/file content, and contextual composer desktop/phone. No horizontal overflow or obstructed actions was found. Supporting-detail stories also assert valid link destinations, safe new-tab behavior and absence of premature upload/save calls.
- Opened and verified the live [review sample](http://localhost:6006/?path=/story/intake-request-flow--problem-review-supporting-details) in Codex. The user's existing app draft was left intact. Storybook examples use synthetic data; no live Request or upload was created for visual QA.

This completes the local review increment, not hosted release verification or Nikhil's visual acceptance. The next bounded step is S1–S4: save, attachment recovery and saved arrival. Known navigation/reload/filter gaps remain listed in `phase-0-ux-skeleton.md`.

## Approved preview refinement

After the source audit, Nikhil asked to see the four proposed refinements: one stage-aware review heading, Current/Target side by side, always-visible review actions, and supplied Item row padding. The actual composer owns its header/body/footer in one flex hierarchy, preserving the same form state and handlers. The direct-entry Intake fallback retains its page heading and inline actions. No new route, backend behavior or library dependency is introduced.

Refinement checks: all 20 composer scenarios passed across the desktop suite and focused rerun; the last test-only fix waited for the dialog entrance animation before comparing footer coordinates. The focused run passed 2 composer plus 3 direct-page scenarios; both new composer scenarios passed at phone width. Logs: `.next-audit/review-polish-focused-desktop.log`, `.next-audit/review-polish-focused-phone.log`, `.next-audit/review-polish-composer-desktop.log`. Scoped lint passed. Four light/dark and phone screenshots were inspected under `test-results/request-review-polish/`. The [sample review](http://localhost:6006/iframe.html?id=requests-new-request-composer--review-preview&viewMode=story) was opened in Codex and the correct title, impact groups, padded rows and fixed actions visually verified.

Final production build passed (`.next-audit/review-polish-build.log`) after removing an unsupported Testing Library query option in the new stories. The local app was restarted from this build; the user's open app draft was not reloaded or changed.
