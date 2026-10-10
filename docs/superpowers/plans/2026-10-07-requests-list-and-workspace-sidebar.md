# Requests list, detail and project navigation implementation plan

> **For agentic workers:** Execute task-by-task with the available subagent review workflow. Steps use checkbox syntax for tracking. Check available execution skills before implementation; do not assume an uninstalled skill exists.

**Goal:** Deliver a coherent Arc Request workspace with inline metadata, Project navigation and contextual Request detail.

**Architecture:** Install and adapt Arc Pro's actual workspace-sidebar to Lane's guarded data. Compose Request rows from Arc primitives, share properties with detail, and preserve URL and in-memory list context across navigation.

**Tech stack:** Next.js 16, React 19, TypeScript, installed Arc/Arc Pro components, Clerk, existing Drizzle queries and Storybook.

**Date:** 2026-10-07  
**Status:** First and second checkpoints implemented locally. Current correction pass covers shell surfaces, the top-left account menu, borderless Request rows and pill geometry. Nikhil explicitly deferred Request detail work on 2026-10-07 until he asks to proceed; do not start that checkpoint in this session. Signed-in app verification is pending; local verification is recorded below.  
**Confirmed scope:** Requests, Request detail and Project navigation first. The user explicitly excluded the need to start with Linear's separate Inbox, My issues, Teams and saved Views.

## Global constraints and source authority

### Current checkpoint: compact navigation and workspace search

Audience: all eligible workspace members, with existing guest restrictions. Job: scan Requests, change views, and find a Request or Project without losing the list. Primary action: Create Request in the shared shell. Data: existing guarded Request/Project queries. Surface: product only.

Linear was inspected live: sidebar search opens the full content pane; a borderless top search row sits above category pills. Search runs on Enter. List Filter and Display icons open their respective menus. Sidebar Project links expose in-app context actions. Lane keeps only its supported actions and entity types.

| Region | Arc source and adaptation | States |
| --- | --- | --- |
| Shell header | Pro workspace-sidebar, replace inline Project search with global-search icon beside identity/compose | expanded, rail, mobile; drawer closes before search receives focus |
| Requests header | SegmentedControl, FilterMenu, Popover, Button; small title strip and one compact controls row | selected views, filter/search open, active filters, display preferences, narrow viewport |
| Project context menu | official ContextMenu with link-preserving trigger | right-click, Shift+F10, normal/modified link click, Escape, copy success/failure; No Project is a filter |
| Full-pane search | licensed search-results source adapted to Requests/Projects and server-controlled data | initial, loading, empty, failure/retry, results, category pagination, stale-response protection, close/focus return |

Global search is explicitly authorized in this checkpoint. It searches the complete authorized dataset before pagination, independently of the list's 200-row cap; no new route/table/migration. Request detail remains deferred. No unsupported Project archive/delete/rename controls or Linear-only sections are added.

People need to see what design work exists, its current status, which Project it belongs to and who is working on it, then open a Request without losing their place. The primary creation action remains **New Request**.

Use **Arc as the component, styling, theme and motion authority**. The user's current instruction authorizes **Linear as the interaction and navigation reference for these three surfaces**. This is a scoped update to older repository text excluding other references. Marketing remains untouched.

Preserve Lane's current Open → In Progress → Done behavior, intake review, saved Expected impact, comments, private attachments and Clerk access rules. PM/Designer/Developer profile labels do not confer permissions. The confirmed alignment and actual-impact pipeline remains a separate product increment.

## Evidence gathered

### Linear, inspected in the user's signed-in browser

Reference: `https://linear.app/nikhilsharma/team/DES/active`.

Opened and inspected:

- Active list and grouped rows: title-led layout with compact trailing properties, collapsible status group and group-local creation.
- Display menu: grouping options, ordering options and Display properties. Column headers are not required for these controls.
- Add filter menu and available filter categories.
- List details panel: Assignees, Labels, Priority and Projects breakdown tabs.
- Request detail: back to originating list, previous/next controls, main content, activity, attachments, properties and issue action menu.
- Individual status, priority, assignee, project, label and date menus.
- Linked Project overview and Project Issues tab. Project Issues reuses the same list composition.
- Creation from a Project list; the Project was preselected in the composer.

