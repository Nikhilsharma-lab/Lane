# Shared control consistency implementation plan

**Goal:** Fix the actual workspace search and Request properties through shared Arc components and the existing Supabase token mapping.

**Architecture:** Keep Arc behavior and motion. Replace the workspace's hand-written search shell with SearchField; map SegmentedControl to the pinned Supabase text-tone segmented control; reuse Button's surface for read-only property Badges instead of maintaining a third chip style.

**Constraints:** Preserve saved data, permissions, search cancellation/debounce, keyboard focus, reduced motion and responsive layout. No new visual values outside the Supabase source. No deployment or database changes.

- [x] Add rendered regressions in workspace-search and request-detail stories: search icon inset, segmented frame/selection, matching read-only/editable property geometry. Run them before implementation.
- [x] Adapt SearchField with an accessible hidden-label option, use it in WorkspaceSearchPane, and remove duplicate search CSS.
- [x] Add sourced segment-role hooks to lane-arc-theme.css; preserve Arc's shared-layout animation and arrow-key behavior. Remove page-specific category dimensions.
- [x] Add Badge control appearance using Button's existing CSS classes; retain noninteractive span semantics. Use it for Done/guest properties and remove detail-only button padding.
- [x] Update Arc provenance and design documentation; run design checks, TypeScript, lint, affected browser stories, responsive dark/light checks and production build.
- [x] Verify the search and Request detail in the actual localhost app; save visible evidence.

Pinned segmented reference: Supabase commit 64a6aa908594975646d157def9e7a74940634d8f, packages/ui/src/components/shadcn/ui/toggle-group.tsx and toggle.tsx. Text tone: transparent frame, p-px track, gap-0, rounded-md frame, rounded-sm indicator, bg-accent selection, no selection border/shadow. Tiny size: 26px height, px-2.5, text-xs. Values already exist in supabase-tokens.css; only role mapping is needed.

## Verification

- Before implementation, all three rendered regressions failed for the reported inset, segmented frame and mismatched property shape. They now pass.
- Affected search, Request detail, intake-to-detail and shared-control stories: 60/60 passed at 1440px/light. Focused checks also passed at 390px/dark/reduced motion (3), 768px/light (3) and 1024px/dark including long content (5).
- Token-contract tests: 16/16. Application token audit and Arc provenance check passed. TypeScript, scoped ESLint, production build and git diff whitespace check passed.
- Actual localhost app: refreshed bundle, searched LAN-1, opened the saved Request, opened Priority and used Escape to return focus. Search input and category material, plus Done/High/Properties geometry, were visually inspected.
- Evidence: `artifacts/request-detail/shared-search-fixed.png` and `artifacts/request-detail/shared-properties-fixed.png`. No deployment or database mutation was needed. Existing Supabase contrast exceptions remain.
- Two pre-existing search-story expectations omitted the AbortSignal argument; corrected those assertions without changing search behavior.
