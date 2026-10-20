# Workspace Labels Implementation Plan

**Goal:** Replace single Request type with reusable workspace Labels and finish shared green metric menus.

**Architecture:** Keep Arc controls and Supabase tokens. Add a workspace custom-label catalogue and a Request label-key array; default keys preserve the existing enum values. Keep the internal Request type as a derived compatibility value for existing measurement readiness rules, prioritizing New feature when selected. Signed intake data includes label keys. Guards validate workspace ownership and prevent guest creation. No label-management screen.

**Constraints:** Production untouched. Back up and verify staging before migration. Open-only creator/admin editing and the new Request AI gate remain enforced. Historical null measurements and context remain untouched.

- [x] Reproduce metric ordering/colour regression, implement through the shared Select composition, verify primary and guardrail.
- [x] Test label validation, duplicate names, workspace isolation and guest denial. Add canonical migration, catalogue actions and guarded Request saves. Verify locally.
- [x] Share searchable multi-select and colour presentation across New/Edit, saved detail, rows and filters. Preserve default labels and draft recovery.
- [x] Verify staging backup, apply only the label migration, compare saved Request data before/after.
- [x] Verify actual app create/select/remove labels, save/reopen, keyboard and metric dropdowns; run type, lint, app and browser checks. Update handoff.

Linear reference observed: searchable checkbox choices with colour dots and selected items first; no-match Create new label action leads to scope then colour. Lane uses workspace scope automatically. Inspection stopped before creating any Linear label.

Follow-up approved: retain workspace-wide labels and a separate Project pill. Compact the shared menu, remove the visible search heading, use an Add labels… placeholder, show overlapping dots and a count for multiple labels, and create through direct colour choices. No project-scoped schema or management screen. Current verification details and the one corrected animation assertion are recorded in SESSION-STATE.md.

Later supersession explicitly approved: add Workspace/selected-Project scope, keeping Project assignment
separate. Implemented and verified `0025` after a fresh staging backup. Prefix-only type-ahead, no-match
creation CTA, equal-size dots and stable count content replace the earlier picker behaviour. Project
scope is enforced on server saves and in the database; changing Project never silently deletes labels.
Live save/reopen and restored-data evidence is in SESSION-STATE.md.
