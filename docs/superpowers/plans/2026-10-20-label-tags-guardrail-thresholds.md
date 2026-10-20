# Shared label tags and guardrail thresholds

User-authorized scope: consistent label pills throughout Lane; guardrails consist of metric, comparison and threshold, without current-value input.

1. Centralize label presentation in request-labels. Reuse the Arc small Badge and equal inline padding in listing, detail, search preview and picker trigger. Preserve the compact list overflow count and picker interactions.
2. Share five comparison definitions across draft/save schemas, selector and summaries: less than, greater than, equal to, less than or equal to, greater than or equal to. Preserve stored at_most/at_least meanings.
3. Remove guardrail current-value controls and pickup requirements. Retain historical JSON values without deleting or inventing data. Primary current-value requirements remain.
4. Add canonical database validation migration and verify against disposable local lane_test. Apply to staging only if authorized, after a verified export. No production migration.
5. Verify comparison persistence/validation, older snapshots, browser interactions and shared tag computed styles. Run typecheck, lint, design checks and focused suites. Record exact evidence in SESSION-STATE.

No new routes, tables, AI calls or background jobs. Existing drafts, metric units, role/tenant guards and signed review remain authoritative.

## Approved follow-up: inline values and custom metrics

Use the shared Arc Select with opt-in left indicator and trailing accent symbols. Compose metric search/create with existing Arc Popover/Input/Button and shared picker geometry. Move threshold beside comparison and offer all four units inside every numeric value field. Preserve old snapshots via version 4 and migration 0027. Apply only to backed-up staging under the existing explicit authorization, then verify local database round trips, keyboard interaction, responsive geometry and original staging rows.
