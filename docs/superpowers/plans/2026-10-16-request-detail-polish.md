# Request detail polish implementation plan

**Goal:** Fix the six approved detail-layout findings and retain the familiar property pills after creation.

**Architecture:** Recompose existing saved data and Arc controls. Keep lifecycle, permissions, drafts, review flows and the shared Supabase token mapping intact.

**Scope:** No new routes, schemas, dependencies or backend behavior.

- [x] Regroup `measurement-plan-summary.tsx`: primary metric with adjacent Current/Target values, compact supporting context, guardrails with matching Current/Maximum or Minimum values. Preserve zero, missing baseline, pass/fail and custom-date states.
- [x] Reuse existing Status/Priority controls as secondary Arc pills in `detail-properties.tsx`; show an explicit Properties trigger on compact layouts. Preserve drawer focus return, keyboard menus and guest restrictions.
- [x] Tighten `detail.module.css` section spacing. Remove redundant empty review/comment copy while preserving accessible labels and populated states; match the review loading fallback to its compact row.
- [x] Populate the detail fixture sidebar from its actual Project and provide a stable populated LAN-13 preview alongside the interactive intake flow.
- [x] Update existing detail assertions for the visible Properties cue and simplified empty state. Verify typecheck, lint, design checks, detail/measurement/review stories and production build.
- [x] Inspect the real rendered sample at desktop and compact widths, exercise menus and focus return, then leave the updated dark preview open.

Layout-only changes use rendered verification and existing behavioral tests; no implementation-mirroring tests are added.

Verification: 69 affected Storybook tests passed; TypeScript, scoped ESLint, Arc source ledger and Next production build passed. Visually inspected 390/768/1024/1440 widths and both themes; Priority menu, Properties drawer and focus return verified. Shared token cleanup in this checkout was preserved.
