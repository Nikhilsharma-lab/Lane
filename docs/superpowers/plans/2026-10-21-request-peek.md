# Request peek (launch plan item 2.12, leftover build item L5)

**Date:** 2026-10-21. **Base:** `origin/main` at `a9cac1b`. Read-only spec; every citation is a file and line on that commit.

**Authority.** `DEFERRED.md:214-226` ("REQUEST PEEK/PREVIEW") requires Nikhil's explicit written decision before the peek is built. He gave it in chat on 2026-10-21 ("build all" leftover items), recorded in the leftover build plan (`docs/superpowers/plans/2026-10-21-leftover-build-plan.md`, PR #63, item L5). The entry moves to built with this PR.

**Route decision (Nikhil, 2026-10-21, in the leftover-build session):** asked whether the peek may add one read-only route, `GET /api/requests/[id]?org=`, reusing the existing detail loader and the guards of `/api/requests/done` with no page URL, he answered "Yes, add it (Recommended)". The option he chose read: "One read-only GET route handler wrapping loadRequestDetail, using the same pattern as the search, notifications and done-list routes you approved under decision 8.15." This extends decision 8.15 (`2026-10-10-mvp-launch-linear.md:617`; route handlers count as new routes, `AGENTS.md:46`) to this one route. Scope is exactly that: read-only, the same guards through `authorizeReadRoute`, no page URL. Why no existing path works is in §2.

## 1. What ships

- **Space** on a focused Request row opens a peek of that Request at the list's trailing edge. The list stays mounted: its scroll, filters, page, grouping, selection and roving tab stop do not change, and focus stays on the row.
- While the peek is open, **J/K** (and ↑/↓, Home/End) move the list focus as today, and the peek follows the focused Request row. A group header keeps the last Request shown.
- **Esc** closes the peek and puts focus on the peeked Request's row. It runs before the list's "clear the selection" Esc, so the first Esc closes the peek and the second clears the selection.
- **Enter** on the row still opens the full page. The peek has **Open full page** (a link to `/requests/[id]`, which stays the only canonical URL) and **Close preview**.
- The row menu gets **Peek** with the hint `Space`, only where the peek is available. The `?` overlay lists Space in "Requests list" and Esc in a new "Request preview" group.
- **Phones keep full-page navigation:** the peek is available only at `(min-width: 768px) and (pointer: fine)`. Elsewhere Space does nothing and the menu item is not shown.
- The peek's content is the detail composition itself: problem, Expected impact, files, design link, conversation with the comment box, properties (Status, Priority and the rest, through the state line and Properties drawer at the peek's width), the lifecycle action and Edit Request. A guest sees exactly what their detail page shows, because both go through the same pane and the same guarded loader.
- An action in the peek (Pick up, Mark Done with Undo, priority, comment) shows on the row and in the peek in the same frame, through the layout-level overlay.

Not in scope: a peek from search, notifications or Projects; previous/next inside the peek (J/K on the list does it); a URL for the peek.

## 2. Why a route handler, and why not the alternatives

- **Server-action reads are banned** for reads on open (`2026-10-10-mvp-launch-linear.md:174`, §2.4 item 2; Next serialises server functions, item 1.16 at `:270`).
- **Intercepting routes do not work here.** A root-level `(.)requests/[id]` interception becomes a rewrite whose `Next-Url` condition is replaced with "/.*" (`node_modules/next/dist/lib/generate-interception-routes-rewrites.js:30-34`). Every soft navigation to `/requests/[id]` from anywhere in the app would be intercepted: Enter on a row, workspace search, notifications, detail's own J/K (`detail-sequence.tsx:37`), and phones. The full page would stop being one action away.
- **A `?peek=` search param on "/"** would re-render the "/" page on the server on every open and every J/K, re-running `loadRequestList` (`requests-workspace.tsx:44`). That breaks item 1.7 (the page never reads the query, `page.tsx:3-5`).
- **The existing read routes** (`src/app/api/search`, `requests/done`, `reviewers`, `notifications`) return no comments, files or Expected impact.
- **So:** `GET /api/requests/[id]?org=` wraps the existing `loadRequestDetail` (`src/lib/data/requests.ts:129-...`), which already carries the workspace and guest guards (`:133-137`). It uses `authorizeReadRoute` and `json` (`src/app/api/_lib/read-route.ts:18-38`), like `/api/requests/done` (`src/app/api/requests/done/route.ts:12-21`). It is abortable, so a held J never queues reads in front of a mutation (the reason for decision 8.15). It adds no new query. The statement count matches the detail page's loader.

