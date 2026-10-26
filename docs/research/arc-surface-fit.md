# Research: which Arc components and motion fit each kind of Lane surface (#225)

Question: which Arc and Arc Pro components, blocks and motion rules fit each kind of surface in Lane, and where does Lane use something hand-made instead?
Scope: this file records facts only. It makes no decisions, and no product code changed.
Snapshot: `main` at `3e6de934` (2026-10-26). Arc docs were fetched on 2026-10-26.

## Sources

- **Arc docs, per item.** `https://uiarc.dev/components/<id>/markdown`. Each page has "When to use", "When not to use", "Motion" and "Responsive behavior" sections. Below, a phrase in quotes is copied from these pages.
- **Arc index.** `https://uiarc.dev/llms.txt`, plus the docs pages `/docs/introduction`, `/docs/theming`, `/docs/motion` and `/docs/ai`, and the guide `/guides/react-command-menu`.
- **Arc tokens upstream.** The current motion tokens are at `https://uiarc.dev/r/arc-motion-tokens.json` and the foundation at `https://uiarc.dev/r/arc-foundation.json`.
- **Installed skills.** These are `.claude/skills/arc/` (SKILL, components, composition, motion, design, responsive, accessibility, checklist, INSTRUCTIONS) and `.claude/skills/arc-pro/` (SKILL, motion-recommendations, refactor-to-arc, full-page-generation). The skill files live only in the main checkout and are not tracked by git. Each free-skill file was diffed against `https://uiarc.dev/r/skills/arc/<file>.md` and is identical to upstream.
- **Lane.** `src/components/arc/`, `docs/design-system/arc-sources.md` (the "ledger"), `DESIGN.md`, `src/styles/theme.css`, and plan §2.3 in `docs/superpowers/plans/2026-10-10-mvp-launch-linear.md`.
- **Pro items.** No Pro source was installed or fetched for this research, because `ARC_PRO_TOKEN` is not set. Pro facts come from the public Pro docs pages and from Pro source Lane already holds.

## 1. Surface → Arc item table

"Arc's pick" is what the skill or the item's docs name for that job. "Installed" means the source is in `src/components/arc/`. Free means MIT; Pro means it needs the Arc Pro licence.

