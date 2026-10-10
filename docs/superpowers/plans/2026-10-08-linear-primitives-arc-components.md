# Linear Primitives with Arc Components — Implementation Plan

**Status:** Approved and implemented as an opt-in Requests/sidebar Storybook preview on 2026-10-08. Source verification, mapping and the 112-run theme/width matrix are complete. Production activation remains pending visual review. See `docs/design-system/linear-primitives.md` for the delivered scope and deliberate mappings. The checklists below retain the original plan; the implementation record reports what was actually verified.

**Goal:** Give the existing Requests interface Linear-sourced colours, spacing, borders, radii and control dimensions while retaining Arc components and Lane behaviour.

**Architecture:** Keep Arc's React components, public APIs, accessibility mechanics and existing motion. Add a sourced Linear primitive file and a separate semantic adapter that supplies the variables Arc and Lane already consume. Prove the combination in opt-in Storybook stories before considering production activation.

**Tech Stack:** Existing React 19, CSS custom properties/CSS modules, Arc UI, next-themes, Storybook and Vitest browser tests. No new component package or runtime dependency.

**Execution:** Work task-by-task with the available local tools and an independent review of the mapping and rendered result. The superpowers execution skills referenced by the generic planning template are not installed and are not dependencies of this plan.

## Global constraints

- First review surface: Requests list, workspace sidebar, search, account/workspace menu, filter/display menus, metadata pickers and bulk-selection bar.
- Marketing and Request detail remain excluded. Do not activate a document-root production theme: that would also recolour Request detail.
- Preserve Arc components, real callbacks, keyboard semantics, focus return, portal behaviour, animations and reduced-motion branches.
- Preserve Lane data, Clerk/Supabase boundaries, permissions and business rules. No routes, tables, AI calls, features or lifecycle changes.
- Preserve the explicit no-shadow decision, including control-thumb and inset decorative shadows. Border and focus visibility must survive.
- Preserve joined selected rows, title-led rows without horizontal dividers, picker avatars, selected metadata backgrounds, visible pill strokes, compact toolbar, sidebar resizing and peek behaviour.
- Production remains on its existing theme during this increment. Existing Geist stories remain available as a rollback/reference until the replacement is reviewed; they are not active sources for the Linear preview.
- The requested target is Linear-sourced visual values. Any value without applicable evidence is an evidence gap, not an excuse to silently carry an Arc/Geist visual value into a supposedly complete migration.
- Typography is proposed to include Linear's sizes, weights and line heights using the existing Inter font. This is a stated assumption pending the user's typography preference. No proprietary font asset is downloaded or bundled.

## Feasibility and present evidence

Arc officially supports overriding semantic roles after its foundation import: https://uiarc.dev/docs/theming. Its installed Pro design-system workflow also supports token-based theming. This lets the component implementation and visual foundation have different sources.

The local extraction in `artifacts/linear-css-tokens-2026-10-08/` contains:

- A complete 571,279-byte static CSS asset, with 588 distinct declared custom-property names and 881 names when references/registrations are included.
- 166 exact semantic aliases from the theme provider, including 116 colour roles.
- Captured constructed dark rules with all 134 and 137 reported properties respectively.
- Scoped declaration evidence, **not a proof that every declaration wins the live cascade**. Some root defaults may be overridden. Keep source declarations and verified applied values distinct.
- No equivalent live light-theme capture and no verified universal Linear spacing/radius scale.

Known geometry includes 8px controls/input corners, rounded 9999px, and component-specific 6px/10px corners. These are not interchangeable. Adopting verified Linear control geometry would deliberately replace the earlier 12px Lane control override for those controls; pill and panel radii need their own roles.

The current implementation has useful semantic hooks, but this is more than a palette swap:

- `foundation.css` exposes `--surface`, `--border`, `--space-*`, `--radius-*` and control-height variables.
- Some geometry remains literal: badge height/padding, the checkbox square, sidebar row spacing and the workspace pane radius.
- Twelve component/composition CSS modules gate improved state styling on `data-color-system="geist"`. Those rules need a shared semantic opt-in to work in the new preview.
- Arc primary buttons use foreground/background directly. A global foreground swap cannot independently give them Linear's primary-control treatment.
- Root theme scoping is needed in Storybook so portalled menus inherit the preview. Wrapper-only overrides would miss those menus.

## Ownership after approval

