# What makes dark mode show wrong colours today

Research for issue #82 (map #79). Planning only: no app code was changed.
Researched 2026-10-21 against commit `7a42cf7`.

## Short answer

Lane's main token chain is **not** the cause. In dark mode, every Arc and Lane colour role resolves
to the Supabase dark values (measured below). The wrong colours come from places outside that chain:

1. **Clerk sign-in and sign-up**: the "Sign up" / "Sign in" link is dark green on a near-black page,
   about 2.5:1 contrast (measured). Some Clerk colours are never mapped, so Clerk uses its own fixed values.
2. **The last-resort error page** (`global-error.tsx`) is always light, because next-themes is not on it.
3. **Hard-wired palette steps** (avatar tones, purple label dot, Project dots). These are dark-aware
   today only because the Supabase palette has a dark half. A tweakcn file has no palette.
4. **Small leftovers**: `data-theme` overrides inside CSS modules, the install colour in the manifest
   and the favicon that follow the device rather than Lane's setting.

The biggest risk for the plan: **a pasted tweakcn file would lose to Arc in dark mode**. tweakcn writes
dark values under `.dark`. Arc's `foundation.css` writes its own under `:root[data-theme="dark"]`, which is
a stronger selector. In a test page, Arc's grey dark values won even when the tweakcn block loaded last.
Unless the plan deals with this, Stage A would make dark mode wrong everywhere.

## How it was checked

- Read the token files and every `*.module.css`, `.ts` and `.tsx` under `src/` for colour literals,
  `color-mix`, `var(--x, fallback)`, `data-theme` / `.dark` selectors, `getComputedStyle` and inline colours.
- **Cascade harness**: loaded `foundation.css`, `supabase-tokens.css` and `lane-arc-theme.css` in
  production order into headless Chromium (Playwright). Then read the computed tokens in light, in dark,
  in dark with `data-accent`, and in dark without `data-visual-system`.
- **Live app**: the dev server on `localhost:3000` (main checkout), opened with `colorScheme: 'dark'` on
  `/login`, `/signup`, `/reset-password`, `/privacy` and a 404. The script flagged any element with a
  light background or dark text. Screens behind sign-in were not reachable without credentials.
- **tweakcn conflict test**: Arc `foundation.css`, followed by a tweakcn-shaped `:root {}` / `.dark {}` block,
  with `class="dark" data-theme="dark"` on `<html>`.
- Clerk defaults read from the installed bundle: `node_modules/@clerk/ui/dist/ui-common_ui_bca8a5_1.33.1.js`
  (`@clerk/ui` 1.33.1, `@clerk/nextjs` 7.9.4). tweakcn's Supabase preset read from
  `jnsahaj/tweakcn` `utils/theme-presets.ts` (main), key `supabase`.

## What is fine today (ruled out, with evidence)

