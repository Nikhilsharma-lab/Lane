# Arc UI source ledger for Lane product

Arc UI supplies Lane's product components and the current production visual theme. The approved Linear primitives preview is documented below. [The official docs](https://uiarc.dev/docs/introduction), [theming guide](https://uiarc.dev/docs/theming), and [AI/MCP guide](https://uiarc.dev/docs/ai) govern future changes. The marketing repository is outside this migration.

`src/components/arc/` contains official `@uiarc` registry source and licensed `@uiarc-pro` source retrieved through MCP. `arc-source-hashes.json` records the source URL, installed file, and upstream SHA-256. Changed local files are explicit adaptations. Free install IDs are `arc-foundation`, `alert`, `avatar`, `badge`, `button`, `calendar`, `checkbox`, `chip-group`, `floating-button-group`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `empty-state`, `filter-toolbar`, `input`, `notification-center`, `pagination`, `password-field`, `popover`, `progress`, `radio-group`, `search-field`, `segmented-control`, `select`, `skeleton`, `sortable-data-table`, `textarea`, `toast-stack`, `tooltip`, and `user-menu`. The Pro block is `workspace-sidebar`. Free source docs are at `https://uiarc.dev/components/<id>`; the sidebar reference is `https://uiarc.dev/components/blocks/sidebar?variant=workspace-sidebar`.