No issue/project data was edited or submitted. The browser was returned to the original Active list with menus and details panel closed. This is an inspection of the relevant navigation and menu structure, not a claim that every nested command or destructive action was executed. During each implementation slice, inspect any still-unobserved behavior before claiming parity.

Linear's trailing metadata is quiet: it does not put an equally strong outlined capsule around every value. Use compact Arc pills with restrained surfaces so the Request title remains the first thing people see.

### Arc source, verified through MCP

- Exact registry block: **`workspace-sidebar`**, available through the user's Pro access.
- Requested reference: <https://uiarc.dev/components/blocks/sidebar?variant=workspace-sidebar>.
- Component documentation: <https://uiarc.dev/components/blocks/workspace-sidebar>.
- Installation command, for the implementation pass:

  ```sh
  pnpm dlx shadcn@latest add @uiarc-pro/workspace-sidebar
  ```

- Actual source includes a Projects section, project search, inline creation, 272px expanded / 64px collapsed navigation, workspace/account controls and mobile navigation.
- Its public props are `className`, `onNavigate`, `defaultCollapsed` and `onCollapsedChange`. Workspace, Project and creation data are demo state inside the source, so installing it alone will not connect it to Lane.
- The supplied mobile implementation includes an off-canvas modal, scroll lock, Escape, focus handling, close-on-navigation and reduced-motion handling. Verify the installed version rather than assuming documentation prose describes every implementation detail.
- **Arc has no exact Linear-style Request row block.** The row will be a clearly documented Lane composition of actual Arc primitives. It must not be described as an official Arc block or a pixel-identical Linear component.

## Intended architecture

```text
Account menu (top left)
├── Settings                      [Profile]
├── Invite and manage members     [hidden for guests]
└── Log out
Create Request (top compose action)
Search Projects / collapse sidebar
Current workspace
├── All Requests                  [My Requests for guests]
├── Notifications                 [existing popover]
└── Projects
    ├── Website                   [real accessible Projects only]
    ├── App
    ├── Marketing
    ├── …
    ├── No Project
    └── New Project
```

Updated 2026-10-07 to match the approved account-menu grouping. Desktop navigation sits on the app background; main content has the rounded surface. Project names above illustrate the structure; never seed invented Projects into a real workspace. Keep the existing account menu/sign-out behavior. Do not bring demo billing, storage meters, favorites, multiple-workspace switching or fake unread indicators into Lane.

**Requests page:** All / Open / In Progress / Done views at the top; search, Filter, Display and New Request. Remove the redundant Status section from the sidebar. Switching status preserves the selected Project.

**Project navigation:** `/?project=<id>` reuses Requests with a Project heading. `/?project=none` shows ungrouped Requests. New Request inherits the selected Project without replacing an already-edited draft. New Project uses the existing creation action and immediately refreshes the sidebar and composer options. Initially this is Project-scoped Requests; a separate Project overview, timeline, milestones or Project activity product is not included.

**Row:** one title-leading line with right-aligned compact Status, Project, Owner and Submitted metadata. Request type and Submitted by can be enabled under Display. Remove table headers, vertical column divisions and nested table cards. On narrow widths, metadata wraps below the title; the page must not scroll horizontally.

**Display:** visible properties, Group by (Status, Project, Owner, None), Order by (Submitted, Title, Status) and direction. Start with status grouping and newest submissions within each group. Retain useful filtering and pagination, with truthful counts. Hide redundant Project metadata in a single-Project view by default while allowing it through Display.

**Detail:** keep the workspace sidebar. Use a clear back/breadcrumb header and previous/next navigation, a main content column for the problem, supporting context, Expected impact and comments, and a compact properties rail. On phones, properties become an in-flow section. Reuse the same property components and vocabulary as the list; avoid a second permanently open mini-list consuming another column.

## Component and behavior map