| Suspected cause | Finding |
|---|---|
| `.dark` vs `data-theme` keying | next-themes sets both (`src/app/layout.tsx:90`). Every token file keys on `data-theme`. The `@custom-variant dark (&:is(.dark *))` in `src/app/globals.css:4` is unused. There is no mismatch. |
| Arc's own dark values leaking | `src/styles/lane-arc-theme.css` uses `:root[data-visual-system="lane"]` (specificity 0,2,0). It is imported after `foundation.css` (`layout.tsx:10-15`), so it beats Arc's `:root[data-theme="dark"]` (0,2,0, `foundation.css:83`). Harness: `--background`, `--surface`, `--border`, `--accent`, `--control-*`, `--success`, `--series-1` and the floating `--border` all show Supabase dark values. |
| Light-only Supabase tokens | Only `--sb-chart-*-fill`, `--sb-chart-in/out*`, `--sb-chart-reference` and `--sb-chart-status-*` have no dark entry (`supabase-tokens.css:318-338`). They are `var()` references to dark-aware palette steps, and nothing in `src/` reads them. |
| `color-mix` against fixed colours | Outside the token files there are only two, both on theme tokens: `lane-arc-theme.css:359,361`. Arc's own `color-mix` fallbacks (`foundation.css:191`, `206-208`) are overridden by Lane values. |
| `var(--x, literal)` fallbacks | Every fallback in `src/**/*.css` points at another token. There is no light literal. |
| `#000` / `black` in Arc masks | `segmented-control.module.css:4`, `workspace-shell.module.css:17`: these are `mask-image` alpha gradients, not paint, so they don't depend on the theme. |
| Local token redefinitions in modules | `request-rows.module.css:143` and `data-table-toolbar.module.css:36,52,66` redefine **sizes** only (`--control-height-*`, `--text-sm`), not colours. They matter for Stage B consistency, not for dark mode. |
| `[data-ui-surface="floating"]` overrides | `lane-arc-theme.css:276-282` points at `--sb-*-overlay` tokens that have dark values. Harness, dark floating `--border` = `oklch(0.95 … / 0.134)`. |
| Theme flash on load | The next-themes script is the first child of `<body>`, before any content (verified in the `/login` HTML). `data-theme="dark"` was already present at `readyState=interactive` on all five pages. `suppressHydrationWarning` is on `<html>` (`layout.tsx:63`). |
| `not-found.tsx`, `error.tsx`, `(auth)/error.tsx` | These render inside the root layout, so they get the theme. A 404 rendered dark in the live check. |
| Storybook | Removed in `58b1dcb` (#70). There is no `.storybook/` and nothing Storybook-only remains. A stale Storybook server was still running on `:6007` but is not in the repo. |
| JS reading colours | No `getComputedStyle` call reads a colour. There are no inline colour styles or hex/rgb values in `.ts`/`.tsx`. |

## Concrete causes

### C1. Clerk links use the button colour, which is too dark to read on a dark page

- `src/components/auth/clerk-appearance.ts:6` sets `colorPrimary: "var(--primary-background)"`. Clerk uses
  `colorPrimary` for the solid button **and** for link text.
- Live `/login` and `/signup` in dark: `a.cl-footerActionLink` ("Sign up" / "Sign in") computes to
  `lab(36 -36 16)` on a body of `lab(6.2 …)`. That is about **2.5:1**, below the 4.5:1 that body-size text needs.
  Lane's own links use `--accent`, `oklch(0.76 0.15 157.5)` in dark, which is readable.
- **tweakcn alone does not fix it.** tweakcn's Supabase dark `primary` is `#006239`, also about 2.5:1 on its
  `#121212` background. Mapping `colorPrimary` to `--primary` keeps the problem.
- **Plan fix**: in `clerk-appearance.ts`, give Clerk link elements (`footerActionLink`, `formResendCodeLink`,
  `identityPreviewEditButton` and similar) an ink colour token. Lane's ink colour is the readable green it
  uses for its own links. Keep `colorPrimary` for the button fill. The readability warning from #79 should
  include this pair.

### C2. Clerk colours Lane never maps fall back to Clerk's fixed values

- Lane sets 14 Clerk variables (`clerk-appearance.ts:5-20`) but not `colorSuccess`, `colorWarning`,
  `colorShimmer`, `colorModalBackdrop` or `colorShadow`. In the installed bundle their defaults are
  `#22C543`, `#F36B16`, `rgba(255,255,255,0.36)`, `#000000` at 0.27 and black. None of them changes with
  the theme. (Clerk's light/dark defaults go through `light-dark()`, which follows `color-scheme`. These
  five do not.)
- Effect: Clerk's success and warning states and its modal backdrop don't match Lane's in dark mode.
  The dark backdrop is black, while Lane's is `--overlay-backdrop`, the page colour at 80%. The backdrop
  mismatch also exists in light mode.
- When a browser can't mix colours, Clerk drops every `var(...)` value and uses its own defaults
  (bundle warning: "Using CSS variables is not supported in this browser"). This affects old browsers only.
- **tweakcn alone does not fix it.** **Plan fix**: map all Clerk colour variables to theme-file names,
  including success and warning from the Lane additions and the overlay for the backdrop. The automatic
  check should fail if a Clerk colour key is left unmapped.

### C3. The last-resort error page is always light

- `src/app/global-error.tsx:36` renders its own `<html>` with `data-visual-system="lane"` but no
  `ThemeProvider`. So the next-themes script never runs and `<html>` never gets `data-theme` or `.dark`.
  Every token resolves to the light block, and `color-scheme` stays `light` (`foundation.css:2`), so
  scrollbars and controls are light as well.
- It shows only in production, when the root layout itself crashes.
- **tweakcn alone does not fix it.** The file would still key on `.dark`, which nothing sets here.
  **Plan fix** (pick one): add a tiny blocking inline script to `global-error.tsx`. It reads next-themes'
  `localStorage["theme"]` (default `storageKey`), falls back to `matchMedia('(prefers-color-scheme: dark)')`,
  and sets `class="dark"`. Or, cheaper but less exact, add an `@media (prefers-color-scheme: dark)` copy of
  the `.dark` values scoped to the error page. The script keeps the person's saved choice.

### C4. The tweakcn file would lose to Arc's own dark values (blocks Stage A)

- `foundation.css:83` `:root[data-theme="dark"]` (0,2,0), plus `:root[data-theme="dark"][data-accent=…]`
  (0,3,0, `foundation.css:131-138`, `150-157`), plus the `@supports` series block (`foundation.css:172`).
  tweakcn exports `.dark { … }` (0,1,0).
- Test (Arc first, tweakcn block second, `class="dark" data-theme="dark"`): `--background` = Arc's
  `oklch(19% 0 0)`, `--border` = Arc's `oklch(29% 0 0)`, `--accent` = Arc's `oklch(80.57% 0.1427 163.64)`.
  The tweakcn dark values were ignored. Light mode worked, because `:root` vs `:root` is decided by order.
- Today `lane-arc-theme.css` avoids this with a stronger selector. A pasted tweakcn file cannot,
  because its selectors are fixed.
- **Plan fix** (required): keep tweakcn's text exactly as pasted, and stop Arc's foundation values from
  competing. Either (a) adapt `foundation.css` under the Arc source lock to remove or neutralise its
  `:root[data-theme="dark"]`, `[data-accent]` and series dark blocks, or (b) load `foundation.css` inside a
  lower cascade `@layer` than the theme file. Layering beats specificity, so the unlayered theme file
  always wins, and the Arc file text is unchanged. Option (b) also covers Arc's light `:root` block. In
  both cases, add a check that computes tokens in dark mode and compares them with the theme file.
- Related name clash: shadcn's `--accent` is a neutral hover surface (tweakcn Supabase dark: `#313131`).
  Arc's `--accent` is the brand ink, used for selected icons, the resize handle, focus outlines and
  `--series-1`. Arc must read a different name, or tweakcn's `--accent` will turn Arc's brand marks grey
  in both modes. The same check applies to `--border`, `--background`, `--foreground` and `--destructive`
  (those meanings match) and to `--radius` (different shape). This is mapping work for #81, but it shows
  up as wrong colours if it is missed.

### C5. Palette steps read directly, outside the role tokens

- `src/components/requests/request-picker-avatar.module.css:17-22` (`--sb-color-{blue,green,purple,yellow,orange,red}-300`),
  `src/components/requests/request-labels.module.css:8` (`--sb-color-purple-900`), and the Project colours
  `--project-*` → `--sb-color-*-900` (`lane-arc-theme.css:129-134`).
- These work in dark today only because `supabase-tokens.css:341` redefines the whole Radix palette. A
  tweakcn export has no palette, so once `supabase-tokens.css` goes these become light-only or empty.
  (Project dot hues are the same in both modes by Radix design. Measured `--project-blue` =
  `hsl(206 100% 50%)` in both.)
- **Plan fix**: the Lane additions section must hold avatar tones, label colours, Project colours,
  success and warning, **in both `:root` and `.dark`**. The automatic check should fail if any Lane
  additions colour has no `.dark` counterpart. Side note: the `slate` avatar tone uses `red-300`
  (`request-picker-avatar.module.css:22`). That looks like a slip worth fixing in Stage B.

### C6. `data-theme` overrides inside CSS modules (currently harmless)

- `workspace-sidebar.module.css:4,5,198,205`, `floating-button-group.module.css:23-29`,
  `user-menu.module.css:84`, `workspace-shell.module.css:13`. These are Arc-era dark overrides that now
  reassign the same tokens, so they have no effect. The exception is `user-menu.module.css:84`, which
  removes the theme-switch thumb's shadow in dark. They only work because next-themes also writes
  `data-theme`.
- **The switch alone removes them only if next-themes keeps `attribute={["class","data-theme"]}`.** If the
  plan drops `data-theme`, `user-menu.module.css:84` stops applying, and `workspace-shell.module.css:13`
  (`:not([data-theme="dark"])`) matches in dark too. In practice nothing would change visibly, because the
  values are the same. **Plan fix**: delete these redundant blocks, or rewrite them to `.dark`, and make the
  automatic check reject theme selectors outside the theme file.

### C7. Things that follow the device instead of Lane's setting (minor)

- `src/app/manifest.webmanifest:7-8`: `background_color` / `theme_color` `#131413` (always dark), even in
  light mode. There is no `themeColor` in the layout's `viewport` export.
- `src/app/icon.svg`: switches its fill with `@media (prefers-color-scheme: dark)`, which follows the
  operating system, not Lane's Profile choice. Browsers draw tab chrome by the operating system theme, so
  this is probably correct as is.
- **tweakcn does not touch either.** These are generated from tokens by `scripts/brand/brand-assets.mjs`,
  so the plan should point that script at the new theme file. No dark-mode fix is needed beyond that.

## Summary for the plan

| # | Cause | Removed by the tweakcn file alone? |
|---|---|---|
| C1 | Clerk link text uses the dark button green (about 2.5:1) | No: give Clerk link elements an ink token |
| C2 | Unmapped Clerk colours (success, warning, backdrop, shimmer, shadow) | No: map every Clerk colour key, and check for it |
| C3 | `global-error.tsx` has no theme script, so it is always light | No: add an inline theme script (or a media-query fallback) |
| C4 | Arc `:root[data-theme="dark"]` beats tweakcn's `.dark`; `--accent` means different things | No: put Arc foundation in a lower `@layer` (or adapt it), rename Arc's accent hook, add a dark computed-token check |
| C5 | Palette steps read directly (avatars, labels, Projects) | No: Lane additions need `.dark` values, and the check must enforce them |
| C6 | Redundant `data-theme` overrides in modules | Partly: harmless if next-themes keeps both attributes; delete them anyway |
| C7 | Manifest colour and favicon follow the device | Not applicable: repoint the brand-asset script |

What the switch fixes by itself: once Lane's look lives in one file, the four-file chain disappears.
That removes the kind of bug where one layer has a dark value and the next doesn't. No such bug exists
today, but the current chain only stays correct because `lane-arc-theme.css` keeps up with every Arc dark key.

## Limits

- Screens behind sign-in (Requests, Settings, Clerk profile modals) were not rendered live. For those,
  the findings come from reading the CSS plus the cascade harness. A logged-in dark-mode sweep with the
  same script (`body *` scanned for light backgrounds and dark text) would confirm that nothing else shows up.
- The live server was the main checkout. Its branch was not checked, but its CSS matched the `7a42cf7`
  behaviour seen in the harness.
