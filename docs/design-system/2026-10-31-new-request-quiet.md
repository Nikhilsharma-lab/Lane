# New Request: Quiet

Nikhil selected Quiet on 2026-10-31 after comparing Current, Quiet and Split, then approved updating the app. Current and Split were not selected; no further rejection reason was given.

The single column, wrapping title, compact Goal selector and flat measurement sections are applied to Intake. Project, Labels, Priority, Reviewers, Add link, Goal, metrics, audience, platform, dates and guardrail controls retain Arc components and theme values. Menus handle long content, search, selection, viewport limits and keyboard focus. The clear-search slot becomes inert during exit so rapid Tab cannot land on a disappearing control.

The change is integrated onto current production source `b6f7c20d`, preserving its Goal wording, loading placeholders, field errors, deferred Metrics fetch, retained composer, draft/upload recovery, review, permissions and data. No service actions, dependencies, routes, schemas or migrations change.

## Verification

- Typecheck, full ESLint, design contracts and production build passed. Bundle growth remains within the existing 2 KB gzip budget.
- Safety suite: 52 passed. UI suite: 1,016 passed. Full suite on the checkout-assigned disposable local database: 2,918 passed, one skipped (260 files passed, two skipped).
- Standards and spec reviews found no remaining actionable concerns after the disappearing clear-search Tab stop was fixed.
- Signed-in integrated app: Project search and rapid Clear → Tab, New Project → Cancel, reviewer → Tab to question, long metric selection, close/reopen with title, description, reviewer and metric intact. No captured console errors. Existing lane-e2e users and a marked temporary workspace were used; no Request, upload or AI review was submitted.
- The earlier approved preview covered the remaining dropdown selections, custom date range, guardrails, error/retry and 390px light/dark layout. Final integrated hardware-phone, VoiceOver, exhaustive roles and real AI/upload/save checks are not claimed.

Release artifacts and exact hosted verification are recorded separately after deployment.