| Region | Verified Arc source | Lane adaptation |
| --- | --- | --- |
| Persistent shell | Pro `workspace-sidebar` | Real Clerk identity, eligible routes, accessible Projects, real creation and navigation |
| Request metadata | `badge`, `avatar`, `tooltip` | Shared presentational properties; exact date/time available on focus/hover |
| Interactive property/action trigger | `button` + `popover` / `dropdown-menu` | Use buttons only where a real supported action exists |
| Search and filters | `search-field`, `filter-toolbar` | Preserve existing data and controlled filter semantics |
| Display controls | `popover`, installed selection controls | Group/order/property preferences, replacing Columns |
| Empty/loading/error | `empty-state`, `skeleton`, `alert` | Specific workspace, filter, Project and permission cases |

The new required registry installation is `workspace-sidebar`; the supporting primitives are already installed. Record upstream source and any adapter changes in `docs/design-system/arc-sources.md` and the existing source manifest. Do not reinitialize the foundation or overwrite local components blindly.

### Metadata actions must be honest

- **Project:** navigate to its filtered Requests. The existing create/list APIs do not provide a saved-Request Project editing action.
- **Owner:** show the current person or Unassigned. Preserve explicit Pick up; it currently assigns the signed-in person and starts the Request atomically.
- **Status:** show current status and preserve existing Pick up / Mark Done actions. Do not implement arbitrary transitions, reopening or a creator/admin bypass.
- **Submitted:** read-only, with exact date/time. Do not copy Linear's editable due-date behavior onto submission date.
- **Request type:** show Lane's existing Bug / Improvement / New feature values; do not silently turn this single value into Linear's multi-label data model.

If editable Project/type, independent assignment or arbitrary status selection is desired, specify and approve the action/permission rules before that behavior is built. The current target already separates assignment from starting work, but this presentation pass must not quietly implement only part of that lifecycle contract.

## Execution sequence

### 1. Establish the real Arc workspace shell

**Files:** `src/components/shell/sidebar-view.tsx`, `src/components/shell/sidebar.tsx`, `src/app/(app)/layout.tsx`, new installed Arc block files, `src/stories/navigation.stories.tsx`, `docs/design-system/arc-sources.md` and its source manifest.

- [x] Install the verified block, inspect its exact source and compare the source manifest before adapting it. Complete licensed source retrieved through authenticated Arc MCP; upstream hashes saved before adaptation.
- [x] Introduce typed Project data and callbacks at the Lane shell boundary. `sidebar.tsx` is a client wrapper; authorization stays in the existing guarded Project server actions.
- [x] Wire current workspace identity, notifications, account menu, New Request and existing Settings destinations.
- [x] Add real Project navigation and creation; remove demo actions and duplicate Status navigation.
- [x] Preserve active Project highlighting on Request detail and correct active Settings state.
- [x] Preview expanded, collapsed, mobile, long workspace name and guest states in Storybook. Verify coarse-pointer targets meet 44px where needed without changing the visual source unnecessarily.

**Visible checkpoint:** working shell and Projects navigation in Storybook, followed by the real app. No disconnected mock navigation shipped.

### 2. Make Project and list context reliable

**Files:** `src/lib/request-workspace.ts`, `src/lib/request-overview.ts`, `src/app/(app)/page.tsx`, `src/app/(app)/requests-workspace.tsx`, `src/app/(app)/requests-overview.tsx`, `src/app/(app)/requests/[id]/page.tsx`, `src/components/requests/list-view-state.tsx`, `src/app/(app)/request-status-filter.tsx`, `src/app/(app)/request-workspace-keyboard.tsx`, existing Project actions and composer provider where required.

- [x] Add a canonical parsed Project filter (`all`, `none`, or accessible Project ID) beside the status filter; extend list/detail URL helpers without breaking old status-only URLs.
- [x] Apply authorized Project and status predicates **before** the current 200-row query cap. Keep old direct detail links independently resolvable, including when a stale Project context is attached.
- [x] Use `accessibleProjectsWhere` for sidebar names and data; guests must not learn unrelated workspace Project names or counts.
- [ ] Define list return context: Project, status, search, grouping, sorting, displayed properties, page, scroll and focused Request. Preserve private search text in the existing workspace/user-scoped memory state rather than persisting it across sign-out.
- [ ] Propagate this context through list → detail → back/Escape and previous/next. Directly opened detail URLs get a documented default, never an inferred unrelated list.
- [x] Refresh shell Project data after creation and preserve the selected Project through status changes and New Request. Restored/edited drafts remain unchanged; creating a Project updates both pickers and sidebar.
- [x] Distinguish missing/inaccessible Project, empty Project and No Project; never silently fall back to all workspace data.

