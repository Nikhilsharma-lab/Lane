# Quiet Metrics

Nikhil asked for the approved Quiet treatment on Settings → Metrics, Add metric and every control inside it, and for the oversized metadata strings to leave New Request’s metric dropdown.

The library now leads with the name and unit, followed by counting notes and a short source link. Add/Edit metric and inline Add metric use Arc Select for the unit. Optional guidance is shorter, actions align at the end, phone inputs use the base text size, and long duplicate names no longer enter action labels. The picker offers name and unit only; counting definitions and URLs remain in the library and definition pages.

Pending saves lock the values being submitted. Add metric cannot close during save. Inline metric saves hold New/Edit Request open and disable Review/Save and measurement changes. Adaptive dialogs check dismissal before a phone sheet moves offscreen, preserving existing Request close/cancel behavior. Errors identify the unit control and focus it. Permissions, server actions, definitions, drafts, uploads and AI behavior are unchanged.

## Verification

- 1,017 UI tests across 94 files; the initial focused run failed six expectations before implementation.
- TypeScript, source/e2e/scripts ESLint, theme/Arc/brand contracts, production build and bundle budget passed. Whole-checkout ESLint also encounters 24 pre-existing errors in ignored backup migration scripts; those files were not changed.
- Actual production components in an isolated local Vite harness: desktop dark Add metric validation/focus, keyboard unit selection, pending lock, successful close/focus return; New Request’s nested unit selection retained both parent layers and inline saving disabled Review and measurement fields. No real Request, metric or AI call was submitted.
- Browser-rendered 390px dark and 320px light phone sheets: controls and actions fit; pending save plus drag/Escape stayed visible; failed save retained values and re-enabled retry. This is viewport testing, not physical iOS keyboard/VoiceOver verification.
- Independent standards and behavior reviews found hover/error-border and sheet-dismissal issues; all were corrected and re-reviewed.
- Signed-in hosted verification is pending release and Mac unlock. Local harness evidence is not an authenticated app or hosted write test.

Local evidence: `/private/tmp/lane-quiet-metrics-evidence/`; check logs: `/private/tmp/quiet-metrics-*.log`.
