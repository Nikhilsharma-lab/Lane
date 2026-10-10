# Geist Colours Implementation Plan

**Status:** Preview implemented after Nikhil's 2026-10-08 approval; production remains Arc Green. No app-wide rollout is authorized. Earlier local verification is recorded in `DESIGN-NOTES.md`. The latest visible-border and deselection fixes reproduced two failing browser regressions before implementation; final local verification passes 12/12 focused browser stories at 1440px light and 390px dark, plus TypeScript, lint, Arc source and diff checks.

**Goal:** Give Lane clearer contrast and consistent light/dark colours using Vercel Geist, beginning with a reviewable Requests and sidebar preview.

**Architecture:** Keep Arc components, typography, geometry and motion. Introduce one Geist colour adapter which supplies the semantic variables those components consume. Enable it only for dedicated Storybook review stories first; document-root scoping must include portalled menus and tooltips.

**Tech Stack:** Existing Next.js 16, React 19, CSS custom properties, Arc components, next-themes, Storybook and Vitest browser tests. No new UI package is needed.

## Global constraints

- Approval covers the isolated preview increment; app-wide rollout remains outside this approval.
- Requests list, sidebar and their existing controls are the first review surface.
- Marketing and Request detail are outside this increment. Changing production root variables would affect Request detail, so do not enable the adapter in `src/app/layout.tsx` during the preview increment.
- Preserve `--radius-control: 12px`, shadow-free surfaces, row density, connected selection edges, equal pill/avatar height, sidebar resize/peek and existing interactions.
- Preserve keyboard focus, accessible names, theme persistence, responsive behavior and reduced motion.
- No new routes, tables, AI calls, lifecycle rules or product features. Preserve unrelated work in the dirty checkout; do not commit, push or deploy as part of this plan.

## Colour decisions