**Data limitation:** local search/order/pagination currently operate on at most 200 loaded Requests. Keep truthful “latest 200” messaging when capped; do not label truncated group counts as workspace totals. Full-dataset search/counts/pagination is a separate query expansion if needed.

**First checkpoint evidence (2026-10-07):** 96 database-free UI/data tests and 24 Requests browser stories pass. Navigation stories pass at 390px dark and 1440px light; composer draft preservation and Project inheritance checks pass. TypeScript, lint, source manifest and Storybook build pass. The production build passes on Node 24 with Webpack; default Node 26/Turbopack stalled or exhausted memory. Signed-in live-app verification is pending because the local `/login` path hit a proxy `ECONNRESET`. Storybook's populated shell uses illustrative in-memory Projects and supports selection/creation without writing server data. No commit, push or hosted release is part of this checkpoint.

### 3. Replace table presentation with Request rows

**Files:** `src/components/requests/tasks/data-table.tsx`, `src/components/requests/tasks/columns.tsx`, `src/components/requests/tasks/data-table-toolbar.tsx`, `src/components/requests/list-view-state.tsx`, `src/components/requests/requests.module.css`, proposed `src/components/requests/request-row.tsx`, proposed `src/components/requests/request-properties.tsx`, `src/stories/requests.stories.tsx`.

- [x] Extract the existing column values into shared property renderers and stable property identifiers; preserve their data semantics.
- [x] Replace the visual table with semantic list rows and a real Request link. Interactive metadata/action buttons are siblings of the link, never nested controls inside a link.
- [x] Keep title search, filters and pagination; replace Columns with Display, adding explicit group and order controls.
- [x] Group Owners by stable `assignedTo` identity, added to `OverviewRequest`; never group by display name. Group Projects by ID. Provide explicit Unassigned and No Project groups.
- [x] Sort status by Open → In Progress → Done; use deterministic ID tie-breaks for date/title sorts.
- [x] Define filter → sort/group → paginate consistently, including group headers split across pages and counts representing the loaded matching set.
- [x] Make group collapse keyboard-operable. Creation remains the existing New Request flow; no group action bypasses Intake or changes the initial status.
- [x] Match focus, hover, selected/active and long-title states. Muted metadata remains readable in both themes; property focus uses a distinct fill from the containing row.

**Visible checkpoint:** populated, empty and filtered Requests inside the new shell, at desktop and phone widths. Review before moving on to detail.

**Second checkpoint evidence (2026-10-07):** 107 database-free UI/data tests pass. Requests plus utility-colour browser stories pass 29/29 at 1440px light and 390px dark. Navigation plus utility-colour stories pass 25/25 in both modes. Populated-shell/long-title smoke checks pass at 768px dark and 1024px light. The review caught and fixed undefined focus styling, indistinguishable property focus, Project filter label collisions, retained pagination after Project navigation and focus restoration into a hidden group. Rose uses stock Arc values; the full native Project category palette is documented in Storybook. The sidebar keeps Arc's rounded source panel, native vertical scrolling and spring transitions. No custom vertical elastic overscroll was present in the upstream source. Build, source, lint and type checks are recorded in `DESIGN-NOTES.md`; signed-in provider validation and the detail checkpoint remain separate.

**Shell correction evidence (2026-10-07):** The sidebar sits directly on the background and the main content owns the rounded surface. Account actions are grouped at the top; duplicate sidebar search/compose controls were removed. Request row dividers were removed. Arc Badge content now uses flex layout and the existing body line-height token, fixing vertical alignment and clipped descenders without icon offsets. Navigation, Requests and utility-colour stories pass 55/55 at both 1440px light and 390px dark; the mobile composer focus and draft-close checks pass 2/2. Local production/static Storybook builds, 107 UI/data tests, typecheck, lint and the source ledger pass. No Request detail implementation was started in this correction pass.

### 4. Bring Request detail into the same architecture