| Area | Proposed authority |
| --- | --- |
| Surface, text, utility, selection, hover and control colours | Verified Linear values for the chosen theme/context |
| Border colours, strengths and widths | Verified Linear roles and matching control geometry |
| Spacing, padding, gaps, heights and radii | Verified values from matching Linear components, with source context |
| Font sizes, weights, line heights | Proposed Linear metrics with the existing Inter font |
| React components, APIs, keyboard mechanics and portals | Existing Arc implementation |
| Motion, resize/peek controllers and reduced motion | Existing Arc/Lane behaviour |
| Shadows | Disabled under the user's existing instruction |
| Product content, routes, permissions and workflows | Lane |

The production definition of design authority changes only after the preview is accepted. Arc remains the component source; Linear becomes the approved visual-value source for the migrated scope.

## Task 1 — Verify the source values for the actual controls

**Files:** Create `docs/design-system/linear-primitives-source.json` and `docs/design-system/linear-primitives.md`. Read the saved CSS, `semantic-map.json` and `runtime-observed.json`; do not import these archives into the app.

**Deliverable:** A finite source matrix for every visible primitive consumed by the first preview, with light/dark values and matching component contexts.

- [ ] Inspect Linear's current list/shell and relevant controls in Chrome, without changing workspace content. Record the applied background, text, border, radius, padding, gap, height and line-height for each target.
- [ ] Capture light mode separately. A temporary appearance change must follow the applicable browser permission rules and restore the user's setting. If light mode cannot be inspected, label the result dark-only and stop short of claiming a two-theme migration.
- [ ] Verify root/content, sidebar, popup, selected row and selected menu-item contexts separately. Determine whether captured root declarations are defaults or actually applied. Do not copy a local sidebar theme into the content-pane role.
- [ ] Measure rows, checkbox, pill, avatar, toolbar controls, group heading, menu items, popup padding and outer corners. Record normal, hover, selected, selected-hover, keyboard-focus, disabled and open states where each exists.
- [ ] Retain original LCH values. If an sRGB fallback is necessary, derive it deterministically and identify it as a conversion; do not sample screenshots or adjust hex values by eye.
- [ ] Validate source pairs against the rendered UI before mapping: text at least 4.5:1, large text 3:1, and meaningful control/focus indicators 3:1. Decorative separators are not automatically subject to the control-boundary threshold. Any failure is reported and resolved using an appropriate sourced role or a separately reviewed exception.

Use this source-record contract:

```ts
type PrimitiveEvidence = {
  token: string
  category: "color" | "spacing" | "size" | "border" | "radius" | "typography"
  mode: "light" | "dark" | "both"
  context: "canvas" | "content" | "sidebar" | "menu" | "request-row" | "control"
  state: "default" | "hover" | "selected" | "selected-hover" | "focus" | "disabled" | "open"
  value: string
  sourceVariable?: string
  sourceFileOrUrl: string
  sourceSelector: string
  sourceLocation: string
  verification: "applied-in-browser" | "declaration-only"
}
```

Only `applied-in-browser` records populate the first preview's final mapping. Declaration-only entries remain research evidence. Do not invent a universal 4px Linear scale from unrelated component values.

## Task 2 — Add the primitive layer and Arc adapter

**Create:** `src/styles/linear-primitives.css`, `src/styles/linear-arc-theme.css`.

**Modify:** `.storybook/preview.tsx` only for activation; production root imports and theme attributes stay unchanged.

**Interface:** Stories opt in with `parameters.visualSystem = "linear"`; their mounted preview sets `data-visual-system="linear"` and `data-ui-state-contract="semantic"` on `<html>`. Cleanup restores previous attributes. `data-theme` continues to select light/dark through the existing ThemeProvider.

- [ ] Keep exact sourced values in `linear-primitives.css`, named by readable role and context. Keep aliases and application mappings in `linear-arc-theme.css`.
- [ ] Import both after foundation/globals in Storybook. In Linear mode, remove `data-accent` and `data-color-system`; never activate the Geist and Linear adapters together. Preserve both attributes on cleanup and preserve existing story behaviour.
- [ ] Map page, content, sidebar, popup and control surfaces independently. Use explicit default/hover/pressed/selected/focus roles rather than allowing existing `color-mix()` fallbacks to become new unsourced colours.
- [ ] Map utility tones, project markers, unchecked/checked/indeterminate controls, links, selection text/icon/background/border and selected metadata independently. Success and selected state must remain distinguishable.
- [ ] Preserve selected pill/owner-avatar backgrounds matching the row while keeping their own verified visible border. Keep icon colours and text colours aligned with the intended state role.
- [ ] Map geometry by purpose: row, pill, checkbox, menu, control and main surface. Preserve independent touch-hit areas rather than shrinking targets to match a small visible icon.
- [ ] Keep `--shadow-resting`, `--shadow-raised`, `--shadow-floating` and control-thumb shadow disabled. Audit local decorative shadows too.