| Lane surface | Arc source actually used | Lane adaptation |
| --- | --- | --- |
| Persistent product shell | Licensed Arc Pro `workspace-sidebar` source retrieved through authenticated Arc MCP; free `user-menu`, `tooltip`, `popover`, `notification-center`, `button` | The installed block retains Arc’s inline composer, native scrolling, spring transitions and mobile sheet. The Lane shell now supplies edge resizing and full desktop collapse; the unmodified rail mode remains available to standalone block consumers. Typed data and callbacks connect real Clerk identity, guarded accessible Projects, async creation, existing destinations and notifications. Nikhil’s 2026-10-07 customization puts desktop navigation directly on the app background and the main content inside a rounded surface. Official Arc UserMenu supplies the top-left identity panel with Settings, Members, Switch workspace and Log out; guests do not get Members. |
| Workspace search | Licensed Pro `search-results` query/result source plus installed `segmented-control`, `badge`, `button`, `empty-state`, `alert`, `skeleton` | Explicit Lane adaptation in `src/components/shell/workspace-search-pane.tsx` and `.module.css`: full content pane, Requests/Projects categories, authenticated server search, pagination, pending/error/retry, stale-response protection. The stock demo datasets and synthetic latency are removed. The facet rail (Search in as Arc's `radio-group`, status, type and created-date filters) and the result preview (a `bottom-sheet` on narrow screens) are kept with Lane data; plan item 2.8 (2026-10-20) adds instant local matches, kept results while typing, Enter on an exact saved code and local dates. |
| Project context actions | Official `context-menu` installed by CLI | Open, Open in new tab and Copy link use existing destinations. Ordinary/modified anchor clicks remain native. No Project is a filter and receives no mutation actions. |
| Requests first-use and unavailable states | `empty-state`, `button`, `skeleton` | Plan item 2.1: an empty workspace renders the list itself (its page strip, an empty toolbar row and the list pane) with the Arc EmptyState in the records region, so the first Request lands in place. Lane's admin/member/guest copy, New Request and admin-only Invite teammates actions, and a "Press C to create a Request." hint shown on fine pointers only. Request detail back path and status-specific loading. |
| Requests list | `badge`, `popover`, `chip-group`, `filter-toolbar`/`FilterMenu`, `search-field`, `select`, `pagination`, `button`, `empty-state` | Lane's semantic title-led rows replace the table. Compact saved-property pills expose complete values; Display controls grouping, order and visible properties. Open/In Progress/Done filters, pagination, Project deep links and list-return focus remain application behavior. Arc has no exact Request row block: this is a Lane composition of installed Arc components. |
| Request detail | `avatar`, `badge`, `empty-state`, `button`, `skeleton`, `input`, `textarea`, `alert` | Lane's saved Request fields, expected impact, comments, private attachments, pickup/Done actions and permission checks remain application behavior. |
| New Request and AI review | `dialog`, `input`, `textarea`, `search-field`, `popover`, `radio-group`, `progress`, `alert`, `button`, `empty-state` | The controller retains its signed AI review, draft and file recovery, optional Project and Request type, creation and failure states. The centred Dialog (`layout="composer"`, chosen 2026-10-13) is only presentation; the form host remains mounted across close/reopen to preserve File objects. `/intake` is an Arc EmptyState launcher that opens the same dialog. Search and selection share one Arc Popover in the Project picker. Lane keeps the Dialog open during interactions in its portalled property menus. |
| Auth, onboarding and Settings | `password-field`, `input`, `radio-group`, `button`, `skeleton` | Clerk continues to own authentication, organizations and invitations. Lane maps supported Clerk appearance variables to Arc tokens. Role and browser theme preferences retain their existing actions. |
| App-wide async feedback | `toast-stack` | The Request-created message offers an Open Request action. Foreground validation and recoverable failures remain inline. |

Product-specific layout, data adapters, state controllers and Clerk appearance mappings are Lane code; they are not represented as unmodified Arc components. Pro `workspace-sidebar` was installed from the complete licensed MCP source. Its original hashes were recorded before adaptation; the ledger records both upstream and local hashes. No registry token is stored in source. Because the repository is public, every file containing Pro source (`workspace-sidebar.tsx`/`.module.css`, `workspace-search-pane.tsx`/`.module.css`) carries the Arc Pro notice required by the Arc Pro license: Pro source may ship in a public repository only as part of the Lane end product and is not covered by any license of this repository.

2026-10-08 hover refinement: Lane's shell wraps the same installed sidebar in a temporary desktop preview while its saved width remains zero. Hover opens it below the expand control; leaving closes it, click pins the remembered width, and focus/portalled menus retain it until dismissed. The preview touches the viewport's left edge with square left corners. The resize affordance uses an alpha mask with a centre peak and transparent outer 15% at each end, explicitly requested by Nikhil. This mask is not a new colour ramp. Phone drawer behavior remains Arc's.

The Requests toolbar now opts into `FilterMenu`'s documented Lane `presentation="popover"` extension. It reuses the existing Arc field/value menu rows inside the same Arc Popover used by Display and title search; trigger geometry, opening/closing motion, collision handling and focus return are consistent. The original morph presentation remains available for existing block consumers and its regression story. This adaptation changes `src/components/arc/filter-toolbar/filter-toolbar.tsx` and `src/components/arc/filter-toolbar/filter-toolbar.module.css` only; Arc Popover source is unchanged.

## Deliberate source adaptations

- `src/components/arc/avatar/avatar.tsx`: optional `unoptimized` passes a saved profile image URL directly to the browser, using Next Image's documented option; the default preserves other consumers' existing optimization behavior. Request picker avatars opt in because Clerk already supplies profile image URLs. The existing image-failure initials fallback remains Arc's. `RequestProperty` uses the current `assignedTo` identity, photo/initials, and a neutral person circle when unassigned; it never adds presence indicators. The existing list query reads `profiles.avatarUrl` through its assignee join, without a new table or provider call.
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx`: typed workspace/Projects/navigation slots replace demo workspaces, favorites, storage and billing. Next links retain native modified-click behavior. Project creation uses the existing guarded action with pending/error recovery. Project retries restore focus to persistent controls. The parent receives mobile sheet state to make main content inert. Arc's highlight, tooltip and drawer composition is retained. The documented `layoutManaged` extension allows Lane’s shell to own desktop width and full collapse, disables the stock desktop rail shortcut and removes its toggle button; standalone block behavior stays available. The inline Project search is replaced by a global-search icon beside account and compose controls; search occupies the right content pane. Project and No Project links receive in-app context menus while preserving ordinary navigation. Project colours use a stable ID-to-tone mapping; No Project remains hollow. 2026-10-09: the rail's compose control is labelled New Request, matching the list, the Open group and the composer, its tip shows the C shortcut and the link exposes `aria-keyshortcuts="C"` like its siblings.
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`: adds loading/error/async-create slots, link decoration, focus fills and 44px touch targets. The shared `src/components/projects/project-dot.module.css` retains the six exact upstream light/dark Project tone values for both sidebar and Request rows. At Nikhil’s explicit request, the inline sidebar has no panel border or separate surface; the adjacent main content carries the rounded surface instead. The mobile drawer retains its own surface. Account identity and supported actions now sit at the top, with compose and global search controls in one row. The expanded desktop shell has no collapse button; its main-pane edge is the resize/collapse control. 2026-10-09: the Projects folder icon sits in the same 16px lead box as row icons and the folder chevron takes the notification count's 21px slot, so sidebar glyphs share one left axis and one trailing centre line.
- `src/components/arc/user-menu/user-menu.tsx`: removes unsupported `aria-modal` from the mobile `role="menu"` surface. The requested CLI install confirmed the already-installed source; local adaptations were preserved. Native `href` account destinations retain modified clicks. The explicitly requested workspace submenu is a typed extension because upstream UserMenu has no nested workspace API: it uses a desktop side panel and a second view in the existing phone sheet, with keyboard entry/back, current selection, loading, retry, pagination and pending states. Failed sign-out remains open for retry. Arc identity, surfaces and motion remain the source.
- `src/components/arc/empty-state/empty-state.tsx`: renders its title as `h2` inside pages that already have an `h1`; visuals and behavior otherwise remain Arc.
- `src/components/arc/empty-state/empty-state.module.css`: matches the adapted `h2` title selector.
- `src/components/arc/badge/badge.module.css`: warning text uses Arc's `--foreground` while its icon, tint and border keep `--warning`; the upstream warning text measured below 4.5:1 on Lane's default theme. The content wrapper uses flex rather than inline-flex to remove the anonymous baseline space that shifted icons upward. Labels inherit Arc's `--leading-body` instead of a unit line-height, so truncated Request labels retain their descenders. Native pill sizes, symmetric horizontal padding and motion wrappers are preserved; browser geometry checks cover icon centring and text clearance.
- `src/components/arc/foundation.css`: the light-theme `--text-muted` aliases Arc's existing `--neutral-8` because visible table and filter text using the upstream `--neutral-7` measured 4.11:1 on white. Dark-theme colour values remain upstream. Nikhil set the shared `--radius-control` to `12px` on 2026-10-07, replacing the upstream 18px value in both themes. On 2026-10-08, Nikhil requested shadow removal: the shared resting, raised and floating shadow tokens are `none` in both themes. Requests controls, sidebar previews and portalled menus therefore keep their existing borders/surfaces without elevation shadows. On 2026-10-09 the earlier global `outline: none` rule was replaced by upstream Arc's current `:focus-visible` outline block, so that block is present verbatim: pointer focus still draws no ring, keyboard focus draws the `--focus-outline` ring, and the Linear theme sets that token to Linear's focus colour. Lane's own `:focus-visible` fills on Request rows were removed in favour of it.
- `src/components/arc/radio-group/radio-group.tsx` and `src/components/arc/radio-group/radio-group.module.css` (plan item 2.2, onboarding role keys approved 2026-10-10): each option takes an optional `shortcut`. The input exposes it as `aria-keyshortcuts`, and an `aria-hidden` `kbd` at the end of the row shows it on fine pointers only, above the highlight like the row's copy, in `--text-muted` at `--text-xs`. The page binds the keys; RadioGroup adds no key handling. Options without `shortcut` (Intake) show no key. 2026-10-11 (WCAG 2.4.7): upstream hides each radio at `opacity: 0`, which also hides the shared `:focus-visible` ring drawn on it, so keyboard focus on an option, checked or not, was invisible (an unchecked onboarding role reached by Tab showed nothing). The radio now covers its row's border box with `appearance: none` and no fill instead, so foundation.css's ring frames the row on keyboard focus; no ring is drawn by RadioGroup itself, and pointer focus still shows none. `Auth/Onboarding` `KeyboardFocusRing` checks it.
- `src/components/arc/input/input.tsx`, `src/components/arc/input/input.module.css`, `src/components/arc/textarea/textarea.tsx` and `src/components/arc/textarea/textarea.module.css` (plan item 2.3): optional `hideLabel` keeps the label as the accessible name through the existing `.srOnly` class, and optional `appearance="plain"` draws no border, background, inline padding, minimum height or resize handle, for the composer's large title and description. Plain also removes Arc's own focus cues for these fields: Input's `:focus-visible` border and Textarea's `:focus-visible` border and 3px `--focus-ring` halo (text fields are already outside Arc's shared keyboard outline). The caret is then the only focus cue, and no ring is added; the keyboard and VoiceOver pass must confirm that is enough. Defaults render exactly as upstream.
- `src/components/arc/alert/alert.tsx` (plan item 2.3): an explicit `role` prop now wins over the tone's `status` or `alert` role; without one the role is upstream's. Upstream spreads props before its own role, so no prop could override it, and a wrapper cannot remove a child's live role. The composer's restored-draft notice passes `role="note"`: it is inserted with its text while focus moves, which NVDA and JAWS often skip, so the composer's always-mounted live region announces the restore once instead. Visuals and motion are unchanged.
- Plan item 2.4, decisions 8.21 (Arc edit ledger) and 8.22 (Arc motion), recorded 2026-10-11. The Button, Tooltip and ToastStack `morph` props and FilterToolbar's `announce` are opt-in: without them each renders exactly as upstream. The other three change behaviour for every consumer, as their bullets say: ContextMenu drops `aria-expanded` on any `role="row"` target, ContextMenu hides `.shortcut` on every coarse pointer, and Dialog's new timing applies to every Arc Dialog, the Intake guard's included. Check all three against upstream on an Arc upgrade.
  - `src/components/arc/button/button.tsx`: optional `morph?: "blur" | "plain"` (default `"blur"`). `"plain"` swaps the label, the icon and the loader with opacity, the 3 to 4px rise and the scale only, with no `filter: blur`; the reduced-motion fade is unchanged. The Request row's copy-code button passes it, so copying no longer plays a blur morph in a dense row (plan §2.3, "no `filter: blur` label or icon morphs inside dense rows").
  - `src/components/arc/tooltip/tooltip.tsx`: the same optional `morph` on `Tooltip`, passed to the text crossfade. The row's priority, status and More actions glyph tooltips and the copy-code tooltip pass `"plain"`; a glyph tooltip open from keyboard focus while the priority changes optimistically no longer blurs.
  - `src/components/arc/toast-stack/toast-stack.tsx`: the same optional `morph` on `ToastStack`, which swaps each toast's icon and text with filter-free variants. The root layout and the Linear Storybook fixture mount `<ToastStack morph="plain" />`, so Mark Done, Undo and failures never blur over a regrouping list. The action slot's width spring is unchanged (noted as out of scope in the 2.4 spec).
  - `src/components/arc/context-menu/context-menu.tsx`: a menu target with `role="row"` no longer receives `aria-expanded`. Lane's Request rows are treegrid rows, where `aria-expanded` means "its children show", so every leaf row read as collapsed. Only Lane wraps rows in ContextMenu; buttons, links, menu items, tree items and comboboxes keep upstream's behaviour.
  - `src/components/arc/context-menu/context-menu.module.css`: `.shortcut` hides inside the existing coarse-pointer rule, so the row menu's keyboard hints (Select X, Open Request Enter) do not show on touch (plan §2.1, "keyboard hints are hidden on coarse pointers").
  - `src/components/arc/dialog/dialog.tsx`: the content enters on a 240 ms `ease.enter` tween instead of the 400 ms `spring.smooth`, and leaves in 180 ms on `ease.exit`; the overlay and the 120 ms reduced-motion fade are unchanged. This times the new `?` shortcut overlay, the New Request composer (see "Intake launcher and centered Request composer" below) and, intentionally, the Intake navigation guard's dialog.
  - Recorded deviation, not an Arc file: the `?` overlay (`src/components/shell/keyboard-shortcuts.tsx` and `.module.css`) draws its own key caps in a grouped `<dl>`, using only Arc tokens (`--border`, `--surface-muted`, `--radius-control`, `--text-xs`, 400 weight). Arc's free `shortcut-recorder` ships `ShortcutKbd` and `ShortcutKeys` for exactly this, but it is not installed in Lane, and installing it is a registry fetch that waits for Nikhil's go-ahead with the 2.4 sign-off. When it is installed, the caps move to `ShortcutKbd` (its upstream file recorded here and in `arc-source-hashes.json`) and `pnpm bundle:check` is re-run: the overlay is in every authenticated route's first load, since importing it on the first `?` re-split shared chunks (+3.0 KB on every route, page-quality.md, 2.4). Lane's other key hints (the page strip tooltip, the row menu's `.shortcut`, the bulk bar and the welcome hint) stay plain text.
  - `src/components/arc/filter-toolbar/filter-toolbar.tsx`: optional `announce` (default `true`). `false` leaves out the toolbar's own polite `role="status"` span, which announced "Title changed to d", "…de" on every keystroke. The Requests toolbar passes `false`; the list's single announcer reads the debounced result count instead.
- `src/components/arc/progress/progress.tsx`: an explicit `aria-label` is preserved when the visible `label` prop is absent, so upload progress announces its file-specific name.
- `src/app/(app)/intake/intake-form.module.css` (plan item 2.3; centred dialog since 2026-10-13): one composition inside the composer dialog. The fields scroll in their own region with the composer's 24px gutter (16px at 40rem and below), and each step's actions sit in one footer below it with a top rule on the dialog's raised surface. The title and description use the plain Arc Input and Textarea at `--text-lg`/500 and `--text-base`/400.
- `src/components/arc/user-menu/user-menu.module.css`: the email uses Arc's `--text-secondary` token because the upstream muted token did not meet the observed text-contrast threshold on Lane's selected default theme. Workspace submenu styles reuse Arc's panel, item and motion tokens; long identities shrink within the sidebar's available width. The theme selector thumb now uses the shared resting-shadow token instead of a hard-coded light-theme shadow, so it follows the approved shadow-free treatment. Avatar/presence edge separators remain intact; these are crisp boundaries rather than elevation shadows.
- `src/components/arc/sortable-data-table/sortable-data-table.module.css`: the supplied compact-row layout responds to the table's available container width rather than the viewport. Its threshold is 800px, keeping Project, Assignee and Submitted readable when the persistent sidebar narrows a tablet or laptop content area; the Arc row design is unchanged.
- `src/components/shell/` composes the licensed sidebar pattern with Lane's real navigation and notifications. Its CSS is an application adaptation, not a registry copy. `use-sidebar-resize.ts` adds the requested desktop edge drag: 272px initially, 200–400px expanded, below 160px collapsed to zero. It remembers the last expanded width, follows captured pointer movement directly, cancels safely, and supports keyboard separators and `[`. Since plan item 2.4 a toggle (the expand control, `[`, Enter on the separator) slides the panel on transform only, 180 ms out on `ease.exit` and 240 ms in on `ease.enter`, and the content's width changes once: at the start of a collapse and at the end of an expand (`sidebar-motion.ts`). A toggle mid-slide reverses it; drags, arrow keys, End, reduced motion, the automatic collapse and pinning a visible peek change the width in one jump. Arc's smooth spring no longer runs on the sidebar width. After collapse the expand button sits at the start of each page's own strip (below); there is no shell topbar. Phone navigation continues to use the original drawer.
- `src/components/shell/use-workspace-switcher.ts` and `workspace-switcher.ts` use existing Clerk memberships only, with pagination/retry and `setActive`. Successful switching replaces the document at `/`, clearing the previous workspace's mounted state. Pending switching blocks old content; an Intake guard prevents losing in-memory files or interrupting a mutation. Text drafts remain scoped to their original workspace. This adds no workspace/account creation flow.
- `src/components/shell/page-strip.tsx` and `.module.css` (plan item 2.0) replace the shell topbar: each page renders one 44px page strip, and skeletons and the error and not-found frames render the same strip. It is a Lane composition, not an Arc block. The strip holds the shell's expand control (an Arc ghost `button`), an optional leading back or close link drawn with Arc `button` styles, the breadcrumb trail ending in the page title (an `h1` where the strip is the page heading), tools such as the Request's Arc `badge`, one action slot (the list's New Request link with its Arc `tooltip`, or the detail's Pick up and Mark done Arc `button`s from 1024px) and an Arc `dropdown-menu` overflow only when it has items; skeleton titles use Arc `skeleton`. The expand button now lives in each page strip rather than a shell header. The shell passes the trail, its next/link component and the expand control through `PageStripProvider` context instead of the strip importing next/link: the root error, global-error and not-found render the strip with no provider, and these boundaries load with every route, so a next/link import in the strip measured +5.4 KB gzip on every route's first load, over the 2 KB client JS budget. The bottom rule is drawn over the strip's last pixel rather than as a border, so 44px touch controls keep the strip at 44px. Breadcrumb links use only the shared `:focus-visible` ring; fills mark hover, open menus and selection only.
- Request toolbar CSS omits its bottom divider; the page strip above it draws the one rule. Request row hover and focus backgrounds use the shared `--radius-control: 12px` token without clipping child pills or text.
- `src/app/globals.css` maps older semantic utility names to Arc foundation variables while migrated application markup still uses Tailwind; it defines no parallel palette.

- `src/components/arc/filter-toolbar/filter-toolbar.tsx` and `src/components/arc/filter-toolbar/filter-toolbar.module.css`: optional `triggerIcon` renders the existing FilterMenu as a round icon control while retaining its field/value keyboard typeahead, motion, focus and selection behavior. The closed button uses Arc secondary surface/border tokens and 40px desktop / 44px touch targets. Lane has three filter types; no extra text-search field is added to this menu. Icon-only opening/closing now interpolates from the actual 20px (22px touch) trigger radius using Arc’s standard, non-overshooting easing. The old 9999px-to-panel interpolation on an overshooting spring clamped below zero and briefly painted square corners; a browser-frame regression covers both opening and closing.
- `src/components/arc/context-menu/context-menu.tsx`: optional `asChild`, `openOnClick`, `onOpenChange` and per-item `closeOnSelect` preserve a real anchor, ordinary navigation and async Copy feedback. Right-click and Shift+F10 open; Escape/Tab dismiss and restore a visible, connected trigger. Dismissal against a non-focusable backdrop restores the trigger; clicks on other controls retain their focus. Mobile portal keys do not dismiss the parent drawer, and portalled pointer events cannot start its swipe gesture. Defaults preserve the upstream click-trigger API. A narrowly documented refs lint suppression covers event callbacks passed through `cloneElement`.
- `src/components/arc/context-menu/context-menu.module.css`: touch menu items meet a 44px minimum. Arc positioning, highlight, surfaces and reduced-motion behavior are retained.
- `src/components/arc/tooltip/tooltip.tsx`: 2026-10-10, plan item 1.14. Upstream shares warmth through a `useSyncExternalStore` store that every Tooltip subscribes to, so every mounted tooltip re-renders when any tooltip opens or cools; a Requests list mounts hundreds. Warmth is now a module-level value read only when a tooltip asks to open, so nothing subscribes and nothing re-renders. Each Tooltip runs Arc's 250 ms delay itself (Radix is told 0) and skips it while another tooltip is open or closed under 300 ms ago; focus still opens at once, and the trigger cancels a pending open on leave, press and blur because Radix does not report that close. An optional `TooltipProvider` export lets a layout share one Radix provider instead of one per Tooltip; it is not mounted in the root layout, because Radix Tooltip would then load on the auth pages (+24.7 KB gzip measured). The `Tooltip` props and the instant flag are unchanged.

### Licensed search-results derivation

The full Pro `search-results` source was retrieved through authenticated MCP from `https://uiarc.dev/r/pro/search-results.json` before adaptation. Original TSX SHA-256: `8e24070072d6a91062e310c467df279f8fb9bcee69bf3e8773c3a097d7c79034`; original CSS SHA-256: `efbba8f654b06329b612af6a02307d375b2396178fc5d0bef6a17840fc690f54`. Lane's smaller derived composition lives under `src/components/shell/`, not among unmodified registry copies. It retains the source's query/result structure and literal highlighting, adds genuine server results, and uses the installed Arc controls. It has no simulated production content and does not implement Request detail.

## Accent and motion

Until 2026-10-09 the app and Storybook selected the built-in Green accent with `data-accent="green"`, requested by Nikhil on 2026-10-08 to replace Rose; since then the app, and from 2026-10-10 the Storybook default, use Lane's own primitives (`src/styles/lane-primitives.css`, re-authored 2026-10-10; the captured Linear values and their records were removed) through `data-visual-system="lane"`, with the Green preset kept for a single Arc reference story. The native light/dark accent and control presets are unchanged; no custom colour values were added to the foundation. Native success, warning and danger remain semantic. `Review/Utility colours` shows status, feedback and the full Project category palette.

The upstream workspace-sidebar scrolls natively (`motion.div layoutScroll`, `overflow-y: auto`, `overscroll-behavior: contain`). Its springs animate standalone rail width, Lane’s adapted desktop collapse/expand settling, selection and drawer transitions; elastic resistance belongs to the mobile drawer's horizontal drag. It contains no separate vertical elastic overscroll implementation. Lane preserves this behaviour and its reduced-motion branch.

## Verification boundary

Source identity is mechanically checked against the hash ledger; adapted files are reported rather than silently called upstream copies. Product action tests, Storybook interactions, typecheck, lint, build and light/dark responsive review are separate checks. Local passing checks do not prove Clerk or staging behavior.

## 2026-10-08 density and navigation correction

Request rows use a local 44px minimum (`calc(var(--space-10) + var(--space-1))`), replacing `--space-16` (64px). Outer vertical padding is zero on a single-line desktop row, or `--space-1` (4px) when stacked; title padding is `--space-1` (4px) per side. Long titles still grow, metadata wraps at narrow widths, and touch property targets remain 44px. The shared 12px hover radius remains. This is a local Requests composition change, not a global spacing-token change.

## 2026-10-08 Request selection

Official `checkbox` and `floating-button-group` registry files were fetched from their recorded `https://uiarc.dev/r/<id>.json` URLs after the shadcn installer encountered an unavailable transitive Radix release. Checkbox uses pinned `@radix-ui/react-checkbox@1.3.11`, compatible with the installed Radix primitive/slot versions. Existing registry dependencies were preserved.

- `src/components/arc/floating-button-group/floating-button-group.tsx`: an optional non-interactive `leading` slot supplies the selected count; upstream arrow-key navigation and shared highlight remain intact.
- `src/components/arc/floating-button-group/floating-button-group.module.css`: a 44px minimum target for phone/coarse pointers. The floating shadow resolves to the user-requested `none` foundation token.
- Lane composition: left-side row checkboxes, 12px selected/hover surfaces, and a sticky bottom selection toolbar in the main pane. Selection is limited to expanded rows on the current page and clears on view changes. Open-only selections can use the existing guarded Pick up action; In Progress-only selections can use the existing guarded Done action. Mixed selections and guests can copy links. No new lifecycle permission or transition is introduced. Each mutation retains session-derived identity and its existing workspace/status guard. Partial failures remain selected; pending operations block duplicate invocation and stop starting further work after navigation.
- Stored picker photos use the official Arc Avatar with initials on missing/failed images. Unassigned Requests use a neutral circular person glyph, with no presence/activity claims.

Linear's live accessibility tree confirmed the selected count, contextual action, commands and clear controls after keyboard row selection. Chrome returned blank screenshots and interrupted the command-menu click, so exact visual/menu parity is not claimed.


### 2026-10-08 selected-row polish

- `src/components/arc/checkbox/checkbox.module.css`: keyboard focus changes the drawn square to foreground/surface tokens; the 44px click area stays transparent, with no grey tile, outline or shadow. Pointer selection retains upstream Rose control-on/control-glyph colours.
- `src/components/arc/user-menu/user-menu.module.css`: the trigger name uses the body line-height so its ellipsis container does not clip descenders.
- Application composition joins adjacent selected rows within each group with square connecting edges and 12px outer corners. Unselected gaps and group boundaries end each selected block. Picker photos, initials and the neutral unassigned circle use 22px visible dimensions to match Arc small badges; existing 32px desktop and 44px touch targets stay available.
- Rechecked the official theming guide: the existing native Rose light/dark accent and control presets already match Arc and remain unchanged. Selected surfaces use accent-subtle; text uses foreground; checkboxes use the separate control tokens.

2026-10-08 Green accent: both application and Storybook root attributes now select the native Green preset. `src/components/arc/badge/badge.module.css` uses foreground text for info badges, following the existing warning-badge contrast adaptation. Green accent-strong text measured 4.03:1 on a selected/focused Request row in light mode; the icon, border and tint retain native accent tokens. The foundation palette is unmodified.


### 2026-10-08 isolated Geist colour preview

Nikhil approved a neutral-and-blue Geist colour preview for Requests and the sidebar. The preview adapter is enabled only by `data-color-system="geist"` on dedicated Storybook roots. Arc components, APIs, geometry, typography and motion remain the implementation foundation. The production document root keeps its existing palette.

- `src/components/arc/button/button.module.css`: optional neutral hover/pressed colour and opacity roles replace alpha feedback in the Geist preview; added keyboard fills are explicitly limited to that preview root. Arc colour fallbacks and production focus behaviour remain intact.
- `src/components/arc/badge/badge.module.css` and `src/components/arc/alert/alert.module.css`: optional `--state-{neutral,info,success,warning,danger}-*` roles allow solid text, surface, border and hover values rather than mixing a semantic colour over an unknown row background. The original Arc expressions are exact fallbacks.
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`, `src/components/arc/user-menu/user-menu.module.css`, `src/components/arc/filter-toolbar/filter-toolbar.module.css`, `src/components/arc/floating-button-group/floating-button-group.module.css`, `src/components/arc/dropdown-menu/dropdown-menu.module.css`, `src/components/arc/context-menu/context-menu.module.css` and `src/components/arc/select/select.module.css`: optional semantic interaction roles supply explicit neutral hover/pressed/focus fills. Sidebar drawer surfaces can consume the navigation background. Selection trays can consume the selected surface. Existing formulae remain fallbacks, with no change to sizing, radii, layout, animation, portals or behavior.
- Checkbox required no source change: its existing control-on, glyph and focus tokens already support the adapter, and its surrounding hit area remains transparent.

Only `localSha256` is updated for adapted CSS. Recorded registry URLs and upstream hashes are preserved. Preview rendering and interaction verification remain separate from this source-identity record.


### 2026-10-08 shared Geist selection state

The opt-in Geist Requests preview now uses the same selection surface for persistent selected states, including hover and press. These roles are absent from production roots, so the Arc expressions remain their exact fallbacks. New selectors that did not exist in Arc are limited to `:root[data-color-system="geist"]`.

- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`: current navigation highlight and the active global-search control consume selection text/icon/fill roles. Ordinary navigation hover remains neutral.
- `src/components/arc/segmented-control/segmented-control.module.css`: selected option mark and label use the same selection fill/text/border roles without changing its shared-layout motion.
- `src/components/arc/select/select.module.css`: Radix checked options retain a selection fill independently of the transient highlighted option.
- `src/components/arc/filter-toolbar/filter-toolbar.module.css`: checked filter-radio rows and applied-filter chips consume selection roles; unselected pointer/keyboard highlights remain neutral.
- `src/components/arc/user-menu/user-menu.module.css`: current workspace, current destination and selected theme segment use persistent selection roles while regular account commands retain their neutral focus highlight.
- `src/components/arc/floating-button-group/floating-button-group.module.css`: pressed toggle actions keep the selection fill under their moving highlight. `data-active` alone remains transient and neutral.
- `src/components/arc/chip-group/chip-group.module.css`: selected property chips consume shared selection text/icon/border/fill roles in normal, hover and pressed states. Checkmark, layout and sizing remain unchanged.
- `src/components/arc/pagination/pagination.module.css`: the current page uses the same selected surface before and after the moving mark is measured.
- Application-only `src/components/requests/request-property-pickers.module.css` and `src/components/requests/tasks/data-table-toolbar.module.css` apply those roles to the chosen Project and active title filter. No extra selection semantics or actions are introduced.

Regular dropdown/context menus contain commands, not persistent choices, so they remain neutral on hover/focus. Unselected status badges retain status colours; selected Request metadata shares its row colour pair with a 1px `--selection-property-border` (Blue 700 light / Blue 600 dark). Focused/open metadata keeps a Blue 900 border cue. Checkbox squares retain the separate solid control-on/glyph roles for checkmark contrast; their hit areas stay transparent. The adapter owns exact Geist values; no new component-local palette was added.


The shared-selection preview also preserves visible keyboard position: selected tab/chip/option/navigation/workspace/page labels underline only for `:focus-visible`. Selected icon-only controls draw a short, absolutely positioned underline beneath the icon. All cues are scoped to the Geist preview root; no outline, shadow, border width or layout size changes. This updates the above selection CSS modules and `src/components/arc/button/button.module.css` for Project-option label focus. The browser specimen checks keyboard cues alongside the exact theme-specific selection pair.

The selection rule remains Blue 300 background / Blue 900 content in both native theme ramps. `src/components/arc/filter-toolbar/filter-toolbar.module.css` keeps applied-filter remove icons on the same selected surface during hover/focus/press. `src/components/arc/user-menu/user-menu.module.css` renders selected shortcut text at full opacity. `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css` keeps selected search/unread labels, unread indicators and Project dots in the selected foreground through the existing six Project-tone tokens. These Arc refinements remain Geist-root-scoped with exact fallbacks. The latest application-only follow-up replaces a 1.026:1 Gray 400 selected-property stroke and narrows unselected row focus to `:has(.title:focus-visible, .propertyTrigger:focus-visible)`, keeping checkbox focus on its square. Two browser regressions reproduced the defects; 12/12 focused browser stories now pass at 1440px light and 390px dark. TypeScript, lint, Arc source verification (63 files/25 adaptations) and diff checks also pass locally. No Arc source or hash changes were required for this follow-up.

## 2026-10-08 Linear primitives preview

The approved Requests/sidebar preview uses verified Linear Light/Dark visual values through optional Arc token hooks. Existing production and Geist consumers retain their fallbacks. `data-ui-state-contract="semantic"` replaces the Geist-specific state selector only in opt-in previews; `data-ui-surface="floating"` gives portalled menus their own sourced context. React APIs, animation timing, routing and action behaviour are retained. See `linear-primitives.md` for source evidence and deliberate mappings.

Changed Arc files in this increment:

- `src/components/arc/avatar/avatar.module.css`: optional presence-decoration shadow hook, disabled in the preview.
- `src/components/arc/badge/badge.module.css`: optional pill metrics and separate neutral label/coloured glyph roles.
- `src/components/arc/button/button.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/chip-group/chip-group.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/filter-toolbar/filter-toolbar.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/pagination/pagination.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/popover/popover.module.css`: optional floating border width and sourced menu height. Existing motion is unchanged.
- `src/components/arc/popover/popover.tsx`: adds a semantic floating-surface marker for scoped portal theming; no event or state logic changes.
- `src/components/arc/segmented-control/segmented-control.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/select/select.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/select/select.tsx`: adds a semantic floating-surface marker for scoped portal theming; no event or state logic changes.
- `src/components/arc/user-menu/user-menu.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/user-menu/user-menu.tsx`: adds a semantic floating-surface marker for scoped portal theming; no event or state logic changes.
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.
- `src/components/arc/context-menu/context-menu.tsx`: adds a semantic floating-surface marker for scoped portal theming; no event or state logic changes.
- `src/components/arc/context-menu/context-menu.module.css`: optional floating border width and sourced menu height. Existing motion is unchanged.
- `src/components/arc/checkbox/checkbox.module.css`: optional drawn-square size and radius; the hit area remains independent.
- `src/components/arc/floating-button-group/floating-button-group.module.css`: shared semantic state opt-in and optional sourced geometry/no-shadow hooks where needed; defaults preserve existing consumers.

### 2026-10-08 optional nested Request menus

The live Arc MCP `context-menu` and `dropdown-menu` references were checked before this extension; neither supplies nested item data. The existing Arc ContextMenu now accepts optional `children?: ContextMenuItem[]`, `separatorBefore?: boolean`, and `shortcut?: string` on items. Shortcuts are display hints; the caller owns registration. Existing flat menus keep their documented API and Arc pointer-origin scale/fade, shared highlight, and reduced-motion branch.

- `src/components/arc/context-menu/context-menu.tsx`: each submenu retains the Arc panel and item composition. Hover, click, and ArrowRight enter; ArrowLeft or Escape returns to its parent; Escape at the root and Tab dismiss and restore the originating control. Checked leaves use `menuitemcheckbox` and `aria-checked`, preserving the visible check with a custom icon. Panels flip at edges and replace the parent with a Back row when two panels cannot fit. Outside presses and viewport changes dismiss the entire tree; internal scrolling and submenu presses stay inside it. Focus return supports an existing interactive descendant when the context target is a non-focusable Request row. Exiting panels cannot invoke actions. Context-menu events inside an open portal are contained, so an inner property menu cannot open its outer Request-row menu through React event bubbling. Generic row wrappers keep their existing semantics; only compatible trigger roles receive aria-expanded. This adds no Request mutations or application-level shortcut registration.
- `src/components/arc/context-menu/context-menu.module.css`: optional separator, shortcut, check and submenu affordances use existing semantic tokens. The original flat label truncation, touch target, colour and motion rules remain.

`src/stories/context-menu-nested.stories.tsx` exercises actual nested menu interaction and narrow-viewport navigation. Application use is opt-in; the Linear Requests review supplies any illustrative values locally.

### 2026-10-08 responsive Linear review shell

`src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx` accepts optional `forceDesktopLayout` (default false). The review's containing shell owns automatic collapse at 880px and uses the existing hover/click peek at phone widths. `workspace-sidebar.module.css` exempts this opt-in desktop panel from the phone drawer width override. Default Arc sidebar consumers retain their existing phone drawer. The shell's automatic collapse does not overwrite its manually remembered width or collapsed state.


## 2026-10-08 toolbar follow-up composition

The opt-in Linear review reuses installed Arc FilterMenu/Popover, SegmentedControl, Select/ChipGroup, Avatar and the existing NewRequestProvider/Drawer. Summary count rows reuse the native Arc button style classes with normal pressed-button semantics; the summary switcher uses Arc SegmentedControl and its existing motion. The status strip radius is set through the existing `--segment-radius` hook. No Arc registry source or source hashes changed in this follow-up. Group creation links and the list-summary panel are gated by the preview presentation context. Exact source mappings, target-size tradeoff and verification are recorded in `linear-primitives.md`.

### 2026-10-08 Projects folder preview

Nikhil confirmed that Projects remain as they are and become a collapsible tree folder. The optional `projectTree` extension on `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx` defaults to false and is supplied only by the Linear Requests Storybook fixture through `SidebarView.previewProjectTree`. The existing flat Project links, colours, context menus, navigation and creation stay intact. No nested Project data or new destinations are introduced.

The folder button, chevron rotation, 28px child inset, 1px branch guide and height-fold spring are adapted from the actual licensed `docs-sidebar` files returned by authenticated Arc MCP on 2026-10-08: `registry/blocks/docs-sidebar/docs-sidebar.tsx` and `registry/blocks/docs-sidebar/docs-sidebar.module.css`, source registry `https://uiarc.dev/r/pro/docs-sidebar.json`. Only this tree treatment is reused; the docs shell, sample content, version switcher, article reader and outline are excluded. `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css` retains Lane's existing row height, native link treatment and semantic hover/selection colours. Optional `--sidebar-icon-size` and `--sidebar-action-icon-size` hooks adjust SVG navigation/action glyphs only; default sizes, avatars and Project markers are preserved.

The branch remains mounted while its sourced Arc height spring folds it; `inert` and `aria-hidden` immediately remove closed links from focus and accessibility navigation. Arrow keys, Home and End navigate its existing links; Left returns focus to the folder before closing it. The current Project is indicated when folded, and selecting or creating a Project reveals the branch. New Project remains outside the fold. Both the spring and chevron respect reduced motion. `sidebar-project-tree.stories.tsx` exercises folding, focus order, keyboard navigation, native Project navigation/context menus and creation reveal. Browser verification is recorded by the parent refinement pass rather than inferred from source review.


### 2026-10-08 drawer motion and status chips

The current `RequestListSummary` composes installed Arc ChipGroup and Button. Its translate entrance (originally on the spring below; a tween since plan item 2.4) is extracted from authenticated Arc MCP `cart-drawer` source (`registry/blocks/cart-drawer/cart-drawer.tsx`, registry `https://uiarc.dev/r/pro/cart-drawer.json`): `physical(.42, 0)` with 104% → 0% translation and a reduced-motion fade. Only that motion reference is used. The cart products, image flight, quantities, checkout and modal semantics are excluded because Lane's summary is a nonmodal list region. Since plan item 2.4 the panel overlays the list's trailing edge instead of reserving width (a 350px spring on the list's width broke the transform-and-opacity rule for large surfaces); it enters on a 240 ms `ease.enter` tween and leaves on a 180 ms `ease.exit` tween, and below 760px of pane width the list hides behind it. The summary is gated by the existing Storybook presentation context.

The current preview's status selector and summary dimensions replace the earlier SegmentedControl composition with installed ChipGroup's documented single-select API. Default production toolbar consumers retain SegmentedControl. Toolbar SVGs are resized via their existing Lucide size prop; sidebar SVGs use the documented local hooks above. No icon source was fetched or installed from better-icons.

### 2026-10-08 saved Request code composition

The production Request row composes the installed official Arc Button (`variant="ghost"`, `size="sm"`, `loading`) for copying the saved workspace-local code. The Button source and documented API were read before reuse. Application code supplies a 44px target, semantic focus fill, in-place copied icon and announced feedback, visible retry after clipboard failure, and duplicate-write protection. No Arc source was changed, so its source hashes remain unchanged. The code comes from `requestNumber` through the shared formatter, independently of the opt-in Linear row-presentation context; illustrative preview identity remains a fallback only. Search adds the same saved code to its existing metadata. Existing UUID links and Request detail remain intact. New Storybook fixtures use explicit saved numbers to verify identity under sorting/filtering, keyboard copy, clipboard failure/retry, pending presses and long values. These fixtures do not insert workspace data.

The existing search highlight's fallback now uses Arc's normal foreground token on its accent-subtle background: the green accent-strong fallback measured 4.36:1 in browser checks. The explicit Linear search-highlight token remains available in its opt-in preview. No Arc palette or source file was changed.

### 2026-10-10 one notification bell for panel and rail

Plan item 1.8 (`docs/superpowers/plans/2026-10-10-mvp-launch-linear.md`). `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx` no longer takes `compactNotifications`: the workspace section's notification slot renders the single `notifications` node whether the sidebar is a panel or a rail, so Lane mounts one `NotificationBell` element instead of creating two and swapping between them. The rail already hides row names through the existing `.sidebar[data-rail] .name` rule, which covers the bell's "Notifications" label; the count badge keeps Arc's `notification-center` count. Lane's shell always passes `layoutManaged`, so the rail is unreachable there and the panel bell is the one in use. `src/components/shell/sidebar-view.tsx` keeps `compactNotifications` as an ignored optional prop so existing Storybook fixtures still type-check. No other Arc behaviour changed; the block's `.module.css` is unchanged.

### 2026-10-11 Intake attachment presentation

`src/components/requests/intake-attachment-list.tsx` and its CSS module derive the file-row layout, type icons, semantic surfaces and folding list motion from the actual official free [Arc FileUpload](https://uiarc.dev/components/blocks/file-upload) source. The registry was fetched from `https://uiarc.dev/r/file-upload.json` after reading its live Arc MCP documentation and comparing FileDropzone. Upstream source SHA-256 values: `registry/components/file-upload/file-upload.tsx` = `f8614ef57455fe15f571367177edd911f11394de68b7a42ba0511f4a1918f1fd`; `registry/components/file-upload/file-upload.module.css` = `3a4ef30a0872ce36c9d0ed5cc792cdeb96349594d1a43b8f67fdd456f4c57153`.

The documented stock `value` controls selected files, but progress, retry and abort state live inside FileUpload and `onUpload` starts immediately when files are selected. Lane must wait until its Request is created, then preserve its guarded reservation/finalization and failed-file cleanup controller. FileDropzone also manages uploads internally and cannot accept ongoing external state. This functional gap is why Lane extracts only the presentation rather than installing an unused complete block or simulating upload promises. The official install command obtained from Arc MCP was `pnpm dlx shadcn@latest add https://uiarc.dev/r/file-upload.json`; it was not run because the extraction needs only the already-installed Motion, Lucide, Arc Button, Arc Progress and motion tokens. No registry component or dependency changed.

The adapter accepts the existing file objects and external `queued`, `uploading`, `uploaded`, or `failed` states. Its `queued`, `uploading`, and `recovery` presentation modes retain existing list names, recovery button names, and the queued file-specific Remove name. A fourth mode, `lost` (2026-10-13, plan item 2.3 S3), lists files a reload stopped before they were added: it takes only `{ key, name }`, shows the name, a generic File icon and "Not added", has no actions and no live announcement (the recovery heading takes focus), and keeps the list name "Files that weren’t added". Only queued files and failed files in recovery have removal controls; only the existing recovery callback can retry. Full filenames remain text, row accessible names and title attributes. Removal moves keyboard focus only after the parent actually removes the row; a failed asynchronous removal keeps the row. Callers provide the Attach files button or recovery heading as the empty-list focus destination.

Deliberate presentation adaptations: installed Arc Button replaces the source's raw action buttons; installed Arc Progress replaces duplicated progress animation and supplies native progressbar semantics; the completion check appears only for the parent's `uploaded` state; compact metadata uses `--text-secondary`; status/failure counts are announced without announcing every progress event; failures wrap; actions wrap and reach 44px on coarse pointers. Exiting rows are immediately inert and hidden from assistive technology. Arc's smooth height transition, snappy completion icon and reduced-motion branches are retained. No picker, dropzone, validation, upload transport or server callback is added. Integrated browser verification belongs to the Intake review pass, not to this source provenance record.

### 2026-10-11 Borderless Request editor restoration

Superseded on 2026-10-13 when 2.1 to 2.4 merged onto the centred dialog: the composer's title and description are the plain Arc Input and Textarea (`hideLabel`, `appearance="plain"`, recorded with the Input and Textarea adaptations above), not native editors. The record below is kept as history.

The shared Intake form restores the approved borderless title and description from the October 5 composer and launch-plan item 2.3. Arc Input and Textarea do not expose a borderless editor variant or visually hidden label API, so these two writing surfaces use native input/textarea semantics with Lane/Arc typography and spacing tokens. Hidden labels, field IDs, React Hook Form registration, validation messages, read-only review state and draft recovery remain unchanged. The native text caret indicates editing focus, with `--focus-outline: transparent` scoped only to these editors, matching the approved no-rectangle treatment. Other form controls retain Arc components and shared keyboard focus. No registry component or global token changed.


### 2026-10-11 Intake launcher and centered Request composer

The user requested Linear's observed empty-state → Create Request → popup flow. `/intake` now composes the installed Arc EmptyState with the existing NewRequestLink, under the page strip, which is the page's one h1 ("New Request", decision 8.10). It opens the same layout-level NewRequestProvider used from Requests; no second form or route was added. On 2026-10-13 Nikhil chose this centred dialog for the New Request composer, and 2.3's composer (one compose composition, Expected impact disclosure, AI gate states, review blocks, upload recovery) moved into it; nothing uses the Arc Drawer any more and its files are upstream again.

The installed `src/components/arc/dialog/dialog.tsx` and `src/components/arc/dialog/dialog.module.css` gain an additive `layout="composer"` presentation (`data-layout` on the overlay and content): 47rem maximum width, centred horizontally and placed `min(13dvh, 7rem)` from the top (16px at 640px and below, where it spans the width less 8px each side), `--radius-panel` (12px under Lane), and a bounded body. The header is a 44px strip whose title starts on the composer's 24px edge (16px at 640px and below); the description stays the dialog's accessible description but is visually hidden; the close is a borderless 32px button (44px on coarse pointers) that keeps Arc's `--surface-muted` hover fill, which the transparent rest state would otherwise outrank. The body has no padding at any width and hands its height and scrolling to the composer, which owns the gutters, so they are not doubled and focus rings are not clipped at the scroller's edge. Two changes apply to every Arc Dialog in Lane, the composer included (decision 8.22): the overlay reads the theme's `--overlay` token (`--lane-overlay` in both themes) with the upstream colour as fallback and no backdrop blur, and the content uses the 240 ms enter and 180 ms exit timing recorded in the plan item 2.4 list above. Default Dialog layout and APIs otherwise remain unchanged.

The composer's title and description are the plain Arc Input and Textarea, and its private file controller, draft host, workspace guards, AI gate and callbacks are reused. Expected impact stays required behind one disclosure row (decision 8.26), which a failed submit opens at once with focus on its first invalid field, as accepted in launch-plan §2.3. The source-adapted layout keeps Escape/close focus restoration (to the trigger, or to the new Request's row after creation, never to the document), busy dismissal protection and reduced motion. Arriving on `/intake` with this tab's saved draft or review opens the composer once by itself, restored as 2.3's page restored it, and closing it returns focus to the launcher's Create Request; creating there opens the new Request. No icons were downloaded.

### 2026-10-11 Compact Request type menu and token restoration

Request type now uses the installed Arc Select instead of RadioGroup cards. `src/components/arc/select/select.tsx` adds an optional custom trigger slot to reuse the existing Arc Button chip and a content keyboard handler to isolate menu shortcuts from form submission. The label remains accessible, the menu has an explicit accessible name, and stock selection, focus restoration and motion remain in place. `src/components/arc/select/select.module.css` lets a custom-trigger menu fit its single-line options even when the selected chip label is short; default Select sizing is unchanged.

The screenshot-sampled dark palette and primary-button indigo override added in the preceding pass were removed. Buttons, overlays, placeholders and surfaces again use the existing Lane primitive and Arc mappings; the separate approved accent-token changes are preserved. When this merged with 2.1 to 2.4 on 2026-10-13, the Dialog overlay kept 2.3's theme token (`--overlay`, no backdrop blur, decision 8.22, recorded in the composer section above): light keeps 2.3's tinted `--lane-overlay`, and dark `--lane-overlay` is Arc's own scrim value `oklch(0.1 0 0 / 0.46)` instead of the screenshot-sampled `rgb(0 0 0 / .45)`. No `--secondary-*`, `--primary-*` dark overrides, `--text-placeholder` or `--overlay-background` remain.

### 2026-10-11 Compact Expected impact and explicit Project creation

Expected impact composes the installed Arc Select with its existing compact Button trigger, replacing the stacked radio cards. Its existing Input and Textarea controls retain labels, errors, numeric editing and mode-specific draft preservation; caller classes use the shared small-control height and spacing tokens. Related metric fields share a row when the container allows, with evidence and timing below. The Intake launcher drops its pill-radius override and inherits the standard Arc Button radius.

The Project picker exposes New Project before any search is typed. It reuses Arc Input and Button inside the existing Popover and calls the existing guarded createProject action. Cancel restores the choices without changing the selected Project or Request draft; creation remains busy-protected and errors retain the entered name. No new component source, palette, route or backend contract was added.

### 2026-10-11 Optional Expected impact guardrail

The optional guardrail reuses the installed Arc Input, Select, DropdownMenu and Button. Following Nikhil's Linear sub-issue interaction reference, More opens a distinct inset editor below the complete primary impact fields. It uses Lane surface/spacing/control tokens and Arc's smooth height spring with reduced motion. Exiting content becomes inert and hidden from assistive technology immediately. Add/Save changes validates and collapses to a readable summary; Edit reopens it and Cancel restores the last committed value. The main unit stays `%`; the guardrail unit starts blank and its helper explains periods and percentage populations.

`src/components/arc/dropdown-menu/dropdown-menu.tsx` gains optional `trigger`, `onCloseAutoFocus` and `onContentKeyDown` props to compose the existing small icon Button, focus the newly opened editor, and isolate menu shortcuts from Request submission. The menu receives its accessible name from its existing label. Its default trigger, items, keyboard operation, CSS and motion remain unchanged. No color token changed.

### 2026-10-12 Optional hidden Input label

`src/components/arc/input/input.tsx` adds optional `hideLabel` (default false) for sentence-style form composition where surrounding text provides the visible context. It uses the component's existing `srOnly` class on the native label while preserving its `htmlFor` relationship, the required label prop, forwarded ref, description/error messages and merged `aria-describedby`. Existing consumers retain visible labels; Input CSS and motion are unchanged. 2026-10-13: 2.3 had added the same optional `hideLabel` with `appearance="plain"` (recorded with the Input and Textarea adaptations above); the merge keeps one `hideLabel` prop with this behaviour, and `appearance="plain"` is the only Input CSS change.

### 2026-10-16 Custom measurement dates

The free official [Arc Calendar](https://uiarc.dev/components/calendar) was read through Arc MCP and installed verbatim from `https://uiarc.dev/r/calendar.json`. Its `calendar.tsx`, `calendar.module.css` and previously absent shared `lib/use-today.ts` are recorded with upstream SHA-256 values in `arc-source-hashes.json`. Existing Arc foundation, motion helpers and adaptations were preserved. The registry's Motion and Lucide dependencies were already installed; no dependency was added. These three files have no Lane source adaptations.

`src/components/requests/measurement-date-dialog.tsx` composes that Calendar with the installed Arc Dialog, Input and Button. From and To inputs share a single calendar; selecting From moves to To. Lane stages edits until Apply dates, validates real local calendar dates and their order, restores the Measurement window trigger after dismissal, and isolates portalled keyboard events from the Request composer. Cancel and Escape preserve the previously saved range. Application CSS uses existing token values, including the accent token for calendar icons. This is an application composition, not a new date-picker primitive.

`src/components/arc/dialog/dialog.tsx` adds an optional `overlayClassName` composition hook to both its Motion and bare-Radix paths. The nested date dialog uses that hook to place its overlay/content at layers 52/53, above the parent composer's unchanged Arc layers 50/51, so its overlay dims the composer too. No layer tokens currently exist in Lane; these scoped integers control stacking only. Default Dialog styling, motion, positioning and semantics remain unchanged.

`src/components/arc/dialog/dialog.module.css` uses `overflow: clip` only on `layout="composer"` content. The form's existing inner body remains the scroll container. Unlike `hidden`, `clip` prevents focus changes from scrolling the entire composer and hiding its header, while retaining the rounded clipping boundary. Default Dialog overflow is unchanged.

### 2026-10-16 Property menu icons and trailing selection mark

Official Arc Select and DropdownMenu APIs were checked through MCP. `src/components/arc/select/select.tsx` adds an optional `icon?: ReactNode` to options, rendered outside ItemText so accessible labels and native values remain plain text. `src/components/arc/select/select.module.css` sizes the slot with existing tokens and keeps the keyboard underline on the text. Priority options reuse Lane's existing PriorityGlyph and semantic colours.

`src/components/arc/dropdown-menu/dropdown-menu.tsx` adds an optional `trailingIcon?: ReactNode` item slot; `src/components/arc/dropdown-menu/dropdown-menu.module.css` aligns it at the inline end. Measurement-window selection now uses that slot for its checkmark, with CalendarDays as the leading icon. Existing consumers retain their default rendering, keyboard behavior and motion. The default measurement pill reads Measurement dates; the existing 30-day default remains selected in its menu.

### 2026-10-16 Custom measurement date range

The custom measurement menu now opens the official [Arc Date Range Picker](https://uiarc.dev/components/date-range-picker), discovered through Arc MCP and installed from `https://uiarc.dev/r/date-range-picker.json`. It replaces the separate From/To inputs and single-date calendar composition above. Existing shared motion tokens and `lib/use-today.ts` were not overwritten, and no dependency was added.

`src/components/arc/date-range-picker/date-range-picker.tsx` adds optional `embedded` and `onCancel` props for composition inside Lane's existing Arc Dialog. The default trigger-to-panel presentation remains unchanged. Embedded mode omits only that trigger/surface, delegates dismissal and opening motion to the containing Dialog, initializes its draft/layout/focus through the stock opening path, and leaves scrolling to the modal. The preset rail is omitted when `presets` is empty, with its responsive threshold accounting for the absent rail. `src/components/arc/date-range-picker/date-range-picker.module.css` adds normal-flow panel positioning in embedded mode. Native range stretching, endpoint glides, rolling labels, month navigation, hover preview, keyboard operation and reduced-motion behavior are retained.

The application keeps nested layers 52/53 and the existing menu-to-dialog focus handoff. Dates are parsed and saved as local calendar days. Only Apply commits both endpoints; Cancel, Escape and outside dismissal preserve the saved range and return focus to Measurement window. Arc orders reverse selections and permits same-day ranges. The modal uses two months when space permits and one on narrow screens; no request numbers or measurement values are cleared by date selection.


### 2026-10-16 Supabase shared controls (Tasks 1–2)

`src/components/arc/button/button.module.css` adds optional size-specific radius/padding and material hooks, including primary/danger raised shadows and a default raised surface for Lane's secondary variant. Arc's secondary maps to Supabase's default, not its differently styled secondary. Hover/focus/pressed fills keep their semantic variants. `src/components/arc/input/input.module.css` adds field, border, read-only and invalid-state tokens, preserving plain composer fields. `src/components/arc/badge/badge.module.css` exposes default padding, minimum height and icon gap. All hooks retain Arc fallbacks; React APIs and motion are unchanged. Supabase source is pinned to `64a6aa908594975646d157def9e7a74940634d8f`. Geist, sentence case, existing font sizes/line heights and motion remain deliberate differences. See the verification record linked in `supabase-tokens.md`.

The icon-pill follow-up adds a CSS `:has(.icon)` leading-inset hook in `src/components/arc/badge/badge.module.css`. Lane supplies 8px for default and 4px for compact icon badges; trailing padding stays 12px/8px. Text-only pills are unchanged, and plain Arc keeps its previous padding through fallbacks.


### 2026-10-16 Supabase application adoption

The dropdown-menu, context-menu and select CSS modules expose optional menu padding, item radius and padding hooks. The root dropdown/select use shadow-md; context menus retain shadow-lg. Popover exposes padding and shadow hooks. Dialog exposes background and shadow hooks, mapped to Studio's actual `bg-dash-sidebar` and light shadow-md/dark shadow-xs. Textarea, PasswordField and SearchField share the approved Input field and border hooks; Textarea uses px-3/py-2. Original Arc values remain as fallbacks. React APIs, handlers, focus management, motion and composer layouts are unchanged. Select retains Arc's trailing check placement, so its px-2/pl-8 reference insets are mirrored. Lane retains Arc typography and its resulting row height; these are styling adaptations rather than identical copies of Supabase components.

Sources at `64a6aa908594975646d157def9e7a74940634d8f`: `packages/ui/src/components/shadcn/ui/{dropdown-menu,select,dialog,popover,textarea}.tsx`. Clerk uses its existing appearance variable API to share primary action, field and focus colours. The app and Storybook already load this theme globally; no separate activation flag or new component API is introduced.

Adapted field files: `src/components/arc/textarea/textarea.module.css`, `src/components/arc/password-field/password-field.module.css`, `src/components/arc/search-field/search-field.module.css`. Each keeps the original field behavior and reads the shared optional material hooks described above.


### 2026-10-16 Global token enforcement (explicitly authorised)

The shared `src/components/arc/button/button.module.css` supplies its inherited icon role through `--button-icon-sm/md/lg`, mapped to existing Supabase icon tokens (14/18/20px). Unsized send and loading icons no longer inherit Lucide's 24px default. Arc label transitions and press motion are unchanged.

Replaces remaining fixed CSS consumer dimensions, radii, typography and local materials with theme roles. Spacing calculations preserve Lane composition proportions; corner sizes use the shared radius scale. CSS durations retain their relative timing through the shared duration token; JavaScript spring physics and SVG drawing geometry remain Arc behavior. Literal fallbacks no longer bypass the theme. The foundation retains reference defaults for new geometry roles, and the production mapping resolves them to Supabase. Date-range morph radii are measured from CSS and retarget when the document theme changes; compact cells use CSS spacing expressions instead of a fixed inline cell size.

Updated licensed files:

- `src/components/arc/alert/alert.module.css`
- `src/components/arc/avatar/avatar.module.css`
- `src/components/arc/badge/badge.module.css`
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`
- `src/components/arc/button/button.module.css`
- `src/components/arc/calendar/calendar.module.css`
- `src/components/arc/checkbox/checkbox.module.css`
- `src/components/arc/chip-group/chip-group.module.css`
- `src/components/arc/context-menu/context-menu.module.css`
- `src/components/arc/date-range-picker/date-range-picker.module.css`
- `src/components/arc/date-range-picker/date-range-picker.tsx`
- `src/components/arc/dialog/dialog.module.css`
- `src/components/arc/drawer/drawer.module.css`
- `src/components/arc/dropdown-menu/dropdown-menu.module.css`
- `src/components/arc/empty-state/empty-state.module.css`
- `src/components/arc/filter-toolbar/filter-toolbar.module.css`
- `src/components/arc/floating-button-group/floating-button-group.module.css`
- `src/components/arc/foundation.css`
- `src/components/arc/input/input.module.css`
- `src/components/arc/notification-center/notification-center.module.css`
- `src/components/arc/pagination/pagination.module.css`
- `src/components/arc/password-field/password-field.module.css`
- `src/components/arc/popover/popover.module.css`
- `src/components/arc/progress/progress.module.css`
- `src/components/arc/radio-group/radio-group.module.css`
- `src/components/arc/search-field/search-field.module.css`
- `src/components/arc/segmented-control/segmented-control.module.css`
- `src/components/arc/select/select.module.css`
- `src/components/arc/skeleton/skeleton.module.css`
- `src/components/arc/sortable-data-table/sortable-data-table.module.css`
- `src/components/arc/textarea/textarea.module.css`
- `src/components/arc/toast-stack/toast-stack.module.css`
- `src/components/arc/tooltip/tooltip.module.css`
- `src/components/arc/user-menu/user-menu.module.css`

The rail width expression in `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx` now reads `--space-16` instead of a fixed 64px, retaining the original morph calculation.

2026-10-16 toolbar consistency: `src/components/arc/filter-toolbar/filter-toolbar.module.css` uses `--radius-control` for the popover trigger, matching sibling toolbar buttons. Filter chips and the separate morph presentation retain their existing shapes.

### 2026-10-16 App-wide icon token audit

Lucide and marked custom icons share the foundation size rule; role attributes select source-backed sizes. Component icon slots use matching roles, including nested Button icons, Badge and EmptyState defaults. Numeric JSX dimensions are removed; SVG drawing coordinates and motion are unchanged. The production token checker now audits icon props and sizing utilities as well as CSS.

Adapted files:

- `src/components/arc/alert/alert.tsx`
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx`
- `src/components/arc/calendar/calendar.tsx`
- `src/components/arc/checkbox/checkbox.tsx`
- `src/components/arc/chip-group/chip-group.tsx`
- `src/components/arc/context-menu/context-menu.tsx`
- `src/components/arc/date-range-picker/date-range-picker.tsx`
- `src/components/arc/dialog/dialog.tsx`
- `src/components/arc/drawer/drawer.tsx`
- `src/components/arc/dropdown-menu/dropdown-menu.tsx`
- `src/components/arc/empty-state/empty-state.tsx`
- `src/components/arc/filter-toolbar/filter-toolbar.tsx`
- `src/components/arc/notification-center/notification-center.tsx`
- `src/components/arc/pagination/pagination.tsx`
- `src/components/arc/password-field/password-field.tsx`
- `src/components/arc/progress/progress.tsx`
- `src/components/arc/search-field/search-field.tsx`
- `src/components/arc/select/select.tsx`
- `src/components/arc/sortable-data-table/sortable-data-table.tsx`
- `src/components/arc/toast-stack/toast-stack.tsx`
- `src/components/arc/user-menu/user-menu.tsx`
- `src/components/arc/alert/alert.module.css`
- `src/components/arc/badge/badge.module.css`
- `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css`
- `src/components/arc/button/button.module.css`
- `src/components/arc/checkbox/checkbox.module.css`
- `src/components/arc/chip-group/chip-group.module.css`
- `src/components/arc/context-menu/context-menu.module.css`
- `src/components/arc/dropdown-menu/dropdown-menu.module.css`
- `src/components/arc/empty-state/empty-state.module.css`
- `src/components/arc/filter-toolbar/filter-toolbar.module.css`
- `src/components/arc/floating-button-group/floating-button-group.module.css`
- `src/components/arc/select/select.module.css`
- `src/components/arc/sortable-data-table/sortable-data-table.module.css`
- `src/components/arc/toast-stack/toast-stack.module.css`
- `src/components/arc/user-menu/user-menu.module.css`
- `src/components/arc/foundation.css`

2026-10-16 compact section action: `src/components/arc/button/button.module.css` adds reusable `iconCircle` sizing using shared spacing and full-radius tokens. The Requests section Add link composes this with the shared button/ghost classes; its page-specific hover paint was removed. Its tooltip uses the existing plain presentation.

2026-10-16 shared tooltip correction: `src/components/arc/tooltip/tooltip.module.css` uses raised surface/foreground instead of an inverted white plate, with text-xs and 6px/8px token-derived padding. Text measurement widths use the same horizontal inset. This applies to every Arc tooltip in Lane.

### 2026-10-18 Search and property control consistency

- `src/components/arc/search-field/search-field.tsx` and `src/components/arc/search-field/search-field.module.css` add an optional accessible `hideLabel` presentation. Workspace search now uses this component, including its padded input shell, clear action and focus behavior, instead of duplicating its markup.
- `src/components/arc/segmented-control/segmented-control.module.css` consumes shared segment material and geometry roles. Lane maps these to Supabase's text-tone segmented ToggleGroup, tiny size, at the existing pinned commit: transparent outer frame, 1px track inset, 26px items, accent selection without an additional border or shadow. Arc's shared-layout animation and keyboard behavior are unchanged.
- `src/components/arc/badge/badge.tsx` and `src/components/arc/badge/badge.module.css` add `appearance="control"` for read-only Request properties. It composes the existing small secondary Button classes, including icon sizing, while remaining a noninteractive span. Regular badges are unchanged.
- `src/components/arc/button/button.module.css` excludes read-only property spans from pointer hover/pressed treatments. Their material, geometry and typography use the same rules as interactive property buttons.

Source: [Supabase ToggleGroup](https://github.com/supabase/supabase/blob/64a6aa908594975646d157def9e7a74940634d8f/packages/ui/src/components/shadcn/ui/toggle-group.tsx) and [Toggle](https://github.com/supabase/supabase/blob/64a6aa908594975646d157def9e7a74940634d8f/packages/ui/src/components/shadcn/ui/toggle.tsx). All visual values already exist in `supabase-tokens.css`; component role mapping lives in `lane-arc-theme.css`.


### 2026-10-18 Rich workspace search

Licensed Arc Pro Search Results source was retrieved through Arc MCP and its reference interactions inspected at https://uiarc.dev/components/blocks/search-results. `src/components/shell/workspace-search-results.tsx` and `src/components/shell/workspace-search-pane.module.css` adapt the block's facets, active-filter chips, highlighted results, shared-layout selection cursor, keyboard listbox, recent-query menu, count animation and responsive preview. `workspace-search-pane.tsx` retains Lane's authenticated, abortable GET search controller. Real Requests/Projects and validated status/type/created-date filters replace demo documents, people, teams and edited dates. No simulated timings or fixture data are used in product search. All visual values resolve through the shared Supabase token mapping.

Official Bottom Sheet was installed from https://uiarc.dev/r/bottom-sheet.json, preserving the existing motion-token files:

- `src/components/arc/bottom-sheet/bottom-sheet.tsx`: shared icon sizing; optional Radix `onCloseAutoFocus` hook for controlled previews without a trigger. Arc's detents, drag resistance, interruption, keyboard handling and reduced-motion logic remain intact.
- `src/components/arc/bottom-sheet/bottom-sheet.module.css`: surface, scrim, dimensions, typography and border literals map to existing shared tokens. Gesture geometry remains runtime-driven.

Upstream Search Results source fingerprints retrieved for this adaptation:
- `search-results.tsx`: `cd084d8adaec5b5e0542c7557f35b1e7021d0cc701b76a7fd8e969f3a7eb2c89`
- `search-results.module.css`: `deb55aeb9ee6233b80fc2b5b9b792023bfc40430d78b07b05064e6d689af4425`

2026-10-18: `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.tsx` now renders Lane’s shared `ProjectMarker`. The existing ID-to-tone mapping and hollow No Project marker are unchanged; Intake, Request rows/detail, and search reuse the same marker.

### 2026-10-18 Settings Command

Licensed Arc Pro Settings Command retrieved through Arc MCP. `src/components/arc/blocks/settings-command/settings-command.tsx` extracts its command palette, highlighted matching, keyboard selection and morph animation. `src/components/arc/blocks/settings-command/settings-command.module.css` maps its palette styling to existing Supabase-backed tokens. Lane adds accessible search labeling and availability metadata. The application adapter and catalog retain its navigation/search pattern, replace demo data with permission-filtered settings, and route to existing Profile/Members pages. Stock save timers and demo controls are not used. Coming soon panels perform no mutations. Pro source is licensed for Lane only.

Settings composition correction: the Lane adapter now adapts the full block's bounded frame, full-width header/search, 208px icon navigation, continuous section scroller, scroll tracking, 620px section measure and two-column setting rows. Dimensions map to the existing Supabase spacing tokens. Account and organization actions open supported Clerk modals rather than nesting a second navigation system. Existing role/theme immediate saves remain; the stock demo save bar is intentionally omitted because these settings do not share an atomic persistence operation. Future settings are one section, with subgroup headings beneath it.

2026-10-18 Vercel layout correction: user-authorized read-only inspection of signed-in Vercel team General and Account Settings informed the Lane adapter's full-viewport shell, centered content column and filled bordered cards with separate help/action footers. `settings-card.tsx` is a structural wrapper; actual controls remain Arc. Visual values remain Supabase tokens, not copied Vercel colors. Each navigation destination shows one panel; future entries remain grouped in Coming soon with disabled Arc buttons. Role/theme preserve immediate saves and Clerk retains account/organization authority. This supersedes the bounded frame and continuous-scroller description above. The licensed command-palette source and motion remain unchanged.

2026-10-20 dropdown audit: `src/components/arc/filter-toolbar/filter-toolbar.module.css` now consumes the shared menu padding, row height, item padding and gap hooks used by Select and DropdownMenu. Right-hand checkmarks and keyboard behaviour are unchanged. Request popover adapters use the same hooks, with separate shared form spacing for Add Project and Add link.
The same audit maps `src/components/arc/user-menu/user-menu.module.css` panel inset and action-row padding/gap to those menu hooks; account header, theme controls and workspace selection semantics remain unchanged.

### October 20 — comparison menu anatomy

`src/components/arc/select/select.tsx` adds opt-in `indicatorPosition="left"` and an option `trailing` slot. `src/components/arc/select/select.module.css` aligns the selection mark left and trailing comparison symbols right using the existing accent token. Defaults and Radix keyboard/focus behaviour remain unchanged. Metric search composes the installed Arc Popover, Input and Button with the shared Request picker spacing.

### 2026-10-21 — unavailable menu items say why

`src/components/arc/context-menu/context-menu.tsx` adds an optional item `description`. A disabled item with a description shows it under its label and stays focusable with `aria-disabled` and `aria-describedby`, so arrow keys and screen readers reach the reason; selecting it does nothing. Items without a description keep upstream's native `disabled`. `src/components/arc/context-menu/context-menu.module.css` dims only that item's icon and label, keeps the reason in secondary text, and wraps it at a fixed measure. The Request row menu uses it for a Pick up that isn't ready yet.
