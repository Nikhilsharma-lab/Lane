# Metrics clarity and sign-in polish

Nikhil requested clearer metric fields, correction of the overlapping metric picker, and the same approved Quiet treatment on sign-in.

“Where it lives” is now “Dashboard link (optional)”, with a direct explanation of the report link. Add/Edit metric no longer exposes a free-form calculation editor. Existing counting notes remain visible as “Saved definition” and are passed through unchanged when another field is saved. A metric name does not establish a universal calculation, so this change does not invent formulas or rewrite existing definitions.

Metric names can wrap across multiple lines without overlapping the following option. The row-height override now survives CSS module ordering. The Metrics library link is a full-width footer row with an external-link indicator, separate from metric choices and status messages. The shared picker covers primary and guardrail metrics.

Sign-in uses the existing Arc materials and theme tokens through Clerk's appearance API: visible social buttons, flat primary buttons, 16px inputs, restrained keyboard focus, consistent spacing and quieter legal links. Password input trailing space remains owned by Clerk so its Show/Hide control fits. The reset link sits below the form. Clerk still owns authentication, recovery, validation, redirects and session tasks; shared appearance changes also reach signup and embedded auth tasks.

## Verification

- Reproduced a 40px metric label inside a 28px row; corrected row grows to 56px and clears the next option.
- Regression test first failed with the editable calculation textarea; now confirms saved notes remain visible without an editor.
- 1,018 UI tests across 94 files passed. Final focused auth/metric rerun: 35 tests across four files passed.
- TypeScript, focused ESLint, theme/Arc/brand checks, production build and bundle budget passed.
- Actual components in a local harness: wrapping, footer placement and Escape focus return; real Clerk sign-in at 320px dark and 390px light widths. Actual local Next sign-in: native empty-email validation and keyboard focus. No sign-in, metric save or AI call submitted.
- Read-only review corrected password-control spacing and aligned loading skeleton spacing with installed Clerk source. These checks do not claim physical-phone, screen-reader or completed authentication coverage.

Local evidence: `/private/tmp/lane-metrics-auth-evidence/`. Hosted evidence is recorded separately after release.