## 3. Files

### 3.1 Read path
- **New** `src/app/api/requests/[id]/route.ts`: `GET`. 401/400/403 from `authorizeReadRoute`. 404 `{ error }` when the loader returns null (missing, another workspace's, or a guest's non-own Request: same answer, no existence leak, as `detail-view.tsx:76-80`). 500 with a kind-only log, as `done/route.ts:17-19`. Dates serialise as ISO strings.
- `src/app/api/read-routes.test.ts`: add cases for member, guest-own, guest-other (404), other-org (404), wrong `org` (403) and signed out (401). Same seeding pattern (`:38-60`).

### 3.2 One detail pane for page and peek
- `src/app/(app)/requests-workspace.tsx:15-29` `RequestDetailPane` moves to **new** `src/components/requests/request-detail-pane.tsx` (no directive). The server page and the client peek render the same islands with the same rules: pickup readiness, the requester name, Edit Request only for an Open Request's creator or an admin, and no lifecycle action for guests (`detail-view.tsx:104`). It is imported from the page (server) and from the peek (client, on demand).
- `src/components/requests/detail-view.tsx:92-104`: an optional `peek` prop `{ strip: ReactNode }`. When it is set, it replaces `DetailStrip`, the title is an `h2` (the list page keeps its own `h1`), and the root carries `data-detail-peek`. The full page renders exactly as before.
- `src/components/requests/detail-context.tsx:76-95`: `DetailRequestProvider` takes `arrival={false}` for the peek, which skips `useArrival` (`:43-54`). The peek never moves focus on mount and never settles the full page's J/K sequence. Detail's J/K (`detail-sequence.tsx:68-84`) is not mounted in the peek, because the peek strip has no `DetailSequence`.

### 3.3 The peek
- **New** `src/components/requests/request-peek.tsx` (client, the panel, in the list bundle): the overlay viewport and panel, the motion, Esc, the availability query, the row menu's opener context, and the on-demand import of the content.
- **New** `src/components/requests/request-peek-content.tsx` (client, a `React.lazy` chunk, preloaded when a grid row takes focus): fetches the detail with an `AbortController`, keeps an in-memory cache by id for the open list, renders the skeleton (`detail-skeleton.tsx`) while loading and "Request unavailable" on a 404. Then it renders the shared pane with the peek strip: the code, Copy link, Open full page and Close preview.
- **Staying in step with the row.** The list's server row for the peeked id comes in as a prop. (a) Its status, priority, assignedTo, assigneeName and assigneeAvatarUrl are laid over the fetched detail before `applyOne`. When an action's revalidated list lands, the overlay clears its patch (`pending-mutations-provider.tsx:137-155`) and the peek reads the same fresh values as the row, so nothing reverts. (b) A new server row object for that id (a revalidation) refetches the detail in the background. (c) `addComment` revalidates only `/requests/[id]` (`actions.ts:410`), so a confirmed pending comment the fetched comments do not list also triggers one refetch. Until then `commentsFor` shows it as sent (`pending-mutations-provider.tsx:172-186`).
- **Placement and motion:** the list summary's overlay pattern (`request-list-summary.tsx:19-22, 50-55`; `data-table-toolbar.module.css:47-50`). A clipping viewport sits at the trailing edge of `.listAndSummary`, so opening it never reflows the rows. The panel enters on `x` in `motionTokens.duration.standard` (240 ms) with the enter curve and leaves in `duration.exit` on the exit curve. Transform and opacity only, no backdrop or blur, opacity only under reduced motion. The panel is `role="region"` named "Request preview", not a dialog: `overlayOpen()` (`keyboard-guards.ts:14-24`) must stay false so the list keys keep working. Opening the peek closes the list summary, and opening the summary closes the peek.
- **Why not the Arc Drawer:** it is a modal Radix Dialog (`src/components/arc/drawer/drawer.tsx:3, 15`). A dialog blocks every list key through `overlayOpen()`, and Arc ships no non-modal side panel. No Arc file changes, so `docs/design-system/arc-source-hashes.json` and `arc-sources.md` stay as they are.
- **Width:** `min(calc(var(--sb-spacing) * 140), calc(100% - var(--space-6)))`. At this width the detail container query (`detail.module.css:113-118`) shows the state line and Properties drawer instead of the side panel, as at narrow detail widths.

