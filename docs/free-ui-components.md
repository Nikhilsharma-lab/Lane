# Requests UI source provenance

## Current populated Requests page — 2026-09-29

The page adapts the **official shadcn Tasks example**, using its actual table, toolbar, column header, faceted filter, column visibility and pagination source. It is not an unchanged ready-made Requests product.

- Example: https://ui.shadcn.com/examples/tasks
- Source: https://github.com/shadcn-ui/ui/tree/main/apps/v4/app/(app)/examples/tasks
- Local implementation: `src/components/requests/tasks/` and `src/app/(app)/requests-overview.tsx`.
- Runtime: the upstream TanStack Table 9 implementation (`@tanstack/react-table` 9.2.4).
- Added official base-nova primitives: `command`, `input-group`, `dialog` from `https://ui.shadcn.com/r/styles/base-nova/{name}.json`. Command uses `cmdk` 1.1.1.
- Existing official local Button, Input, Badge, Separator, Popover, DropdownMenu, Select and Table primitives are reused.

Approved adaptations: Tasks becomes Requests; columns use Lane problem, status, submitter, assignee and submission date; statuses are Open, In Progress and Done; real rows retain existing detail links and workspace authorization. Demo priorities, selection/bulk actions and editable demo actions are omitted. Status is single-select to preserve Lane's existing status context. Existing keyboard return-focus handling is retained. No dashboard summary cards are used.

Compatibility adaptations: local imports and cn helper, Lane typography tokens, Lucide icons, Base UI render composition instead of Radix asChild, and explicit state selectors. Search/sort/filter/pagination operate only on the existing authorized result set (maximum 200); no API, database or permission changes.

## Persistent sidebar

Actual official base-nova Sidebar source and its Sheet, Tooltip, Skeleton and mobile-hook dependencies are retained in `src/components/ui/`.

- Registry: https://ui.shadcn.com/r/styles/base-nova/sidebar.json
- Composition reference: https://ui.shadcn.com/r/styles/base-nova/sidebar-07.json
- Lane composition: `src/components/shell/sidebar.tsx`

The header/content/footer structure is adapted to Lane's workspace identity, Requests, Settings, notifications and Clerk sign-out. It uses Sidebar's collapsible=none variant from 640px; phone navigation retains Lane's existing Base UI dropdown. This is not the full unchanged sidebar-07 demo. Local tokens, deterministic skeleton width and useSyncExternalStore are compatibility adaptations.

## Plane navigation correction

The sidebar now contains Requests context, New Request, All Requests (My Requests for guests), Open/In Progress/Done status links, and bottom notifications, Settings → Members/Profile, and account controls. The hypothetical app rail stays hidden. Status links and the Tasks toolbar share the existing `?status=` URL. Profile labels do not gate access; guests never see Members.

Plane sources inspected on the preview branch: `apps/web/components/sidebar/sidebar-wrapper.tsx`, `apps/web/components/workspace/sidebar/projects-list.tsx`, `apps/web/components/workspace/sidebar/quick-actions.tsx`, and the workspace extended-sidebar. These inform contextual actions, loading, keyboard targets, mobile navigation and utility placement. No Plane source was copied.

The first-use welcome uses official Empty, Accordion and Card primitives. Loading uses official Skeleton. The existing server error/retry boundary and real Request detail routes remain in place. Toolbar controls explicitly override Lane's responsive defaults: 32px desktop, 44px mobile.

## Implementation and verification boundaries

The deliverable lives in `src/app/(app)` and `src/components`, served by Next.js at the existing routes. The earlier ignored HTML preview is not part of the commit. No mock session, sample Requests or preview adapter is shipped.

Run `vitest run --config vitest.ui.config.ts` for Requests/shell tests without database setup. Full authenticated browser checks require a signed-in workspace. Paper MCP was unavailable, so no Paper artboards were produced. Deployment is separate from this source change.

MIT notice: `docs/licenses/shadcn-ui.txt`. No paid components are used. Future frontend additions must use official shadcn sources; gaps must be disclosed before custom work.
