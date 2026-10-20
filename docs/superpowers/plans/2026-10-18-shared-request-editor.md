# Shared Request editor implementation plan

Authorized by Nikhil: New and Edit use the same editor and features; preserve saved data, blank historical measurements and New's gate; verify LAN-16 locally against staging, never production.

1. Add browser regression coverage for the real Edit form: shared title/description, property pickers, link popup, file selection/removal, complete measurement controls, unchanged save, changed-content review and upload recovery. Observe failures first.
2. Make the existing Intake editor the single rendering/workflow implementation. Edit supplies its saved Request and guarded save action; New retains its existing review-token/create action. Retain the existing upload/recovery implementation. Isolate edit drafts from New and preserve optimistic-concurrency snapshots.
3. Keep complete-impact validation for New and existing completed records; historical blanks remain blank. Preserve saved framing and legacy context on unrelated saves. Use existing Arc controls and Supabase tokens.
4. Run focused browser and save-preservation tests, full suites, lint/type/design checks. In the actual app verify LAN-16 through save, reload and reopen without filling missing data. Record verified results and limitations in SESSION-STATE.
