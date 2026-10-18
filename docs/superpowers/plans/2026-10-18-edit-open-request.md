# Edit Open Request implementation plan

**Goal:** Allow the creator to edit all entered Request content and measurement definitions while Open, as approved by Nikhil on 2026-10-18. After pickup, keep the existing lifecycle and locks.

**Architecture:** Reuse Arc controls, Project/type/priority pickers and existing measurement editors in one Edit Request dialog. Reuse the existing five-per-minute AI review for changed title/description. A guarded server action validates the complete edit, checks a snapshot under a row lock, and updates the same Request without changing its identity, creator, lifecycle, comments or attachments.

**Scope:** Title, original description, reframed problem, suggested change, supporting context/link, Project, type, priority, primary metric/current/target/unit, measurement audience/platform/window, all guardrail fields and add/remove guardrails. System-generated identity and history are not form fields. Existing file and comment workflows remain intact. No new routes, tables, migrations or AI providers.

- [x] Test creator/workspace/status authorization, concurrent edits, reviewed source content, full measurement edits and invalid input.
- [x] Implement guarded save and reuse existing field components in the edit dialog.
- [x] Verify tests, types, lint and actual-app editing, including cancel, save and reload.

Verification: 11 local database integration tests and focused ESLint passed. Actual app LAN-17: changed guardrail maximum 6% to 7%, saved and reloaded to confirm persistence, restored 6%, and cancelled an unsaved title edit. Original title and AI problem remain separate. Full TypeScript check has no errors in the edit implementation, but is blocked by existing `exact` option errors in workspace-search stories. No production changes.