**Compact navigation/search checkpoint evidence (2026-10-07):** Implemented the compact title/control strips, top-row workspace search filling the main pane, and real Arc Project context menus. Inspected Linear's search, filter, Display and Project context actions before adapting them to supported Lane behavior. Workspace search is server-scoped, guest-aware and paginated before the Requests list cap. Local UI/data checks pass 127/127; phone Requests/navigation/context-menu checks pass 67/67, with search and desktop verification detailed in `DESIGN-NOTES.md`. Production and Storybook builds pass. The next detail checkpoint remains deferred.

**Deferred by Nikhil on 2026-10-07. Do not start until he explicitly asks.**

**Files:** `src/components/requests/detail-view.tsx`, `src/app/(app)/requests/[id]/page.tsx`, existing lifecycle buttons, `src/components/requests/expected-impact-summary.tsx`, shared row/property components, `src/stories/request-detail.stories.tsx`.

- [ ] Replace the permanently duplicated `RequestListPane` with contextual Back and previous/next navigation; retain the persistent application sidebar.
- [ ] Previous/next follows the originating filtered and ordered list, not the current detail query's independent latest-200 array.
- [ ] Place current properties in a quiet right rail; preserve all problem/original/context/Expected impact/attachment/comment content.
- [ ] Keep existing action permissions and server guards unchanged. Pending/error/retry states remain visible without losing comments or navigation context.
- [ ] When an action removes the current Request from the active filter, return to the remaining list with a sensible focus target. Handle first/last/only item and unavailable Requests.

**Visible checkpoint:** list → detail → another Request → back, including a Project-scoped journey and a phone-width journey.

### 5. Verify and document the finished increment

- [ ] Update affected Storybook play tests and behavior tests for Project/status URL composition, grouping, keyboard/focus and navigation recovery.
- [ ] Preserve guest tests, detail access checks and lifecycle concurrency tests; do not trade access correctness for visual parity.
- [ ] Update stale `e2e/requests-workspace.spec.ts` assumptions about the previous pane/table/combobox structure before calling it release evidence.
- [ ] Inspect 390, 768, 1024 and 1440px in light/dark modes, expanded/collapsed navigation, browser zoom and reduced motion.
- [ ] Run applicable local checks once after the final changes; repeat only checks affected by subsequent fixes.
- [ ] Update `DESIGN.md`/`DESIGN-NOTES.md` and the source record to state the scoped Linear interaction reference, actual Arc block, and intentional Lane differences.

Suggested focused checks during implementation:

```sh
pnpm typecheck
pnpm lint
pnpm design:check
pnpm test:storybook src/stories/requests.stories.tsx src/stories/request-detail.stories.tsx src/stories/navigation.stories.tsx
STORYBOOK_WIDTH=390 STORYBOOK_THEME=dark pnpm test:storybook src/stories/requests.stories.tsx src/stories/request-detail.stories.tsx src/stories/navigation.stories.tsx
```

Final local validation: `pnpm test:ui`, `pnpm test`, `pnpm build`, `pnpm build:storybook`, plus the relevant screenshot harness in `playwright.storybook.config.ts`. Check safety guards first: database tests must use loopback `lane_test`; hosted E2E uses a separate explicitly gated staging/Clerk harness and is not implied by these local checks. Screenshot generation alone is not visual approval.

## Required states

| Surface | States to implement/verify |
| --- | --- |
| Shell | Expanded, collapsed, mobile open/closed, Escape/focus return, long names, reduced motion, user/workspace change |
| Projects | Loading, none created, populated, search no-match, creation pending/failure/duplicate, refresh after create, inaccessible/deleted Project, guest scoping |
| Requests | First-use empty, populated, no filter matches, status+Project, long title, unassigned, missing optional values, many rows, cap messaging, group collapse, page boundaries |
| Properties | Read-only versus supported action, hover/focus tooltip, accessible name, truncation, dropdown open/close, no nested-link conflicts |
| Detail | Direct link, contextual entry, first/last/only Request, missing/inaccessible, guest, complete/minimal Expected impact, long context, attachments, comment/action pending/error/retry |
| Navigation | Back/forward, Escape, Project retained on status switch, list focus/scroll restored, selected Request leaves filter, compose/cancel retains existing draft |