| Lane surface (inventory #223) | What Lane uses today | Arc's pick for the job | Installed? | Gap or note |
| --- | --- | --- | --- | --- |
| Confirmations (6 of the 15 dialogs; Dialog importers include `delete-request`, `pickup-confirmation`, `intake-navigation-guard`, `paid-seat-dialog`, `slack-connection-card`, `metric-controls`) | Arc `dialog` | `dialog` when "the consequence needs explaining". Otherwise `confirm-morph` (inline, free), or `hold-to-confirm` (free) "when an accidental tap must be nearly impossible" | `dialog` yes; `confirm-morph` and `hold-to-confirm` no | Skill quick decisions: "Destructive action → `confirm-morph`… Not: A modal for every delete" |
| New Request composer | Arc `dialog` with Lane's added `layout="composer"` (47rem, centred), chosen by Nikhil on 2026-10-13 | Arc: dialog is for "Short forms like rename or invite". For "Forms that are too long for a dialog but should not leave the current view", use `drawer` | yes | The skill's map says "Long forms go to `drawer`". Lane's composer is a recorded deliberate choice (ledger, 2026-10-11 and 2026-10-13 entries) |
| Edit Request, Add metric, saved view save/rename, Same problem link, "Is it live?", measurement dates | Arc `dialog` | `dialog` for short forms. `inline-edit` (free) for "Rename in place… instead of a dialog for one field" | `dialog` yes; `inline-edit` no | Saved view rename is one field, which matches `inline-edit`'s stated job |
| Created-date picker (search) | Arc `dialog` holding Arc `date-range-picker` in `embedded` mode | `date-range-picker`, which by default "grows from its trigger into two months" (a trigger-anchored panel) | yes (Lane added `embedded`) | Arc's default presentation is anchored to its trigger, not inside a dialog |
| Keyboard shortcuts (`?`) | Arc `dialog`; key caps drawn by Lane | `shortcut-recorder` (free) ships `Kbd` and "a searchable cheatsheet" | no | Ledger records the key caps as a "recorded deviation" |
| ⌘K command palette | Arc `dialog` + Arc `search-field` as an APG combobox. List, keys and motion are Lane code (`src/components/shell/command-palette*`) | `command-palette` block (free): "App-wide command search opened with Cmd or Ctrl plus K"; "Wrap it in dialog and pass onClose" | no | Ledger line 17 records this as a "functional gap"; installing it "waits for Nikhil's go-ahead". `search-field` docs say "Use expanding-search or search-field to search page content", not for app-wide commands |
| Settings search | Licensed Pro `settings-command` block, adapted | `settings-command` (Pro): "Choose it when a product has more than about 15 settings" | yes (Pro, adapted) | Docs say "Use command-palette for app wide navigation and actions, not just settings" |
| Properties drawer on phones (Request detail) | Arc `drawer` with `side="bottom"` | Arc: "Mobile-first secondary task with snap heights → `bottom-sheet`". Drawer docs: "Use bottom-sheet for mobile-first sheets with snap points" | both installed | `drawer` supports top and bottom sides; Arc points phone tasks to `bottom-sheet` |
| Search filters sheet, search result preview sheet (phones) | Arc `bottom-sheet` (`detents={[.9]}`) | `bottom-sheet`. The Pro `search-results` block itself opens the preview "in a bottom sheet" below 1120px and filters "in a filters sheet" below 680px | yes | Matches Arc |
| Request preview side panel (`request-peek.tsx`) | Hand-made `motion.section role="region"`, non-modal, translate-in on a 240 ms tween | `drawer` is for "record details that keep the page in context", but it is modal (Radix Dialog root). `resizable-panels` (free) is for "Two panes that trade space". The Pro `search-results` and `inbox-triage` blocks use an in-layout preview pane | no Arc item used | Lane's code says "Not a dialog: the list keeps its keys, so J and K move the list". Arc has no documented non-modal side panel component |
| List summary panel (`request-list-summary.tsx`) | Hand-made overlay; translate on 240/180 ms tweens. Motion taken from the Pro `cart-drawer` source | `drawer` (modal) | no | Same non-modal gap as the preview panel |
| Mobile sidebar | Off-canvas drawer inside the licensed Pro `workspace-sidebar` block | `workspace-sidebar` / `sidebar-rail` (Pro; "slides in as a sheet on phones") | yes (Pro) | Matches Arc |
| 7 popovers (Project, labels, reviewers, metric, related link pickers; table filter) | Arc `popover` with Lane lists inside; the filter uses Arc `filter-toolbar` `FilterMenu` in `presentation="popover"` | `popover` "Custom pickers built from your own controls". For value pickers Arc also offers `morph-select` (free; "property panels… assignees, or projects"), `combobox` (free; long or searchable lists) and `multi-select` (free; "labels or assignees") | `popover` yes; `morph-select`, `combobox`, `multi-select` no | Skill table for "Several values" says use `multi-select`… "Instead of: Checkbox lists in a popover" |
| Recent-searches menu (workspace search) | Lane adaptation of the "recent-query menu" in licensed Pro `search-results` source (ledger line 392), a combobox listbox in `workspace-search-results.tsx` | `search-results` (Pro) props `recentSearches` and `suggestedSearches`; `expanding-search` (free) has "grouped results and recent suggestions"; the command-menu guide says "put recent items above everything else" | derived from Pro source, not an installed component | Inventory #223 calls this "hand-made". Per the ledger it comes from Pro block source, adapted |
| 6 dropdown menus (saved views, More actions, status, measurement window, view pills, account) | Arc `dropdown-menu` (5 files) and `user-menu` | `dropdown-menu`; `user-menu` for "Account, theme, sign out"; `split-button` "when one command is the default" | yes | Matches Arc |
| 3 right-click menus (Project, glyph, Request row) | Arc `context-menu` (with Lane's nested-menu and `description` additions) | `context-menu`. Docs: "Avoid it on targets that need their own click action, since a plain click on the target also opens the menu" | yes | Lane added `openOnClick`/`asChild` so anchors keep their native click (ledger) |
| Toasts (1 system, 13 trigger sites) | Arc `toast-stack`, mounted once in `src/app/layout.tsx` with `morph="plain"` | `toast-stack` for "async results, errors, and undo". Skill: "A toast as the only confirmation of a foreground action" is on the Never list; "Result of a save → the button or row confirms in place" | yes | For example, `profile-role-form.tsx:167` toasts "Role updated." after a save the person started |
| Tooltips (9 places) | Arc `tooltip` (`morph="plain"` in rows) | `tooltip` for "One-line labels on icon-only buttons" and truncated text; "never hide essential information in one" | yes | Matches Arc |
| Requests list (the "table") | Hand-made ARIA `grid` / `treegrid` (`src/components/requests/tasks/data-table.tsx`, `request-row.tsx`) composed of Arc `badge`, `popover`, `checkbox`, `context-menu`, `tooltip`, `pagination`, `filter-toolbar`, `floating-button-group` | `sortable-data-table` (free) for "Records to sort and compare"; `data-grid` (Pro) for spreadsheet editing; `tree-table` (free) for nested rows with columns. Recipe for a record list: "`filter-toolbar` or `search-field`, `sortable-data-table`, `pagination`, `empty-state`" | `sortable-data-table` was installed and deleted on 2026-10-21 as unused (ledger line 422) | `@tanstack/react-table` 9.2.4 is in `package.json`, but `src/` imports only three state type names from it (`list-view-state.tsx:6`). Nothing renders through TanStack. Ledger: "Arc has no exact Request row block" |
| Settings cards (`SettingsCard`, billing account/plan cards, free Requests card, Slack card) | Lane `section.card` in `settings.module.css`, described as "Vercel's settings fieldset structure" | `card` (free) is "Browsable items in a grid". Composition rule: "Settings: a list of rows… inside one bordered group per section… Do not wrap each row in its own card". refactor-to-arc maps "Card with header and actions → `card` or plain markup with a border". Pro: `settings-page`, `billing-overview`, `team-members` | `card` no; Pro settings blocks no (only `settings-command`) | Arc's own guidance allows plain bordered markup for setting groups |
| Auth cards (`AuthFormCard`, `auth-card-skeleton`) | Lane `section` in `auth.module.css`; Clerk does the authentication | `sign-in`, `login-centered` (free blocks); `login-split`, `login-immersive` (Pro) | no | Clerk owns the auth flows (DESIGN.md) |
| Tabs | Hand-made `role="tablist"` in `src/components/impact/impact-screen.tsx` (My work / Outcome report) | `tabs` (free) for "Peer views of the same object"; `segmented-control` for "2 to 5 views of the same data" | `tabs` no | The only hand-made tablist found in `src/` |
| Switch | None. On/off choices use `radio-group` (Inbox delivery) or `segmented-control` (theme) | `switch` (free) for "On or off that applies now"; `theme-switch` for light/dark | no | Inbox delivery has three options (Email, Slack DM, Off), which matches radio-group, not switch |
| Empty states | Arc `empty-state` (16 files; title adapted to `h2`) | `empty-state`; the `empty-states` block (free) as a reference for "no results, offline, inbox zero, and 404"; `onboarding-checklist` (free) "when first-run needs several steps" | `empty-state` yes | Error and not-found screens use `empty-state` |
| Loading | Arc `skeleton` (20 files), 12 `loading.tsx` files | `skeleton` "in the final layout"; `skeleton-morph` (Pro) for loads "in under a few seconds"; `text-shimmer` (free) for AI "Generating" lines | `skeleton` yes | `skeleton-morph` docs: "Use skeleton for long lists of hundreds of rows; layout animation there is costly" |
| Inbox page | Lane list beside the Request preview, with 3 raw `<button>`s in `inbox-view.tsx` | `inbox-triage` (Pro) "A queue of messages or requests that need archive, snooze, or restore decisions"; `notification-center` (free) is for a header bell panel "Use inbox-triage for a full-page inbox" | no | The `notification-center` component file was deleted 2026-10-21; its CSS module stays for the bell popover |
| Impact page (KPIs, outcome report) | Lane composition with Arc `segmented-control`, `empty-state` | `metric-card` (free) "Hand-built KPI cards" → metric-card; Pro `metrics-dashboard`, `kpi-drilldown` | no | Not part of this ticket's list; recorded for completeness |

### Raw `<button>` elements outside `src/components/arc/` (9 files, 12 elements)

| File | What it is | Arc item that names this job |
| --- | --- | --- |
| `src/app/global-error.tsx:51` | Retry on the root error screen | `button` (global-error renders outside the app layout) |
| `src/components/settings/settings-command-adapter.tsx:139` | "Search settings" trigger with `/` key cap | part of the Pro `settings-command` block it adapts |
| `src/components/inbox/inbox-view.tsx:77,84,100` | Open row, read/unread toggle | `inbox-triage` (Pro) rows; `button` |
| `src/components/auth/sign-out-link.tsx:25` | Text-style sign-out | `user-menu` "Account, theme, sign out" |
| `src/components/requests/request-properties.tsx:46` | Property trigger inside `PopoverTrigger` | `button` with `asChild` ("the press scale turns off automatically for popup anchors") |
| `src/components/requests/request-list-summary.tsx:61` | Summary row, styled with Arc button classes | `button` / `chip-group` |
| `src/components/requests/request-row.tsx:161,166` | Priority and status glyph menu triggers in grid rows | `dropdown-menu` trigger / `button` |
| `src/components/requests/tasks/data-table.tsx:283` | Group collapse toggle inside a `gridcell` | `tree-table` / `accordion` patterns |
| `src/components/impact/impact-screen.tsx:90` | Tab triggers | `tabs` |

## 2. Arc's guidance: dialog vs drawer vs bottom sheet vs popover (and neighbours)

Quoted from each item's "When to use" / "When not to use" and the skill's tables.

| Item | Use for | Do not use for (Arc names the alternative) | Size and responsive |
| --- | --- | --- | --- |
| `dialog` | "Confirmations and decisions that must interrupt"; "Short forms like rename or invite that fit in one focused panel"; multi-step flows whose title crossfades | "Use drawer for long forms or detail panels that keep the page in context"; "Use bottom-sheet for mobile-first secondary tasks with snap heights"; "Use popover for light, non-modal content anchored to a trigger" | "min(100vw minus a 32px gutter, 440px) wide and centered"; height capped, scrolls inside |
| `drawer` | "Side panels for filters, settings, or record details that keep the page in context"; "Forms that are too long for a dialog"; any edge, drag-to-dismiss on the header | "Use dialog for short decisions and confirmations"; "Use bottom-sheet for mobile-first sheets with snap points"; "Use popover for small anchored content that does not need a modal overlay" | Left/right "min(30rem, 100vw minus a gutter)", near-full width below 40rem; top/bottom "cap at min(32rem, 100dvh)" |
| `bottom-sheet` | "Mobile-first secondary tasks such as details, filters, or share options"; peek then near-full height; maps/media | "Use dialog for interrupting decisions on any screen size"; "Use drawer for side panels on wide desktop layouts"; "Use popover for small anchored content that should not dim the page" | "min(100%, 36rem) wide"; detents are fractions of dynamic viewport height |
| `popover` | "Click-opened panels with interactive content"; "Non-modal helpers that should stay open while people interact with the rest of the page"; "Custom pickers built from your own controls" | "Use tooltip for short hover labels"; "Use hover-card for read-only previews"; "Use dialog when the choice must block the page, and dropdown-menu for a list of commands" | 12rem to "min(22rem, 100vw minus 20px)"; Radix collision flipping |
| `sheet-stack` (Pro) | "Nested pickers"; "Flows that should be a bottom sheet on phones and a centered dialog on desktop from one declaration" | "Use dialog for a single confirmation or form with no nested steps"; "Use bottom-sheet for one sheet with snap points" | `mode="auto"`: bottom sheets under 640px, centred dialogs at or above |
| `hover-card` | Previews of people or links; "the click must stay free for navigation" | "Use popover when the content has buttons or inputs" | 18.5rem |
| `tooltip` | "One-line labels on icon-only buttons"; full text of truncated labels | "Use popover for anything with links or controls inside"; "Avoid it for information people must see on touch devices" | caps at 15rem |
| `dropdown-menu` / `context-menu` | A list of commands behind a labelled trigger / right-click or Shift+F10 on content | dropdown: "use command-palette for searching many commands"; context: "Use dropdown-menu when the actions deserve a visible trigger" | context menu max height 300px; "closes on any scroll or resize" |

Other rules from the skill:
- `responsive.md`: "On phones, prefer `bottom-sheet` for tasks and long menus; keep `popover` for small choices. `user-menu` already opens as a sheet on phones."
- `accessibility.md`: "Dialogs, drawers, sheets, and popovers move focus in, keep it there, close on Escape, and return focus to the trigger. Arc's overlays do this; do not rebuild them."
- `components.md`: "Use the same item for the same job everywhere in the app: one confirmation pattern, one menu, one table."
- `design.md`: "Shadows only on layers that float: menus, popovers, dialogs, sheets (`--shadow-floating`). Cards rest on a border with no shadow."
- `drawer` notes: "Always compose Drawer as the root; under a bare Radix Dialog root the panel falls back to CSS keyframes and loses drag."
- Arc has no non-modal side panel component. `drawer` is modal; `resizable-panels` "Panes do not stack on narrow screens" and is "horizontal only".

## 3. Motion guidance

### Arc tokens (upstream) and what Lane has installed

| Token | Lane's installed `src/components/arc/motion-tokens.ts` | Upstream registry today (`arc-motion-tokens.json`, `/docs/motion`) | Skill `motion.md` (identical to upstream skill) |
| --- | --- | --- | --- |
| `spring.smooth` | visualDuration 0.4, bounce 0 | 0.4, bounce 0 | 0.4s, bounce 0 |
| `spring.snappy` | 0.26, **bounce 0.12** | 0.26, **bounce 0** | 0.26s, bounce 0.12 |
| `spring.morph` | 0.42, **bounce 0.16** | 0.42, **bounce 0** | 0.42s, bounce 0.16 |
| `spring.responsive` | stiffness 520, **damping 38** | 520, **damping 44** | (not listed) |
| `spring.gentle` | 340 / 34 | 340 / 34 | (not listed) |
| `duration` instant/fast/exit/standard/considered | 0.12 / 0.16 / 0.18 / 0.24 / 0.48 s | same | same |
| `ease.enter` / `exit` / `standard` / `inOut` | [.16,1,.3,1] / [.7,0,.84,0] / [.22,1,.36,1] / [.65,0,.35,1] | same | (named, values not given) |

- Upstream changed `snappy` and `morph` to zero bounce. The comment on morph now reads: "No bounce: sizes and positions settle without overshoot". Lane's installed file and the published skill text still carry the older bounce values, so the upstream skill and the upstream token file disagree with each other.
- **CSS variables.** Arc's `foundation.css` sets `--duration-instant` 120ms, `-fast` 160ms, `-standard` 240ms, `-considered` 480ms and `-spring` 580ms, with `--ease-spring` as a `linear()` spring curve (bounce .15). Lane's `src/styles/theme.css` (Lane additions, lines 405–415) overrides them: 100 / 150 / 200 / 300 / **200ms**, and `--ease-spring: cubic-bezier(.22, 1, .36, 1)`, which is the same as `--ease-standard`. It also sets `--ease-exit` to `.4,0,1,1` and `--ease-in-out` to `.4,0,.2,1`. These CSS overrides do not reach Motion (JS) animations, which read `motionTokens`.
- **Effect on CSS-driven items.** The popover animates `transform var(--duration-spring) var(--ease-spring)`, so in Lane it settles in a 200ms bezier where upstream uses a 580ms spring curve.

### Arc's rules (skill `motion.md`, `/docs/motion`, Pro `motion-recommendations.md`)

- "Motion shows cause and effect… If an animation explains nothing, remove it."
- "Animate `transform` and `opacity`… Animate `width` or `height` only when the size change is the information, and then on a spring." From `/docs/motion`: "Nothing resizes in a single frame; widths and heights follow on a spring."
- **Springs by job.** "Anything that reports state lands without overshoot: a switch thumb, a drawer edge, a panel height… Use `spring.smooth`." "Small life is for feedback: `spring.snappy` on a press, `spring.morph` for a selection highlight." "Visible bounce is for playful moments only… Never on routine product UI."
- **Panels and large surfaces.** `spring.smooth` covers "Panels, height, drawers, progress, layout shifts". `/docs/motion` lists `spring.gentle` for "Larger layout changes that should feel calm" and `--duration-standard` 240ms for "Panels and menus". Arc gives no width threshold for springs on large surfaces.
- **Overlay enter and exit** (Pro `motion-recommendations.md`): "Dialog, popover, menu enter → `duration.standard` with `ease.enter`, short transform from the trigger edge". "Exit → `duration.exit` with `ease.exit`. Faster than the entrance."
- "One continuous gesture per interaction." "Everything is interruptible: use springs for anything the user can reverse."
- "Presses scale to about 0.97, except an element that anchors a popover or menu: answer that press with color."
- From `/docs/motion`: "Actions repeated many times a minute, like keyboard navigation, do not animate." The command-menu guide says the highlight "slides between results in 70 ms" on arrow keys and to "never animate the text people are typing".
- "One orchestrated entrance per page at most." Stagger totals stay "under about 0.4s".
- **Reduced motion.** "Every animation has a branch… Keep the final state, focus, and feedback. Remove travel, loops, parallax, and autoplay." `/docs/motion`: "A short opacity change is fine."

### Each overlay's documented motion upstream, and Lane's version

| Item | Arc upstream | Lane today |
| --- | --- | --- |
| `dialog` | Overlay fades; panel "rises 8px and scales from 0.96 on a smooth spring; closing is shorter" | Adapted (decision 8.22): content enters on a 240ms `ease.enter` tween, leaves in 180ms `ease.exit`; reduced motion 120ms fade |
| `drawer` | "springs in from its edge and leaves faster on a tween"; flick keeps velocity | Upstream motion kept: `spring.smooth` entrance (`drawer.tsx:179`), 240ms `ease.standard` leave |
| `bottom-sheet` | One motion value; drag 1:1, rubber-band, velocity picks a detent; backdrop tracks position | Upstream: `spring.smooth` settle, leave `smooth` with visualDuration .3 |
| `popover` | CSS: "fades and settles from 5px toward its trigger at 0.97 scale on a spring; it leaves in 140ms" | CSS transition on Lane's 200ms bezier `--duration-spring` (see above) |
| `tooltip` | Opens after 250ms, 3px rise from 0.97; reduced motion 90ms fade | Upstream timing; Lane `morph="plain"` removes blur in rows |
| `toast-stack` | Rise from below; stack fans out "on a morph spring" | Upstream; `morph="plain"` |
| `skeleton` | Pulse wave; content rises 4px; height springs (`spring.smooth`) | Upstream |
| Request preview, list summary (Lane) | n/a | `x: 104% → 0` on 240ms `ease.enter`, leave 180ms `ease.exit` |
| Sidebar collapse (Lane) | Pro `workspace-sidebar` sprang width on `spring.smooth` | Panel translates; content width changes once per toggle (`sidebar-motion.ts`) |

### Lane's own rule (not from Arc)

Plan §2.3 in `docs/superpowers/plans/2026-10-10-mvp-launch-linear.md` says: "Large surfaces animate only `transform` and `opacity`. Springs are banned on surfaces wider than about 200 px." It also says: "A panel enters in ≤ 240 ms", "No backdrop blur on overlays", and "No `filter: blur` label or icon morphs inside dense rows". The ledger (line 189) says that a 350px spring on the list's width "broke the transform-and-opacity rule for large surfaces". The ~200px spring ban is Lane's rule. Arc's docs name `spring.smooth` for drawers and panels and give no width limit.

## 4. Gaps where Lane uses hand-made pieces

These are facts per piece. Each lists the Arc candidates with their documented scope and the constraint Lane has recorded.

1. **Cards.**
   - Lane has `SettingsCard` (named, with `AuthFormCard`, in 12 non-test files), billing account and plan cards, the free Requests card, the Slack connection card, and the auth form card. All are Lane `section` elements styled with tokens.
   - Arc's free `card` is for "Browsable items in a grid" (its motion is a hover lift and a quick-look morph). It is not installed.
   - Arc's settings guidance is "one bordered group per section" of rows, not a card per row. refactor-to-arc accepts "plain markup with a border".
   - Pro alternatives are `settings-page`, `billing-overview` and `team-members`. None is installed.
2. **Requests table.**
   - It is a hand-made ARIA grid/treegrid. TanStack supplies only type names (`ColumnFiltersState`, `ColumnVisibilityState`, `PaginationState`) and renders nothing.
   - Arc candidates:
     - `sortable-data-table` (free): client-side sort, Shift-click range selection, folds to two lines below 620px. It was removed from Lane on 2026-10-21 as unused.
     - `tree-table` (free): nested rows with columns, lazy children.
     - `data-grid` (Pro): spreadsheet editing.
     - `kanban-board` (Pro): "A team board where cards move between statuses".
   - Ledger: "Arc has no exact Request row block". Grouped status sections, saved priority, J/K keys and context menus are Lane behaviour.
3. **Command palette.** This is Lane code on Arc `dialog` + `search-field`. The free `command-palette` block exists and is not installed. The ledger records this as a "functional gap", with spec #101's reasons: "No new component source", a 2 KB route budget, and Lane already ships Dialog and SearchField. Upstream palette motion: the "panel rises in on a spring; the results frame springs to the list height"; the highlight follows "on the snappy spring".
4. **Recent-searches menu.**
   - Lane code adapted from the licensed Pro `search-results` recent-query menu. It keeps up to 5 queries, matching the block's "up to five".
   - It is not an installed Arc component. Free alternatives with recent suggestions are `expanding-search`, and the `command-palette` "Recent" group pattern.
5. **Raw buttons.** There are 12 elements in 9 files (table above). Several are triggers inside grid rows, or deliberate composites: anchors with `asChild`, and buttons that reuse Arc button CSS classes.
6. **Tabs.** The hand-made tablist is on `/impact`. Arc `tabs` (free) is not installed.
7. **Switch.** None is used and Arc `switch` (free) is not installed. Current on/off-style settings have three or more options.
8. **Non-modal side panels** (Request preview, list summary). Arc has no non-modal side panel component. Lane's motion for them comes from the Pro `cart-drawer` source, retimed to tweens.
9. **Keyboard shortcut caps.** The `?` overlay draws its own key caps. Arc `shortcut-recorder` (free) ships `Kbd` and a cheatsheet, and is not installed.

## 5. Open facts worth checking later (not decisions)

- Lane's `motion-tokens.ts` predates upstream's zero-bounce `snappy`/`morph` and `responsive` damping 44. Arc's skill text still states the older values.
- Lane's theme makes `--duration-spring` 200ms and `--ease-spring` a plain bezier. Every Arc CSS transition that pairs them (the CSS modules for popover, drawer, dropdown-menu, filter-toolbar, checkbox, pagination, alert, toast-stack and workspace-sidebar all reference `--duration-spring`) runs as a 200ms ease, not a spring curve.
- Inventory #223 lists the Requests table as "uses TanStack" and the recent-searches menu as "hand-made". The code shows a type-only TanStack import and a Pro-derived menu.
