# What a tweakcn export contains, compared with Lane's current look

Research for [#81](https://github.com/Nikhilsharma-lab/Lane/issues/81) (map [#79](https://github.com/Nikhilsharma-lab/Lane/issues/79)). Written 2026-10-21. Planning only: no app code changed.

## Sources

- tweakcn, `jnsahaj/tweakcn` at commit [`a3b47b37cba97dd637de517aab52c45ec0f83456`](https://github.com/jnsahaj/tweakcn/tree/a3b47b37cba97dd637de517aab52c45ec0f83456) (2026-09-03, the `main` HEAD on 2026-10-21). Files used:
  - [`utils/theme-style-generator.ts`](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/utils/theme-style-generator.ts): writes the exported CSS.
  - [`utils/shadows.ts`](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/utils/shadows.ts): turns the shadow inputs into the eight `--shadow-*` values.
  - [`utils/color-converter.ts`](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/utils/color-converter.ts): colour formats.
  - [`config/theme.ts`](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/config/theme.ts): defaults, and `COMMON_STYLES` (values shared by light and dark).
  - [`utils/theme-preset-helper.ts`](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/utils/theme-preset-helper.ts): how a preset is filled out from the defaults.
  - [`utils/theme-presets.ts` L1751-1835](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/utils/theme-presets.ts#L1751-L1835): the **Supabase** preset.
  - [`store/preferences-store.ts`](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/store/preferences-store.ts): export defaults (Tailwind `4`, colour format `oklch`).
  - [`utils/parse-css-input.ts`](https://github.com/jnsahaj/tweakcn/blob/a3b47b37cba97dd637de517aab52c45ec0f83456/utils/parse-css-input.ts): what "Import" reads back.
- The export in the appendix was produced by running tweakcn's own `generateThemeCode` (unmodified source, copied out of the pinned commit) on the Supabase preset merged exactly as `mergePresetWithDefaults` does, with Tailwind v4 and oklch. It is byte-for-byte what the Code panel shows.
- Lane at `7a42cf7`: `src/styles/supabase-tokens.css`, `src/styles/lane-arc-theme.css`, `src/app/globals.css`, `src/app/layout.tsx`, `src/lib/fonts.ts`.
- "Visible?" uses the OKLab distance between the two colours as painted (see-through Lane colours flattened onto Lane's page background first): under 0.005 = no, 0.005-0.02 = only side by side, 0.02 or more = yes. 0.02 is roughly one just-noticeable step.

## 1. What a tweakcn Tailwind v4 export contains

Default settings: Tailwind v4, colours in `oklch`. Other choices are `hex`, `rgb`, `hsl`. One CSS file, in this order:

1. `@import "tailwindcss";` and `@custom-variant dark (&:is(.dark *));`
2. **`:root { ... }`** (light) and **`.dark { ... }`** (dark), each with:
   - **32 colours**: `--background --foreground --card --card-foreground --popover --popover-foreground --primary --primary-foreground --secondary --secondary-foreground --muted --muted-foreground --accent --accent-foreground --destructive --destructive-foreground --border --input --ring --chart-1..5 --sidebar --sidebar-foreground --sidebar-primary --sidebar-primary-foreground --sidebar-accent --sidebar-accent-foreground --sidebar-border --sidebar-ring`.
   - **Fonts**: `--font-sans --font-serif --font-mono`, written as plain font-family lists (e.g. `Outfit, sans-serif`).
   - **`--radius`**: one value.
   - **Raw shadow inputs**: `--shadow-x --shadow-y --shadow-blur --shadow-spread --shadow-opacity --shadow-color`. These are for reference only. The finished shadows below are already computed, so nothing reads these.
   - **Eight finished shadows**: `--shadow-2xs --shadow-xs --shadow-sm --shadow --shadow-md --shadow-lg --shadow-xl --shadow-2xl`.
   - Light block only: **`--tracking-normal`** (the letter-spacing input) and **`--spacing`** (default `0.25rem`).
3. **`@theme inline { ... }`**: `--color-*` for all 32 colours; `--font-sans/mono/serif`; `--radius-sm` = radius − 4px, `--radius-md` = radius − 2px, `--radius-lg` = radius, `--radius-xl` = radius + 4px; the eight `--shadow-*`. If letter-spacing is not `0em`, it also writes `--tracking-tighter/tight/normal/wide/wider/widest` as ±0.025/0.05/0.1em around `--tracking-normal`.
4. `@layer base`: `* { @apply border-border outline-ring/50; }` and `body { @apply bg-background text-foreground; }`, plus `letter-spacing: var(--tracking-normal)` on body when letter-spacing is not `0em`.

How the values are made:

- **Shared between modes.** Fonts, radius, shadow opacity/blur/spread/offsets, letter-spacing and spacing are set once and copied into dark (`COMMON_STYLES`). Only colours and `shadow-color` can differ in dark.
- **Shadows** come from one set of inputs (`utils/shadows.ts`). `2xs`/`xs` = the base shadow at half the opacity. `2xl` = 2.5× opacity. `sm`/`shadow`/`md`/`lg`/`xl` = the base shadow plus a second layer with fixed y/blur of 1/2, 1/2, 2/4, 4/6 and 8/10 px and spread one pixel less. The colour is written as `hsl(... / opacity)`, whatever colour format you pick.
- **No transparency survives.** The `oklch`, `hsl` and `hex` formatters drop alpha, and Import converts every colour to hex. Only the `rgb` format keeps alpha (`rgba(...)`).
- **Import does not round-trip everything.** Import (`parse-css-input.ts`) reads only `:root` and `.dark`, and only tweakcn's internal names. The export writes `--shadow-x`, `--shadow-y` and `--tracking-normal`, but Import looks for `--shadow-offset-x`, `--shadow-offset-y` and `--letter-spacing`. So re-importing an export loses shadow offsets and letter-spacing.
- **Dark is a `.dark` class.** Lane already sets it: `ThemeProvider` in `src/app/layout.tsx` uses `attribute={["class", "data-theme"]}`, so `<html>` gets both `class="dark"` and `data-theme="dark"`. `globals.css` already declares the same `@custom-variant dark`.

## 2. What the tweakcn "Supabase" preset is

The preset is dated 2025-04-27. It is **not** the Supabase Studio token set Lane copied (supabase/supabase at `64a6aa9`). It is an older, hand-picked hex palette:

- light primary is bright mint `#72e3ad` with dark text;
- the font is **Outfit**, mono is just `monospace`;
- `--radius: 0.5rem`;
- shadows are black at 0.17 opacity, 3px blur, 1px drop;
- letter-spacing is `0.025em`;
- every colour is opaque.

The complete export is in the appendix.

## 3. Side by side, role by role

Lane column: the colour Lane paints today, followed through `lane-arc-theme.css` → `supabase-tokens.css` (dark = `[data-theme="dark"]`).

### Light

| Role | Lane today (token → value) | tweakcn Supabase | Difference | Visible? |
|---|---|---|---|---|
| Page background | `--background` → `sb-dash-sidebar` → `oklch(0.995 0 0)` #fdfdfd | `--background` #fcfcfc | 0.004 | no |
| Sidebar | `--navigation-background` → same #fdfdfd | `--sidebar` #fcfcfc | 0.004 | no |
| Cards / panels | `--surface` → `sb-card` `oklch(1 0 0)` #ffffff | `--card` #fcfcfc | 0.009 | side by side only (Lane cards are pure white on an off-white page; tweakcn's match the page) |
| Popovers / menus | `--surface-raised` → `sb-overlay` → `sb-secondary` #ffffff | `--popover` #fcfcfc | 0.009 | side by side only |
| Dialogs | `--dialog-background` → page background #fdfdfd | `--popover` #fcfcfc | 0.004 | no |
| Main text | `sb-foreground` `oklch(0.1 0 0)` #030303 | `--foreground` #171717 | 0.105 | **yes** (tweakcn is softer) |
| Secondary text | `--text-secondary` (`text-muted-foreground`) → `sb-foreground-light` #464646 | `--muted-foreground` #202020 | 0.151 | **yes** (tweakcn's "muted" text is nearly as dark as body text) |
| Popover text | `--floating-foreground` #464646 | `--popover-foreground` #525252 | 0.044 | **yes** |
| Faintest text | `--text-muted` → `sb-foreground-lighter` #696969 | no slot (closest is `--sidebar-foreground` #707070) | 0.025 | **yes** |
| Muted surface / row hover | `--surface-muted`, `--interaction-hover` → `sb-muted` = black 2.7% (≈ #f7f7f7) | `--muted` #ededed | 0.029 | **yes** |
| Selected / pressed wash | `--interaction-pressed` → `sb-accent` = black 4% (≈ #f3f3f3) | `--accent` #ededed | 0.019 | side by side only |
| Secondary button | `--button-secondary-background` → `sb-raised-control` #ffffff | `--secondary` #fdfdfd | 0.006 | side by side only |
| Border | `sb-border` = black 8.1% (≈ #e9e9e9) | `--border` #dfdfdf | 0.030 | **yes** (tweakcn lines are darker) |
| Input border | `--input-border` → `sb-border-control` = black 14.6% (≈ #d9d9d9) | `--input` #f6f6f6 | 0.089 | **yes** (tweakcn's input outline almost disappears) |
| Input fill | `sb-field` = black 1.5% | no slot | — | — |
| Primary button | `--primary-background` → `sb-primary-solid` `oklch(0.525 0.12 157.5)` #0e7e4e, white label #fafcfb | `--primary` #72e3ad, label #1e2723 | 0.310 / 0.728 | **yes, the biggest change**: deep green with white text becomes pale mint with near-black text |
| Brand-coloured text / links | `--accent` → `sb-primary` (= #0e7e4e) | only `--primary` (#72e3ad, too pale to read as text) | — | **yes** if mapped to `--primary` |
| Focus ring | 2px outline, 2px offset, `sb-ring` = `oklch(0.7 0.15 157.5)` at 55% (≈ #8dd8b4) | `--ring` #72e3ad; tweakcn's base layer uses `outline-ring/50` (≈ #b7f0d5); no width or offset | 0.087 | **yes** (paler) |
| Destructive button | `sb-destructive` `oklch(0.52 0.14 25)` #ab413e, label #fff9f8 | `--destructive` #ca3214, label #fffcfc | 0.066 | **yes** (tweakcn is a brighter orange-red) |
| Charts 1-4 | brand-800 #34b27b, blue-900 #0091ff, pink-1000 #d23197, violet-900 #6e56cf | #72e3ad, #3b82f6, #8b5cf6, #f59e0b | 0.04-0.40 | **yes**: series 3 and 4 change hue (pink→violet, violet→amber) |
| Radius | sm 5.33px, md **8px** (controls, menus, rows), lg 10.67px (cards, dialogs), xl 16px (content pane), plus xs, 2xl-4xl, item 6px, panel 6px, full, and per-size button radii | `--radius` 0.5rem → sm 4px, md 6px, lg 8px, xl 12px; no xs or 2xl+ | 2-4px tighter | **yes** (controls 8→6px, cards 10.67→8px, content pane 16→12px) |
| Card / tab shadow | `--shadow-resting` → `0 1px 2px 0 rgb(0 0 0/.05)` | `--shadow-xs` `0 1px 3px 0 hsl(0 0% 0%/.09)` | — | side by side only (slightly darker) |
| Popover / menu / dialog shadow | `--shadow-raised` (shadow-md) `0 4px 6px -1px /.1, 0 2px 4px -2px /.1` | `--shadow-md` `0 1px 3px /.17, 0 2px 4px -1px /.17` | — | **yes** (tweakcn: tighter and darker; Lane: softer and deeper) |
| Dropdown / sheet shadow | `--shadow-floating` (shadow-lg) `0 10px 15px -3px /.1, 0 4px 6px -4px /.1` | `--shadow-lg` `0 1px 3px /.17, 0 4px 6px -1px /.17` | — | **yes** |
| Font | Geist (next/font `--font-geist`), mono Geist Mono | Outfit, mono `monospace` | — | **yes** (until Nikhil sets Geist in tweakcn, as #79 plans) |
| Letter-spacing | body 0em, headings −0.025em | body 0.025em; `tracking-tight` becomes 0em | — | **yes** (looser text, flat headings). Setting letter-spacing to 0em in tweakcn removes these lines and matches Lane. |
| Spacing unit | 0.25rem | 0.25rem | none | no |

### Dark

| Role | Lane today | tweakcn Supabase | Difference | Visible? |
|---|---|---|---|---|
| Page background / sidebar | `oklch(0.19 0.0025 157.5)` #131413 (a hint of green) | #121212 | 0.008 | side by side only |
| Cards / panels | `oklch(0.215 …)` #181a19 | `--card` #171717 | 0.011 | side by side only |
| Popovers / menus | `sb-secondary` `oklch(0.24 …)` #1e201f | `--popover` #242424 | 0.020 | **yes** (just) |
| Main text | `oklch(0.95 …)` #edefee | `--foreground` #e2e8f0 (blue-grey) | 0.025 | **yes** |
| Secondary text | `sb-foreground-light` #bcbdbc | `--muted-foreground` #a2a2a2 | 0.086 | **yes** (tweakcn dimmer) |
| Popover text | #bcbdbc | `--popover-foreground` #a9a9a9 | 0.063 | **yes** |
| Faintest text | `sb-foreground-lighter` #989a99 | no slot (`--sidebar-foreground` #898989) | 0.054 | **yes** |
| Muted surface / row hover | white 3.3% (≈ #1a1b1a) | `--muted` #1f1f1f | 0.018 | side by side only |
| Selected / pressed wash | white 4.9% (≈ #1e1f1e) | `--accent` #313131 | 0.076 | **yes** (tweakcn's selection is much lighter) |
| Secondary button | `sb-raised-control` = `sb-muted` (≈ #1a1b1a) | `--secondary` #242424 | 0.039 | **yes** |
| Border | white 7.5% (≈ #232524) | `--border` #292929 | 0.020 | **yes** (just) |
| Input border | white 13.5% (≈ #303231) | `--input` #242424 | 0.054 | **yes** |
| Primary button | `sb-primary-solid` `oklch(0.436 0.11 157.5)` #006338, label #edefee | `--primary` #006239, label #dde8e3 | 0.006 / 0.031 | fill: side by side only; label: **yes** (slightly) |
| Brand-coloured text / links | `--accent` → `sb-primary` `oklch(0.76 0.15 157.5)` (≈ #4acd8b) | no separate slot (`--primary` is the dark plate #006239) | — | **yes** if mapped to `--primary` |
| Focus ring | `oklch(0.76 0.15 157.5)` at 55% (≈ #317a55) | `--ring` #4ade80 at 50% (≈ #2e7849) | 0.017 | side by side only |
| Destructive button | `sb-destructive` `oklch(0.55 0.14 25)` #b54a46, label #fff9f8 | `--destructive` #541c15, label #ede9e8 | 0.244 | **yes** (tweakcn's is a dark maroon plate) |
| Charts 1-4 | brand-900 #3fcf8e, blue-1100 #52a9ff, pink-1100 #f65cb6, violet-1100 #9e8cfc | #4ade80, #60a5fa, #a78bfa, #fbbf24 | 0.01-0.34 | **yes** for series 3 and 4 |
| Shadows | dialog uses shadow-xs in dark; button drop shadow 0.2 opacity (light 0.04) with white edge highlight | same shadows as light (only shadow colour can change per mode) | — | **yes** on dialogs and buttons |
| Radius, font, letter-spacing | as in light | as in light | — | as in light |

**Bottom line:** pasting the stock Supabase preset would **visibly change** Lane, most of all the light-mode primary button, text contrast, input outlines, corner rounding, shadows, the font and letter-spacing. "No visible change on day one" (#79 Stage A) needs a tweakcn theme seeded with Lane's own values, not the stock preset. Every tweakcn colour slot can hold Lane's flattened value to within one just-noticeable step, apart from the alpha and no-slot cases below.

## 4. Mismatches that matter for the mapping

- **Same name, different meaning.**
  - Lane's (and Arc's) `--accent` is the brand green used for ink and washes. tweakcn's `--accent` is a neutral hover grey.
  - Lane's `--destructive-foreground` is red text used on light tints. tweakcn's is the label on a red button.
  - If tweakcn's `:root` is pasted where Arc reads these names, Arc's accent turns grey and red-tint text turns near-white. Stage A needs a mapping layer, or a rename on one side.
- **Transparency is lost.** Lane's borders, muted, accent, field and ring colours are see-through, so they adapt to whatever surface sits underneath. tweakcn exports them opaque, except in `rgb` format, and Import drops alpha entirely. Opaque equivalents match on the page background but drift on cards and popovers.
- **One radius cannot reproduce Lane's set.** Lane's radii are Tailwind's scaled by 4/3. With `--radius: 10px`, md = 8px matches, but sm = 6 (Lane 5.33), lg = 10 (10.67) and xl = 14 (16). There is no xs or 2xl-4xl, so Tailwind's defaults would apply there.
- **The shadow model cannot reproduce Tailwind's md/lg/xl.** It can reproduce `sm` exactly (tweakcn's own defaults give `0 1px 3px 0 /.1, 0 1px 2px -1px /.1`, which equals Lane's `--sb-shadow-sm`). It cannot reproduce Lane's md/lg/xl, because each size keeps the base y/blur and only a fixed second layer changes.
- **Fonts.** tweakcn writes a family name literally (`Geist, sans-serif`). Lane loads Geist through `next/font` under a hashed family name exposed as `--font-geist`. The literal only works if `--font-sans` stays wired to the next/font variable (tweakcn's generated `layout.tsx` does this with `variable: "--font-sans"`).

## 5. What tweakcn has no slot for (goes in "Lane additions")

- **Status colours**: success, warning, info, each with a text, soft tint and border variant (`--success*`, `--warning*`, `--info*`, `--state-*`). Also destructive's soft tint and border, and the input-error colours.
- **Project colours** (`--project-blue/green/violet/amber/coral/slate`) and charts 6-8, chart fills, chart in/out.
- **A third text level** (`foreground-lighter`), brand ink separate from the button plate (`sb-primary` vs `sb-primary-solid`), and hover/pressed colours (`primary-hover`, `destructive-hover`, `border-control-hover`, `border-stronger`, overlay border inside popovers).
- **Input fill** (`sb-field`), the control sheen and the button edge highlight.
- **Arc's neutral ramp** (`--neutral-0..11`), the brand gradient, overlay backdrop, tooltip and skeleton fills.
- **Focus ring width and offset** (2px / 2px).
- **Per-mode shadows**: dark dialog and button shadows.
- **Type**: font weights (450 normal, 500, 600), the type scale and line heights, heading font, badge size and tracking.
- **Radii** beyond sm-xl and per-component radii (item, panel, buttons by size, checkbox, pane).
- **All sizes**: control heights, row heights, header, sidebar widths, icons, badge, avatar, menu.
- **Motion**: eases and durations, and the disabled opacity.

Already the same: the spacing unit (0.25rem), the dark-mode `.dark` class (Lane sets it already), and `@custom-variant dark`.

## Appendix: the exact tweakcn export of the Supabase preset (Tailwind v4, oklch)

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.9911 0 0);
  --foreground: oklch(0.2046 0 0);
  --card: oklch(0.9911 0 0);
  --card-foreground: oklch(0.2046 0 0);
  --popover: oklch(0.9911 0 0);
  --popover-foreground: oklch(0.4386 0 0);
  --primary: oklch(0.8348 0.1302 160.9080);
  --primary-foreground: oklch(0.2626 0.0147 166.4589);
  --secondary: oklch(0.9940 0 0);
  --secondary-foreground: oklch(0.2046 0 0);
  --muted: oklch(0.9461 0 0);
  --muted-foreground: oklch(0.2435 0 0);
  --accent: oklch(0.9461 0 0);
  --accent-foreground: oklch(0.2435 0 0);
  --destructive: oklch(0.5523 0.1927 32.7272);
  --destructive-foreground: oklch(0.9934 0.0032 17.2111);
  --border: oklch(0.9037 0 0);
  --input: oklch(0.9731 0 0);
  --ring: oklch(0.8348 0.1302 160.9080);
  --chart-1: oklch(0.8348 0.1302 160.9080);
  --chart-2: oklch(0.6231 0.1880 259.8145);
  --chart-3: oklch(0.6056 0.2189 292.7172);
  --chart-4: oklch(0.7686 0.1647 70.0804);
  --chart-5: oklch(0.6959 0.1491 162.4796);
  --sidebar: oklch(0.9911 0 0);
  --sidebar-foreground: oklch(0.5452 0 0);
  --sidebar-primary: oklch(0.8348 0.1302 160.9080);
  --sidebar-primary-foreground: oklch(0.2626 0.0147 166.4589);
  --sidebar-accent: oklch(0.9461 0 0);
  --sidebar-accent-foreground: oklch(0.2435 0 0);
  --sidebar-border: oklch(0.9037 0 0);
  --sidebar-ring: oklch(0.8348 0.1302 160.9080);
  --font-sans: Outfit, sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: monospace;
  --radius: 0.5rem;
  --shadow-x: 0px;
  --shadow-y: 1px;
  --shadow-blur: 3px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.17;
  --shadow-color: #000000;
  --shadow-2xs: 0px 1px 3px 0px hsl(0 0% 0% / 0.09);
  --shadow-xs: 0px 1px 3px 0px hsl(0 0% 0% / 0.09);
  --shadow-sm: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 1px 2px -1px hsl(0 0% 0% / 0.17);
  --shadow: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 1px 2px -1px hsl(0 0% 0% / 0.17);
  --shadow-md: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 2px 4px -1px hsl(0 0% 0% / 0.17);
  --shadow-lg: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 4px 6px -1px hsl(0 0% 0% / 0.17);
  --shadow-xl: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 8px 10px -1px hsl(0 0% 0% / 0.17);
  --shadow-2xl: 0px 1px 3px 0px hsl(0 0% 0% / 0.43);
  --tracking-normal: 0.025em;
  --spacing: 0.25rem;
}

.dark {
  --background: oklch(0.1822 0 0);
  --foreground: oklch(0.9288 0.0126 255.5079);
  --card: oklch(0.2046 0 0);
  --card-foreground: oklch(0.9288 0.0126 255.5079);
  --popover: oklch(0.2603 0 0);
  --popover-foreground: oklch(0.7348 0 0);
  --primary: oklch(0.4365 0.1044 156.7556);
  --primary-foreground: oklch(0.9213 0.0135 167.1558);
  --secondary: oklch(0.2603 0 0);
  --secondary-foreground: oklch(0.9851 0 0);
  --muted: oklch(0.2393 0 0);
  --muted-foreground: oklch(0.7122 0 0);
  --accent: oklch(0.3132 0 0);
  --accent-foreground: oklch(0.9851 0 0);
  --destructive: oklch(0.3123 0.0852 29.7877);
  --destructive-foreground: oklch(0.9368 0.0045 34.3089);
  --border: oklch(0.2809 0 0);
  --input: oklch(0.2603 0 0);
  --ring: oklch(0.8003 0.1821 151.7110);
  --chart-1: oklch(0.8003 0.1821 151.7110);
  --chart-2: oklch(0.7137 0.1434 254.6240);
  --chart-3: oklch(0.7090 0.1592 293.5412);
  --chart-4: oklch(0.8369 0.1644 84.4286);
  --chart-5: oklch(0.7845 0.1325 181.9120);
  --sidebar: oklch(0.1822 0 0);
  --sidebar-foreground: oklch(0.6301 0 0);
  --sidebar-primary: oklch(0.4365 0.1044 156.7556);
  --sidebar-primary-foreground: oklch(0.9213 0.0135 167.1558);
  --sidebar-accent: oklch(0.3132 0 0);
  --sidebar-accent-foreground: oklch(0.9851 0 0);
  --sidebar-border: oklch(0.2809 0 0);
  --sidebar-ring: oklch(0.8003 0.1821 151.7110);
  --font-sans: Outfit, sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: monospace;
  --radius: 0.5rem;
  --shadow-x: 0px;
  --shadow-y: 1px;
  --shadow-blur: 3px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.17;
  --shadow-color: #000000;
  --shadow-2xs: 0px 1px 3px 0px hsl(0 0% 0% / 0.09);
  --shadow-xs: 0px 1px 3px 0px hsl(0 0% 0% / 0.09);
  --shadow-sm: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 1px 2px -1px hsl(0 0% 0% / 0.17);
  --shadow: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 1px 2px -1px hsl(0 0% 0% / 0.17);
  --shadow-md: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 2px 4px -1px hsl(0 0% 0% / 0.17);
  --shadow-lg: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 4px 6px -1px hsl(0 0% 0% / 0.17);
  --shadow-xl: 0px 1px 3px 0px hsl(0 0% 0% / 0.17), 0px 8px 10px -1px hsl(0 0% 0% / 0.17);
  --shadow-2xl: 0px 1px 3px 0px hsl(0 0% 0% / 0.43);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);

  --tracking-tighter: calc(var(--tracking-normal) - 0.05em);
  --tracking-tight: calc(var(--tracking-normal) - 0.025em);
  --tracking-normal: var(--tracking-normal);
  --tracking-wide: calc(var(--tracking-normal) + 0.025em);
  --tracking-wider: calc(var(--tracking-normal) + 0.05em);
  --tracking-widest: calc(var(--tracking-normal) + 0.1em);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    letter-spacing: var(--tracking-normal);
  }
}
```