## Completion criteria

The result is one coherent Request workspace: authentic Arc workspace-sidebar, real Project navigation, title-led rows, consistent metadata, and detail navigation that preserves context. No application build is claimed complete by this document. Each visible checkpoint is reviewed before moving to the next surface. Marketing, new lifecycle states, unrelated Linear modules and new database tables remain outside this plan.

## 2026-10-07 account menu correction

- [x] Remove the Requests toolbar bottom border; retain the title strip.
- [x] Use the shared 12px control radius for Request row hover/focus backgrounds.
- [x] Use official Arc UserMenu for account identity and actions, with the requested existing-workspace submenu.
- [x] Wire Clerk membership loading, retry, pagination and safe document navigation; protect unsaved drafts/files and pending mutations.
- [x] Verify desktop/phone menu navigation, sign-out recovery, modified links and list interactions in Storybook. Record local evidence in DESIGN-NOTES.md.
- [ ] Verify switching between real Clerk workspaces in the signed-in hosted environment.

Request detail work remains explicitly paused until Nikhil asks; this correction does not begin phase 4.

## 2026-10-08 sidebar edge, row density and filter motion

- [x] Remove the expanded desktop collapse icon; drag the main pane’s left edge to resize or fully collapse navigation, then expand from the page title.
- [x] Keep width restoration, captured pointer drag, cancellation, keyboard separator controls and the existing phone drawer.
- [x] Reduce desktop Request rows from 64px to 44px; use 4px vertical padding when rows wrap, preserving touch targets and 12px hover corners.
- [x] Reproduce the filter corner flash in browser frames and replace the unbounded pill-radius spring with real trigger geometry and Arc standard easing.
- [x] Inspect live Requests, drag/collapse/expand and tablet/phone wrapping; run focused desktop/phone interaction checks.

The Arc MCP workspace-sidebar source has no edge-resizing API. `layoutManaged` and the shell’s resize controller are documented Lane adaptations. The stock Arc UserMenu, navigation content, native scroll, mobile drawer and theme remain in use. Request detail work remains deferred.

## 2026-10-08 sidebar preview and consistent flyouts

- [x] Hover the collapsed expand control to preview navigation without moving the content; leaving closes it and clicking restores the remembered width.
- [x] Preserve focus, portalled account/notification menus, Escape and the phone drawer.
- [x] Place the preview flush left with zero left radii; fade the resize accent continuously from its bright centre to transparent before the edges.
- [x] Use the same Arc Popover presentation for Requests Filter and Display while retaining filter selection and keyboard navigation.
- [x] Verify final desktop Requests (34), resize (9) and preview (8) stories; the combined phone run passes 51/51. Lint, TypeScript, source verification and both builds pass.

Live Lane previews were inspected. The attempted live Linear comparison was interrupted by Chrome activity; exact Linear hover parity remains unverified. Full evidence is recorded in DESIGN-NOTES.md. This refinement does not begin Request detail work.


## 2026-10-08 selection, picker identity and shadow removal

- [x] Remove elevation through Arc's existing shadow tokens in both themes.
- [x] Show the current picker's circular avatar, with saved photo/initials or a neutral unassigned glyph; keep the full name accessible.
- [x] Add official Arc checkboxes on the left and an Arc floating action group at the main pane's bottom, with count, select-page, copy-links and clear.
- [x] Connect eligible non-guest selections to existing guarded Pick up / Done actions; handle pending, partial failure, retry, filtered-out failures and data refresh without adding backend transitions.
- [x] Verify selection boundaries, keyboard/focus, accessible names, scrolling and responsive layout in desktop light and phone dark: 54 stories pass in each.
- [x] Inspect live light/dark, 390/768/1024/1440 layouts. Verify TypeScript, lint, Arc source identity and 141 database-free UI/data tests.

Current user decision: the row avatar represents the current picker, with a neutral icon when unassigned. Linear's live selection count and contextual controls were inspected through its accessibility tree after keyboard selection. Blank Chrome screenshots and interrupted command-menu input prevent a claim of exact visual/menu parity. Request detail and marketing remain outside this increment.