### 3.4 List wiring
- `src/components/requests/request-grid-keys.ts:12, 40-58`: a `"peek"` grid command for Space (plain, no repeat).
- `src/components/requests/use-request-grid.ts`: an optional `onPeek(key)` option, called for `"peek"` on a Request row. The hook returns `activeKey`, so the peek follows the active row and not the fallback tab stop: a Request that leaves the view after an action stays in the peek. In `pageKey` (`:162-174`), J/K pressed inside the open peek move from the active row, instead of only focusing the tab stop.
- `src/components/requests/tasks/data-table.tsx`: peek state (open, id), the availability media query, and `RequestPeek` inside `.listAndSummary` next to the summary (`:201-234`). It is closed by Esc and on a page or view change that leaves no active Request row. "Open full page" records the sequence the way `captureOpen` does (`:119-126`).
- `src/components/requests/request-row.tsx:121-124`: the "Peek" menu item, from a row-presentation flag.
- `src/app/(app)/requests-overview.tsx` and `requests-workspace.tsx:52-64`: pass `viewer` (`{ id, name, isAdmin }`, already read for the page) down to the list for the pane. No new query.

### 3.5 Keyboard map (kept small for L4)
- `src/lib/keyboard-shortcuts.ts:25-37`: one "Requests list" entry `{ keys: ["Space"], label: "Preview the Request" }`, a new `"preview"` scope group "Request preview" with Esc ("Close the preview"), and `ROW_MENU_HINTS.peek = "Space"`. The clash test (`src/lib/keyboard-shortcuts.test.ts`) covers it.

### 3.6 Docs
- `DEFERRED.md:214-226`: the entry becomes built (2026-10-21, Nikhil's "build all", plan L5).
- `2026-10-10-mvp-launch-linear.md:478-482`: 2.12's heading gets "*(Request peek built 2026-10-21; waiting on Nikhil's sign-off)*".
- `docs/design-system/page-quality.md`: a 2.12 Request peek row.

## 4. Verification
- Stories (new `src/stories/request-peek.stories.tsx`, on `LinearRequestsFixture` with a stubbed fetch, as `notifications.stories.tsx:45-57`):
  - Space opens, focus stays on the row.
  - J/K move the peek.
  - Act from the peek: an acknowledgement-contract story (the mock pending, the row and peek show In Progress before it resolves, double press blocked, a refusal reverts both with a message).
  - Esc closes and returns focus.
  - Guest: no lifecycle action, same sections as detail.
  - Phone (390 or coarse pointer): Space does nothing, Enter navigates.
  - Reduced motion.
- Unit tests: the route (§3.1), the grid command, and the shortcut map.
- Checks: typecheck, lint, design:check, `pnpm test`, test:ui and `pnpm build`. Storybook for the requests, detail and peek files plus the full suite at 1440/light and 390/dark, and reduced motion for the touched files. Any failure is checked against `origin/main`.
- Bundle per route against a same-version build of `origin/main`, within +2 KB on "/". The content chunk loads on demand.
  *Built:* "/" and `/requests/[id]` (one client graph, `requests-workspace.tsx`) grow 2,730 B gzip, 682 B over. A lazily loaded panel measured worse (+3.9 KB on "/" and +1.5 KB on every route that shares the motion chunk, because Turbopack then re-exports motion internals from the shared chunk), and a static content import measured +11.4 KB. No baseline change; the overage is reported in the PR.
- The Impeccable detector on the changed UI files, an independent review, and the page-quality row.