Source: [Vercel Geist Colors](https://vercel.com/geist/colors), read and inspected in both rendered themes on 2026-10-08. Geist assigns steps 1–3 to component backgrounds, 4–6 to borders, 7–8 to strong backgrounds, and 9–10 to text/icons. The assignments below are Lane's proposed mapping of those source tokens.

| Role | Geist source | Intended appearance/use |
| --- | --- | --- |
| Workspace canvas and sidebar | `--ds-background-200` | Light: `#fafafa`; dark: `#000000` |
| Main pane and popover surface | `--ds-background-100` | Light: `#ffffff`; dark: approximately `#0a0a0a` |
| Main text and icons | `--ds-gray-1000` | Light: approximately `#171717`; dark: `#ededed` |
| Secondary text | `--ds-gray-900` | Light: approximately `#4d4d4d`; dark: `#a1a1a1` |
| Neutral component default / hover / pressed | `--ds-gray-100 / 200 / 300` | Explicit state fills, rather than opacity mixtures |
| Decorative surface borders | `--ds-gray-400` | Quiet separation; no row rules added |
| Required control boundaries | Light `--ds-gray-700`; dark `--ds-gray-600` | Verified unchecked-checkbox boundary; light Gray 600 was only 2.38:1 |
| Primary actions | `--ds-gray-1000` fill and `--ds-background-100` text | Near-black in light mode, near-white in dark mode |
| Links and blue text/icons | `--ds-blue-900` | Theme-specific readable blue |
| All persistent selections | Blue 300 background / Blue 900 content in both themes, using each theme's native ramp | Selected pills and avatars share the row pair; hover/focus/press preserve it |
| Selected Request pill/avatar boundaries | `--selection-property-border`: Blue 700 light / Blue 600 dark | 1px stroke; focused/open metadata uses Blue 900. Previous Gray 400 measured only 1.026:1 on selected blue |
| Checked boxes | `--ds-blue-700`, white check | Verify the check and control against selected and unselected rows |
| Open / In Progress / Done | Gray / blue / green | Keep text and icons alongside colour |
| Attention / failure | Amber / red | Separate text, fill and border tokens from each colour's ramp |

Use native light and dark ramps, including sRGB fallbacks and supported wide-gamut values. Do not generate dark mode by inverting light values. Surface differentiation remains restrained; high contrast primarily comes from readable text, meaningful controls and clear state changes.

Project colours remain categorical, not progress signals. Keep the current stable Project-to-tone assignment and map blue/green/violet/amber/coral/slate to Geist blue/green/purple/amber/red/gray respectively. Project names remain the primary identifiers.

## Repository findings

- `src/components/arc/foundation.css` currently defines Arc neutrals and accent presets. `src/app/globals.css` aliases primary, brand, highlight and info to the accent; these roles need separation. The actual Arc primary Button already uses a neutral foreground/background pair.
- Both `.storybook/preview.tsx` and `src/app/layout.tsx` currently select `data-accent="green"`. Its selector specificity must not silently override the Geist preview.
- `src/components/shell/workspace-shell.module.css` contains a light-only surface workaround. Explicit workspace-canvas and content-surface roles should replace that workaround for the preview.
- Requests rows, badges and menu controls use several `color-mix` hover/focus values. Updating base swatches alone will not produce consistent state colours.
- `src/components/projects/project-dot.module.css` owns twelve local light/dark colour values. Route those through the same adapter instead of adding another palette.
- Arc source adaptations are recorded in `docs/design-system/arc-sources.md` and `arc-source-hashes.json`; preserve upstream hashes and update only documented local adaptations.

## Task 1: Build the isolated colour preview

**Files:**
- Create `src/styles/geist-colors.css`: sourced ramps and the scoped semantic adapter.
- Create `src/stories/geist-colours.stories.tsx`: Requests/shell and control-state review stories using existing production components and fixtures.
- Modify `.storybook/preview.tsx`: a `parameters.colorSystem = "geist"` opt-in, with mounted decorator root setup/cleanup so hot reload cannot remove the visible palette.
- Read/reuse `src/stories/requests.stories.tsx`, `request-selection.stories.tsx`, `navigation.stories.tsx` and `utility-colours.stories.tsx`.

**Interface:** Only `:root[data-color-system="geist"]` supplies the new values. Existing `data-theme` controls the light/dark ramp. Stories without this parameter retain their current colours. Set and restore root attributes so portals inherit the correct colours and story navigation cannot leak a theme.

- [x] Capture the official light/dark gray, blue, green, amber, red and purple ramps with their source/date in the new stylesheet. Preserve supplied fallback/wide-gamut behavior.
- [x] Add semantic aliases for canvas, surfaces, text, neutral interactions, selection, links, controls and status. Keep source values in one place. A starting contract is:

```css
:root[data-color-system="geist"] {
  --workspace-canvas: var(--ds-background-200);
  --background: var(--ds-background-200);
  --surface: var(--ds-background-100);
  --surface-raised: var(--ds-background-100);
  --surface-muted: var(--ds-gray-100);
  --foreground: var(--ds-gray-1000);
  --text-secondary: var(--ds-gray-900);
  --text-muted: var(--ds-gray-900);
  --border: var(--ds-gray-400);
  --border-strong: var(--ds-gray-700); /* Dark mode uses Gray 600. */
  --interaction-hover: var(--ds-gray-200);
  --interaction-pressed: var(--ds-gray-300);
  --selection-background: var(--ds-blue-300);
  --selection-hover: var(--selection-background);
  --selection-pressed: var(--selection-background);
  --selection-foreground: var(--ds-blue-900);
  --selection-icon: var(--selection-foreground);
  --selection-property-border: var(--ds-blue-700); /* Dark mode uses Blue 600. */
  --link-foreground: var(--ds-blue-900);
  --primary: var(--ds-gray-1000);
  --primary-foreground: var(--ds-background-100);
  --accent: var(--ds-blue-900);
  --accent-subtle: var(--ds-blue-100);
  --control-on: var(--ds-blue-700);
  --control-glyph: #fff;
}
```

- [x] Import the adapter in Storybook only, after existing foundation/global styles. For opted-in stories remove `data-accent="green"` and set `data-color-system="geist"`; restore both previous attribute values on cleanup. Do not change production layout or its stylesheet imports.
- [x] Preview the populated list, contiguous selection, sidebar account/workspace menu, filter/display menus and global search. Add a small state specimen for links, buttons, badges, checkboxes, disabled and error states.
- [x] Verify an open portalled menu receives the Geist palette. Then navigate to an existing Arc story and verify the preview leaves no root colour attributes behind.

**Deliverable:** A working Requests/shell preview in both modes, isolated from the app and existing stories.

## Task 2: Make interaction colours consistent and verify the preview

**Files:**
- Modify colour consumption in `src/components/shell/workspace-shell.module.css`, `workspace-search-pane.module.css`, `src/components/requests/request-rows.module.css` and `src/components/projects/project-dot.module.css`.
- Inspect and adapt colour consumption, where required, in Arc `button/button.module.css`, `badge/badge.module.css`, `checkbox/checkbox.module.css`, `blocks/workspace-sidebar/workspace-sidebar.module.css`, `user-menu/user-menu.module.css`, `filter-toolbar/filter-toolbar.module.css` and `floating-button-group/floating-button-group.module.css` under `src/components/arc/`.
- Extend `src/stories/geist-colours.stories.tsx`; reuse contrast measurement from `src/stories/utility-colours.stories.tsx`.
- Document any changed Arc source files in `docs/design-system/arc-sources.md` and update their `localSha256` in `arc-source-hashes.json`.

- [x] Consume new roles with exact current-value fallbacks, so shared component edits preserve production rendering before rollout. For example, selected rows use `var(--selection-background, var(--accent-subtle))`; unselected hover uses `var(--interaction-hover, color-mix(in oklab, var(--foreground) 6%, var(--surface)))`.
- [x] Give selected hover/pressed/focus their own explicit values and precedence. Preserve adjoining-row radius rules. Keep the checkbox hit area transparent.
- [x] Use gray fills for unselected navigation/menu hover; Blue 300 background / Blue 900 content for persistent selections in both native theme ramps, with separate blue roles for links and the existing resize line. Retain the resize line's existing fade geometry.
- [x] Give semantic badges/alerts separate readable text, background and border roles. Check them on selected rows as well as ordinary surfaces. Keep neutral primary buttons neutral in every state.
- [x] Check normal, hover, pressed, focused, selected, disabled, loading and error states in both modes. Check actual rendered contrast, including any remaining translucent layers: at least 4.5:1 for enabled body/pill text and 3:1 for meaningful control/icon boundaries. Decorative pane borders need not meet a control-boundary threshold. Aim for at least 7:1 for main text.
- [x] Verify 390/768/1024/1440 widths, long names, clipping, picker/pill alignment, keyboard focus/return, sidebar peek and reduced motion. Preserve existing focus-fill behavior; any failure must be repaired within the preview rather than hidden by disabling accessibility checks.
- [x] Run the focused checks below. Use screenshot inspection for visual states; passing token checks alone is insufficient.

```sh
pnpm typecheck
pnpm lint
pnpm design:check
STORYBOOK_THEME=light pnpm test:storybook src/stories/geist-colours.stories.tsx src/stories/request-selection.stories.tsx src/stories/sidebar-peek.stories.tsx src/stories/requests.stories.tsx src/stories/navigation.stories.tsx
STORYBOOK_THEME=dark pnpm test:storybook src/stories/geist-colours.stories.tsx src/stories/request-selection.stories.tsx src/stories/sidebar-peek.stories.tsx src/stories/requests.stories.tsx src/stories/navigation.stories.tsx
pnpm build:storybook
pnpm build
git diff --check
```

- [x] Open the completed light/dark previews and capture the same selected-list/menu states in each. Report measured contrast and any remaining failure plainly.

**Deliverable:** A reviewed colour system in the existing Requests architecture, with live visual evidence and passing relevant checks.

## Later rollout boundary

The first implementation stops at the preview above. Enabling Geist in the production document root affects Intake, Settings, authentication/Clerk and Request detail. Nikhil has explicitly excluded Request detail from this session, so a global enablement is not part of this increment.

After the preview is accepted and the rollout scope is explicitly reopened, apply the same adapter to that approved scope, remove the green selector from the enabled root, and verify the affected screens. Update `DESIGN.md`, `DESIGN-NOTES.md`, `src/components/AGENTS.md` and any conflicting design-authority text so they state: Geist owns colour; Arc owns the existing component foundation and motion. Keep marketing isolated. Preserve the upstream Arc source record; retire competing active app colour overrides rather than deleting unrelated library behavior.

## Completion criteria for the first increment

- Light sidebar/canvas and content pane have distinct roles; dark mode uses the corresponding Geist backgrounds.
- Blue selection, links and controls are coherent; success, attention and failure remain distinct and labelled.
- Popovers, account menu, global search and the selection bar use the same palette without inherited green or pink remnants.
- No clipping, new shadows, geometry changes, lost focus feedback or broken interactions.
- Existing production/Arc stories retain their appearance until rollout is authorized.
- Both theme previews are visible and test results are reported as local verification only.

## Selected-state refinement — 2026-10-08

All persistent selections use Blue 300 background with Blue 900 content from each theme's native ramp. Selected Request pills and avatars use a 1px Blue 700 light / Blue 600 dark border; focused/open metadata retains the Blue 900 border cue. The former Gray 400 stroke measured only 1.026:1 on selected blue. Unselected row focus now uses `:has(.title:focus-visible, .propertyTrigger:focus-visible)` so checkbox focus cannot leave a grey row after deselection and pointer exit. Both defects were reproduced by failing browser regressions; final local verification passes 12/12 focused browser stories at 1440px light and 390px dark, plus TypeScript, lint, Arc source and diff checks. The 8px heading gap, connected selected rows and preview-only scope remain. Exact source values are recorded in [the source audit](../../design-system/geist-colours.md); checkmarks above refer to prior verified implementation.