Adapter structure (role names are the contract; numeric values come from Task 1):

```css
:root[data-visual-system="linear"] {
  --workspace-canvas: var(--linear-canvas-background);
  --surface: var(--linear-content-background);
  --surface-raised: var(--linear-menu-background);
  --foreground: var(--linear-content-text);
  --text-secondary: var(--linear-content-text-muted);
  --selection-background: var(--linear-row-selected-background);
  --selection-foreground: var(--linear-row-selected-text);
  --selection-property-border: var(--linear-row-selected-metadata-border);
  --radius-control: var(--linear-control-radius);
  --radius-panel: var(--linear-menu-radius);
  --radius-pill: var(--linear-rounded-radius);
  --shadow-resting: none;
  --shadow-raised: none;
  --shadow-floating: none;
  --control-thumb-shadow: none;
}
```

These aliases are a mapping proposal, not evidence that similarly named Linear roles apply everywhere. Complete the matrix for every active consumer before calling the preview fully migrated.

## Task 3 — Connect existing components without replacing them

**Primary files:** `src/components/requests/request-rows.module.css`, `request-property-pickers.module.css`, `src/components/requests/tasks/data-table-toolbar.module.css`, `src/components/shell/workspace-shell.module.css`, `src/components/projects/project-dot.module.css`.

**Arc adaptations only where required:** CSS modules for badge, button, checkbox, workspace-sidebar, user-menu, popover, filter-toolbar, segmented-control, floating-button-group, chip-group, select and pagination.

**Provenance:** `docs/design-system/arc-sources.md`, `docs/design-system/arc-source-hashes.json`.

- [ ] Generalise the twelve Geist-only state selectors to `data-ui-state-contract="semantic"`. Set that attribute for the existing Geist preview too, so its behaviour remains unchanged while the new preview is reviewed.
- [ ] Use existing custom properties first. Where a literal prevents the requested density/radius, expose a narrow variable with the current value as its fallback. This is a documented component adaptation, not a replacement component.
- [ ] For example, parameterise the badge's small height/padding and checkbox visual size/radius together with the mark dimensions. Keep the checkbox hit area independent. Do not use broad descendant resets or `!important` overrides.
- [ ] Parameterise primary-button surface/text/border roles independently of general body text so each control can use the correct Linear colour pair.
- [ ] Replace shell and row geometry literals only where Task 1 has a relevant measurement. Keep resizable sidebar bounds, hit areas and mobile behaviour functional.
- [ ] Preserve the selected-row joining rules and the deselection fix. A focused checkbox must not keep a deselected row highlighted; normal pointer hover can still display its hover state.
- [ ] Preserve no horizontal row lines, the group-heading gap, equal pill/avatar visual height, legible descenders and the compact toolbar.
- [ ] Keep popup radius constant from the first frame. Retain Arc's existing transition behaviour; do not animate radius from zero or introduce a new motion system.
- [ ] Record every changed Arc source file and its reason; retain its upstream hash and update only its local adaptation hash.

## Task 4 — Produce and verify one complete review surface

**Create:** `src/stories/linear-primitives.stories.tsx` and, if needed for a state board, `src/stories/linear-primitives.module.css`.

**Reuse:** `src/stories/requests.stories.tsx`, `request-selection.stories.tsx`, `sidebar-resize.stories.tsx`, `sidebar-peek.stories.tsx`, `filter-menu-motion.stories.tsx`, and `helpers/rendered-colours.ts`.

- [ ] Reuse real Requests/shell components and existing safe Storybook fixtures. Do not add another page implementation or new product routes.
- [ ] Include: default list; one selected row; adjacent/non-adjacent selections; deselection; assigned/unassigned avatars; all three statuses; empty/loading/error; long titles/names; global search; account menu/workspace submenu; filter/display and property menus; bulk-selection bar; collapsed/peeking/resizing sidebar.
- [ ] Exercise light and dark at 390, 768, 1024 and 1440px. Desktop dimensions may follow Linear while coarse-pointer hit areas remain at least 44px.
- [ ] Use browser-computed colours for contrast, including alpha composition. The existing `rendered-colours.ts` canvas path can handle browser-supported LCH; do not reuse `src/test/color-contract.ts` as-is because its opaque parser does not support LCH.
- [ ] Keep meaningful regressions: connected selection corners, visible 1px metadata stroke, deselection clearing after pointer exit, avatar/pill height equality, focus/escape/return behaviour, portal theme inheritance and stable flyout radius. Compare geometry to the independently captured source matrix, not to constants copied from the implementation.
- [ ] Check that switching away from the preview restores the previous theme and geometry, including after hot reload. No Geist accent or Arc preset may win inside the Linear preview by specificity accident.

Existing behavioural assertion pattern to retain in the new story:

```tsx
const rows = within(canvas.getByRole("list", { name: "Open Requests" }))
  .getAllByRole("listitem")
await userEvent.click(within(rows[0]).getByRole("checkbox"))
await userEvent.click(within(rows[1]).getByRole("checkbox"))
expect(getComputedStyle(rows[0]).borderBottomLeftRadius).toBe("0px")
expect(getComputedStyle(rows[1]).borderTopLeftRadius).toBe("0px")
expect(canvas.getByRole("toolbar", { name: "Selected Requests" })).toBeVisible()
```

Run the focused story suite in each theme/width, then the existing affected interaction stories:

```sh
STORYBOOK_THEME=light STORYBOOK_WIDTH=1440 pnpm test:storybook src/stories/linear-primitives.stories.tsx
STORYBOOK_THEME=dark STORYBOOK_WIDTH=1440 pnpm test:storybook src/stories/linear-primitives.stories.tsx
STORYBOOK_THEME=light STORYBOOK_WIDTH=390 pnpm test:storybook src/stories/linear-primitives.stories.tsx
STORYBOOK_THEME=dark STORYBOOK_WIDTH=390 pnpm test:storybook src/stories/linear-primitives.stories.tsx
STORYBOOK_THEME=light STORYBOOK_WIDTH=768 pnpm test:storybook src/stories/linear-primitives.stories.tsx
STORYBOOK_THEME=dark STORYBOOK_WIDTH=768 pnpm test:storybook src/stories/linear-primitives.stories.tsx
STORYBOOK_THEME=light STORYBOOK_WIDTH=1024 pnpm test:storybook src/stories/linear-primitives.stories.tsx
STORYBOOK_THEME=dark STORYBOOK_WIDTH=1024 pnpm test:storybook src/stories/linear-primitives.stories.tsx
pnpm typecheck
pnpm lint
pnpm design:check
pnpm build
git diff --check
```

Use the Storybook-specific configuration; avoid an unrelated database-backed full test run. Run existing sidebar/menu/selection story files when their shared implementation was adapted. Review the rendered result manually, including keyboard and reduced motion, before reporting completion.

## Task 5 — Review, record the decision and define rollout

**Files after preview acceptance:** `DESIGN.md`, `DESIGN-NOTES.md`, the relevant authority paragraph in `AGENTS.md`, and `docs/design-system/linear-primitives.md`.

- [ ] Show the actual Requests/sidebar preview in both verified modes. Summarise the adopted values, any remaining evidence gaps and any deliberate exceptions such as no shadows.
- [ ] Ask for review of this concrete result before changing the production theme. The first implementation stops at that reviewable preview.
- [ ] If accepted, record the authority split: Linear visual primitives, Arc components/motion, Lane product rules. Retire the competing active colour preview only as part of that accepted migration, retaining source evidence.
- [ ] Plan production activation as a separate bounded step. A root-level activation is blocked while Request detail remains explicitly excluded; do not quietly change it through shared root variables.
- [ ] Preserve a reversible activation switch until production scope and regressions are verified. No commit, push or deployment is implied by this planning request.

## Completion criteria for the first increment

A user can review the existing Requests interface with sourced Linear visual values, functioning Arc controls and all relevant states. Both themes have independent evidence; geometry has component-specific provenance; no unintended palette fallback, clipping, missing stroke, persistent deselection fill, selection notch or lost keyboard focus remains. Source mapping and local verification are recorded. Marketing, Request detail and production appearance remain outside the increment.
