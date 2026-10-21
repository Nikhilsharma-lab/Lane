# How every Lane and Arc token maps onto the one theme file

Research for [#83](https://github.com/Nikhilsharma-lab/Lane/issues/83) (map [#79](https://github.com/Nikhilsharma-lab/Lane/issues/79)). Written 2026-10-21 against `7a42cf7`. Planning only: no app code changed.

Inputs: [#81 tweakcn export findings](https://github.com/Nikhilsharma-lab/Lane/blob/research/tweakcn-export/docs/design-system/tweakcn-export.md) and [#82 dark-mode causes](https://github.com/Nikhilsharma-lab/Lane/blob/research/dark-mode-causes/docs/research/dark-mode-causes.md) (C1-C7 below refer to #82).

## Sources

- Token chain: `src/styles/supabase-tokens.css` (787 lines), `src/styles/lane-arc-theme.css` (365), `src/components/arc/foundation.css` (230), `src/app/globals.css` (73). Import order: `src/app/layout.tsx:10-15`, repeated in `src/app/global-error.tsx:10-13`.
- Consumers: every `*.css`, `*.ts` and `*.tsx` under `src/`, scanned with throwaway scripts (kept outside the repo) for `var(--…)` reads, custom-property declarations and Tailwind class names.
- Arc lock: `scripts/design-system/arc-source-check.mjs`, `docs/design-system/arc-source-hashes.json` (67 records, 62 already have a recorded local adaptation), `docs/design-system/arc-sources.md`.
- Clerk: `src/components/auth/clerk-appearance.ts`; the variable list is from the installed `@clerk/ui` 1.33.1 `dist/internal/appearance.d.ts:678-831`.
- Tailwind behaviour was tested with Lane's installed `tailwindcss` / `@tailwindcss/postcss` 4.3.0 on a scratch stylesheet outside the repo (results in §2.1).
- Next 16.3.8's built CSS (`.next/static`) registers next/font's faces as `font-family: Geist` / `Geist Fallback` and `Geist Mono` / `Geist Mono Fallback`.
- Storybook was removed in `58b1dcb` (#70). There is no `.storybook/` directory, so this plan has nothing for Storybook to follow.

## Short answer

- **Every one of the 280 names works with one theme file and a small value-free bridge.** That is Arc's 115 foundation tokens plus the 166 hooks that only `lane-arc-theme.css` defines. 114 of Arc's tokens are also redefined by Lane, and Arc's `--icon-size` is a per-slot variable that needs no value.
- **Arc's `--accent` (brand ink) and shadcn's `--accent` (grey hover) clash.** The fix is that Lane never reads tweakcn's `--accent`: the bridge points `--accent` at a Lane-additions ink. No Arc file is renamed.
- **The dark-mode cascade problem (C4) is fixed by loading `foundation.css` inside a cascade layer.** Arc's file stays byte-identical, so this adds **no** Arc adaptation.
- **Only one Arc file needs its recorded adaptation updated:** `settings-command.module.css`, which reads `--sb-*` directly. All 67 files keep their current ledger status.
- **Stage A can paint exactly what Lane paints today**, with three narrow exceptions (§6). This needs two choices Nikhil should confirm: radii are derived from tweakcn's one `--radius` by ratio, and the raised and floating shadows stay in Lane additions. If he wants tweakcn's own radius and shadow formulas instead, the visible differences are listed in §6.2.

## 1. Destination shape

```
src/styles/theme.css          ← THE theme file
  ├─ /* tweakcn: paste below, replace wholesale */      @import "tailwindcss"; @custom-variant; :root{}; .dark{}; @theme inline{}; @layer base{}
  └─ /* Lane additions */                                 :root{} .dark{}   (values, copied as-is)
src/styles/theme-bridge.css   ← plumbing, no values
src/app/globals.css           ← entry: @import "../styles/theme.css"; @import "tw-animate-css";
                                       @import "../components/arc/foundation.css" layer(arc-foundation);
                                       @import "../styles/theme-bridge.css";  + today's @layer base rules, re-pointed
```

`supabase-tokens.css` and `lane-arc-theme.css` are deleted. `layout.tsx:10,14,15` and `global-error.tsx:10,12,13` stop importing them and `foundation.css`; `globals.css` brings everything in.

### Rules for the two halves and the bridge

| Place | May contain | May not contain |
|---|---|---|
| tweakcn half | Exactly what tweakcn exports. Never edited. | — |
| Lane additions | Literal values copied from today's resolved values. **Also** expressions over tweakcn slots (`calc(var(--radius) * 4 / 3)`, `color-mix(in oklab, var(--destructive) 10%, transparent)`) and per-mode references (`.dark { --accent-ink: var(--ring) }`). Anything that changes between light and dark lives here, in `:root` and `.dark`. | Any name tweakcn exports (§2). That keeps a re-paste from colliding with additions. |
| Bridge | Only `--hook: var(--name);` renames. Two context scopes (§2.6). One `@theme inline` block of renames for Tailwind. | Literals, `calc`, `color-mix`, keywords (`0`, `none`, `transparent` go to additions), and `.dark` / `[data-theme]` selectors. |

**Is the bridge part of the theme file?** No. It is plumbing that holds no values, so the "one theme file" rule still holds: every colour, font, rounding, size and motion value is in `theme.css`. The automatic check from #79 can enforce this mechanically. Each bridge declaration must match `^var\(--[a-z0-9-]+\)$`, and every name the bridge reads must be defined in `theme.css`. A separate file keeps Nikhil's half free of wiring, and means a re-paste can never touch the wiring.

**Why rename-only?** The point of the switch is to shorten today's four-hop chain (`--sb-*` → Lane hook → Arc hook → `@theme`). The longest path after the switch is: tweakcn slot or addition → one bridge rename → consumer.

## 2. Name clashes and how each is resolved

### 2.1 Facts the resolutions rely on (tested on Tailwind 4.3.0)

- **Later `@theme inline` wins.** When the bridge's `@theme inline` comes after tweakcn's, `rounded-sm` and `text-destructive-foreground` use the bridge's mapping.
- **`@theme inline` does not emit custom properties for inline radius keys.** tweakcn's `--radius-sm: calc(var(--radius) - 4px)` only changes the Tailwind `rounded-sm` class. The `--radius-sm` custom property that Arc reads is left alone.
- **Importing `tailwindcss` twice prints preflight twice.** So `globals.css` must not keep its own `@import "tailwindcss"` (`globals.css:1`). The theme file's copy becomes the only one.
- **`@import "…/foundation.css" layer(arc-foundation)` lands after Tailwind's `theme, base, components, utilities`.** That makes Arc's layer stronger than every Tailwind layer, exactly as today when Arc is unlayered. It is weaker than every unlayered rule, which includes the theme file and the bridge.

### 2.2 The dark-mode cascade (C4): put `foundation.css` in a layer

**Recommendation: option (b), the cascade layer.** It costs no Arc adaptation, it also covers Arc's light `:root` block and its `[data-accent]` blocks (`foundation.css:123-157`), and the `@supports` series block (`:165-178`).

- **Today:** Arc's `:root[data-theme="dark"]` (0,2,0) and `[data-accent]` dark blocks (0,3,0) beat tweakcn's `.dark` (0,1,0). Specificity can't fix this, because the tweakcn text is fixed.
- **With the layer:** any unlayered declaration wins regardless of specificity.

Side effects, checked:
- **Focus outline.** Arc's `!important` focus rules (`foundation.css:189-192`) get *stronger*, because important declarations in a layer beat unlayered important ones. Nothing else in `src/` sets `outline … !important`, so nothing visible changes.
- **Icon sizes.** `:where(svg.lucide)` sizes (`:220-230`) still beat Tailwind utilities, as today. They already lose to any module rule.
- **Required script change (not an Arc change).** `arc-source-check.mjs:46` currently insists that `layout.tsx` imports `"@/components/arc/foundation.css"`. It must instead accept the `@import … layer(arc-foundation)` line in `globals.css`.
- **Guard against regressions.** Add a check that every custom property declared in `foundation.css` (115 names) is defined, unlayered, by `theme.css` or the bridge. Then no Arc default can paint in either mode.

### 2.3 Arc `--accent` (brand ink) vs shadcn `--accent` (grey hover)

- **Who reads it.** Arc reads `--accent` as the brand in 9 files:
  - `alert.module.css:11`
  - `badge.module.css:51`
  - `settings-command.module.css:16`
  - `workspace-sidebar.module.css:21,53,69,77,79,125,173`
  - `date-range-picker.module.css:127,150,177`
  - `notification-center.module.css:37`
  - `progress.module.css:1`
  - `select.module.css:32`
  - `toast-stack.module.css:24`

  Lane also reads it as the brand in 5 product files (`intake-form.module.css:30`, `measurement-plan-fields.module.css:19,41,42,52`, `request-labels.module.css:16`, `request-property-pickers.module.css:96`, `workspace-shell.module.css:18`).
- **What Lane would need from tweakcn's `--accent`.** Lane's pressed wash `--sb-accent` is see-through (`supabase-tokens.css:24,351`), which tweakcn can't hold (§3). So Lane needs nothing from tweakcn's `--accent` in Stage A.
- **Resolution:**
  - Additions define `--accent-ink`. In `:root` it is `var(--primary)`; in `.dark` it is `var(--ring)`. That is exactly today's `--sb-primary`: light `oklch(.525 .12 157.5)` = the light button plate, dark `oklch(.76 .15 157.5)` = the dark ring base.
  - Additions define `--accent-ink-foreground` as a literal per mode (`--sb-primary-foreground`, `:28,355`).
  - The bridge sets `--accent: var(--accent-ink)` and `--accent-foreground: var(--accent-ink-foreground)`. The bridge is unlayered and loaded after `theme.css`, so its `:root` beats tweakcn's `:root` and `.dark` (all 0,1,0) by order.
- tweakcn's `--accent` / `--accent-foreground` are **preview-only slots**. Fill them in tweakcn with the flattened pressed wash so tweakcn's preview looks like Lane.
- **Rejected: renaming Arc's hook.** That would mean about 10 Arc adaptations. Every future Arc install reads `--accent` as the brand, so it would silently turn grey.

### 2.4 `--background`, `--foreground`, `--destructive`: same meaning, read straight through

- **`--background`.** Lane's `--background` = `--sb-dash-sidebar` = `--sb-background` (`lane-arc-theme.css:22`) = the page canvas, which is tweakcn's meaning. Arc reads it directly (13 sites, e.g. `button.module.css:15`), and the bridge needs nothing. The "sidebar canvas" naming is a Supabase artefact. `--navigation-background`, `--workspace-canvas` and `--dialog-background` become renames of `--sidebar` / `--background` (§4).
- **`--foreground`** (188 reads) and **`--destructive`** (`--sb-destructive`) are also identical in meaning and read straight through.

### 2.5 `--destructive-foreground`: retire Lane's meaning

- **Lane's meaning:** red text (`lane-arc-theme.css:96` → `--sb-destructive`). It is read only through Tailwind `text-destructive-foreground` (`globals.css:16`). That class is used 5 times, all in `src/app/(app)/intake/intake-form.tsx:192,1437,1438,1546,1571`, as red error text.
- **tweakcn's meaning:** the label on a red button. That is what Lane calls `--button-danger-foreground` (`lane-arc-theme.css:308` → `--sb-destructive-foreground`).
- **Resolution:** change those 5 classes to `text-destructive`. It is the same colour, because `--destructive` and Lane's `--destructive-foreground` both resolve to `--sb-destructive`. Then drop Lane's `--destructive-foreground`. The bridge points `--button-danger-foreground: var(--destructive-foreground)`. tweakcn's slot now means what Lane means.

### 2.6 `--border`: same meaning, but see-through

Lane's border is `--sb-border`, black at 8.1% in light and white at 7.5% in dark (`:53,380`). tweakcn can only hold it opaque.
- **Resolution:** additions define `--hairline` (the literal see-through value per mode), and the bridge sets `--border: var(--hairline)`. tweakcn's `--border`, `--input` and `--sidebar-border` are preview-only (fill them with the flattened values from #81).
- **Context scopes stay in the bridge as renames:**
  - `[data-ui-surface="floating"]` → `--border` / `--border-subtle: var(--border-overlay)`; `--interaction-hover` / `-focus` / `-pressed: var(--interaction-pressed)` (today `lane-arc-theme.css:276-282`).
  - `nav[aria-label="Primary navigation"]` → `--interaction-hover: var(--nav-hover)`; `-focus` / `-pressed: var(--interaction-pressed)` (today `:285-289`).
- tweakcn's `@layer base { * { @apply border-border } }` resolves `var(--border)` per element, so it paints Lane's see-through hairline, as `globals.css:44` does today.

### 2.7 Lane's `--sidebar-*` layout names vs tweakcn's `--sidebar-*` colours

- **No name actually collides.** tweakcn exports `--sidebar`, `--sidebar-foreground`, `--sidebar-primary(-foreground)`, `--sidebar-accent(-foreground)`, `--sidebar-border` and `--sidebar-ring`.
- **Lane's names are different:** `--sidebar-row-radius` (`:164`), `--sidebar-row-height` (`:190`), `--sidebar-icon-size` (`:197`), `--sidebar-action-icon-size` (`:198`), `--sidebar-photo-shadow` (`:258`), `--sidebar-logo-shadow` (`:259`). There are also the runtime `--sidebar-width` / `--sidebar-peek-top` / `--sidebar-peek-width`, which JS sets (`workspace-shell.module.css:2,5,16`; `sidebar-view.tsx:167`).
- **Tailwind is not affected.** Tailwind only gets `--color-sidebar-*` from tweakcn, which is a different namespace.
- **Resolution:** keep Lane's names in Stage A. Add a check that no Lane additions or bridge name equals a tweakcn-exported name. Rename `--sb-sidebar-width` (read at `workspace-shell.module.css:2,16`, `use-sidebar-resize.ts`) to `--navigation-width`, not `--sidebar-width`, because that name is taken by the runtime value. Renaming Lane's layout names to `--nav-*` is optional tidy-up for Stage B.
- **One tweakcn sidebar slot is used:** `--navigation-background: var(--sidebar)`. The others are preview-only.

### 2.8 `--radius-*`

Today there are three definers:
- Arc `foundation.css:65,201-205` (`--radius-control/panel/surface/pill/xs/sm/xl/2xl/3xl`).
- Lane `lane-arc-theme.css:156-167,354-358`, which maps them to `--sb-radius-*`.
- `globals.css:31-38`: Tailwind `rounded-*` → `--sb-radius-*`.

tweakcn adds one `--radius` plus Tailwind-only `rounded-sm/md/lg/xl` formulas (`r−4px`, `r−2px`, `r`, `r+4px`).

- **Resolution:** additions derive Lane's whole scale from tweakcn's `--radius` by ratio. Supabase's radii are Tailwind's scaled by 4/3, which is exactly multiples of `md` = 8px, so with `--radius: 0.5rem` every step is pixel-exact:

  | Additions token | Expression | = today |
  |---|---|---|
  | `--radius-xs` | `calc(var(--radius) / 3)` | `.166667rem` (`supabase-tokens.css:683`) |
  | `--radius-sm` | `calc(var(--radius) * 2 / 3)` | `.333333rem` (`:684`) |
  | `--radius-md` | `var(--radius)` | `.5rem` (`:685`) |
  | `--radius-lg` | `calc(var(--radius) * 4 / 3)` | `.666667rem` (`:686`) |
  | `--radius-xl` | `calc(var(--radius) * 2)` | `1rem` (`:687`) |
  | `--radius-2xl` | `calc(var(--radius) * 8 / 3)` | `1.333333rem` (`:688`) |
  | `--radius-3xl` | `calc(var(--radius) * 4)` | `2rem` (`:689`) |
  | `--radius-4xl` | `calc(var(--radius) * 16 / 3)` | `2.666667rem` (`:690`) |
  | `--radius-pill` | `calc(infinity * 1px)` | `:691` |
  | `--radius-item` | `calc(var(--radius) - 2px)` | `:693` |
  | `--button-radius-sm/md/lg` | `var(--radius)`; `calc(var(--radius) * (1 + (34 / 26 - 1) * .35))`; `… 38 / 26 …` | `:770-772` |

- The bridge's `@theme inline` maps Tailwind `--radius-xs..4xl` to these names and overrides tweakcn's four formulas. No product `.tsx` uses a `rounded-*` class today (scanned), so this only keeps future classes consistent.
- **Trade-off:** tweakcn's *preview* shows its own steps (sm 4, md 6, lg 8, xl 12px at 0.5rem), not Lane's. Lane itself is exact.

### 2.9 `--spacing`

- tweakcn writes `--spacing: 0.25rem` into `:root` (unlayered). That also drives every Tailwind spacing utility, and it equals `--sb-spacing` (`:696`).
- **Resolution:** additions `--space-N: calc(var(--spacing) * N)` for N = 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24 (today `lane-arc-theme.css:237-248`). Every product read of `--sb-spacing` (§5.2) becomes `--spacing`. Clerk's `spacing: "calc(var(--sb-spacing) * 4)"` (`clerk-appearance.ts:39`) becomes `var(--space-4)`.

### 2.10 `--font-*`

- tweakcn writes literal stacks (`--font-sans: Geist, sans-serif`). Next 16 registers next/font's face under the family name `Geist`, so the literal reaches the loaded font as long as `src/lib/fonts.ts` stays imported by the layout.
- **Bridge:** `--font-body: var(--font-sans)`, `--font-display: var(--font-sans)` (today `--sb-font-heading` = `--sb-font-sans`, `:652`). `--sb-font-mono` reads (`globals.css:22`) become tweakcn's `--font-mono`. In `@theme inline`: `--font-sans: var(--font-sans)` is tweakcn's own; the weights become `--font-weight-normal/medium/semibold: var(--weight-normal/medium/semibold)`.
- **Additions:** `--weight-normal: 450`, `--weight-medium: 500`, `--weight-semibold: 600` (`:654-656`; `--weight-semibold` is new, replacing 10 `--sb-font-weight-semibold` reads). Also add `--tracking-display: calc(var(--tracking-normal) - .025em)`, which is tweakcn's own `tight` formula and equals `--sb-tracking-tight` when letter-spacing is 0.
- **Requirement for the seed theme:** letter-spacing must be `0em`, or tweakcn adds body letter-spacing (#81).
- **Difference before the font loads (§6.1):** today's stack starts `var(--font-geist)` = `Geist, "Geist Fallback"`. tweakcn's has no `Geist Fallback`.

## 3. See-through colours (tweakcn drops alpha)

- **Principle:** a see-through Lane colour never comes from a tweakcn slot.
- **Two ways to keep it in Lane additions:**
  - (a) A **literal copied as-is**, when its hue is not a tweakcn colour.
  - (b) A **derived `color-mix(in oklab, var(--slot) N%, transparent)`**, when its opaque base is exactly a tweakcn slot. Mixing with `transparent` keeps the base colour and sets alpha to N%, so the result equals today's `oklch(… / N)`.
- The matching tweakcn slots are filled with #81's flattened values so tweakcn's preview resembles Lane. Lane does not read them.

| Today (`supabase-tokens.css` light; dark) | Additions token | How | Feeds (via bridge) |
|---|---|---|---|
| `--sb-border` `:53;380` | `--hairline` | literal | `--border`, `--border-subtle`, `--interaction-border`, `--input-readonly-border`, `--skeleton-fill`, `--control-track-hover` |
| `--sb-border-control` `:54;381` | `--border-strong` | literal | `--input-border`, `--selection-property-border`, `--state-neutral-border`, `--request-property-border` |
| `--sb-border-overlay` `:55;382` | `--border-overlay` | literal | floating-scope `--border`, `--border-subtle` |
| `--sb-border-control-hover` `:57;384` | `--input-border-hover` | literal | `--selection-border` |
| `--sb-muted` `:23;350` | `--surface-muted` | literal | `--interaction-hover`, `--selection-background/hover/pressed`, `--state-neutral-hover` |
| `--sb-accent` `:24;351` | `--interaction-pressed` | literal | `--interaction-focus`, `--segment-selection-background`, `--control-track`, floating-scope hover/focus/pressed |
| `--sb-sidebar-accent-50` `:27;354` | `--nav-hover` | literal | nav-scope `--interaction-hover` |
| `--sb-control-25` `:26;353` | `--control-on-subtle` | literal | — |
| `--sb-field` `:58;385` | `--input-background` | literal | — |
| `--sb-ring` `:37;364` | `--focus-outline` | **derived** `color-mix(in oklab, var(--ring) 55%, transparent)` (tweakcn `--ring` = the opaque base, #30ba79 / #4acd8b, in sRGB) | — |
| `--sb-primary-bright-15` `:34;361` | `--accent-subtle` | **derived** `color-mix(in oklab, var(--ring) 15%, transparent)` (same base) | — |
| `--sb-destructive-10` `:48;375` | `--destructive-soft` | **derived** `color-mix(in oklab, var(--destructive) 10%, transparent)` | `--state-danger-background/hover` |
| `--sb-border-destructive` `:47;374` | `--destructive-border` | **derived**, 30% | `--state-danger-border` |
| `--sb-info-10`, `--sb-border-info` `:52,51;379,378` | `--info-soft`, `--info-border` | **derived** from additions `--info`, 10% / 30% | `--state-info-*` |
| `--sb-warning-10` `:43;370` | `--warning-soft` | literal (its base `--sb-warning` is not Lane's `--warning` hue) | `--state-warning-background/hover` |
| `--sb-brand-default-10` `:80;408` | `--success-soft` | literal | `--state-success-background/hover` |
| `color-mix(--sb-background 80%, transparent)` (`lane-arc-theme.css:359`) | `--overlay-backdrop` | **derived** from `--background` | `--overlay` |
| Arc `--accent-subtle` in `[data-accent]` blocks | — | inert: Lane sets no `data-accent` (none in `src/`) | — |

- **Light vs dark mode.** Opacity is set per mode, so every literal above has a `:root` and a `.dark` value. The derived rows inherit their mode from the slot.
- **Optional for Stage B:** `--hairline`, `--border-strong`, `--surface-muted` and `--interaction-pressed` are all "foreground at N%". Deriving them as `color-mix(in oklab, var(--foreground) N%, transparent)` is exact in light. In dark it is within 0.001 chroma, because Supabase's dark borders use chroma 0.0015 rather than the foreground's 0.00275. That would let tweakcn's foreground steer borders, but it is not needed for Stage A.

## 4. The full mapping table

Legend:
- **T**: tweakcn slot read by its own name (no bridge line needed).
- **B→x**: bridge rename `--hook: var(--x)`.
- **A**: Lane additions literal copied as-is (light; dark from the dark block).
- **A=f(…)**: additions expression over tweakcn slots.

"Today" cites `lane-arc-theme.css` (LAT) and `supabase-tokens.css` (SB) lines. Arc line numbers are `foundation.css`. "(unread)" means no consumer outside the token files reads it today (48 names). The recommendation is to keep them all, so the completeness check in §2.2 stays simple.

### 4.1 Arc foundation tokens (115)

| Arc token (`foundation.css` line) | Today (LAT → SB) | Destination |
|---|---|---|
| `--neutral-0..11` (3-14) (unread) | LAT 7-18 → `--sb-color-scale-100..1200` (SB 286-297; 614-625) | A, 12 literals per mode |
| `--background` (15, 85) | LAT 22 → `--sb-dash-sidebar` → `--sb-background` | **T** `--background` |
| `--surface` (16, 86) | LAT 25 → `--sb-surface-100` → `--sb-card` | B→`--card` (T) |
| `--surface-raised` (17, 87) | LAT 26 → `--sb-overlay` → `--sb-secondary` | B→`--popover`. tweakcn `--popover` is set to `--sb-secondary`'s values (#fff / `oklch(.24 .0025 157.5)`), not `--sb-popover`, which nothing reads |
| `--surface-muted` (18, 89) | LAT 27 → `--sb-surface-200` → `--sb-muted` (α) | A (α literal, §3) |
| `--foreground` (19, 90) | LAT 28 → `--sb-foreground` | **T** `--foreground` |
| `--text-secondary` (20, 91) | LAT 29 → `--sb-foreground-light` | B→`--muted-foreground` (T; Tailwind `text-muted-foreground` already means this, `globals.css:14`) |
| `--text-muted` (21, 92) | LAT 30 → `--sb-foreground-lighter` | A |
| `--border` (22, 93) | LAT 32 → `--sb-border` (α) | B→`--hairline` (A α), §2.6 |
| `--border-subtle` (23, 94) | LAT 33 → `--sb-border-muted` → `--sb-border` | B→`--hairline` |
| `--border-strong` (24, 95) | LAT 34 → `--sb-border-strong` → `--sb-border-control` (α) | A (α) |
| `--accent` (25, 97, 123-138) | LAT 49 → `--sb-primary` | B→`--accent-ink`; A=`var(--primary)` light, `var(--ring)` dark (§2.3) |
| `--accent-strong` (26, 98) | LAT 50 → `--sb-primary-hover` | A |
| `--accent-subtle` (27, 99) | LAT 51 → `--sb-primary-bright-15` (α) | A=`color-mix(--ring 15%)` |
| `--accent-foreground` (28) | LAT 52 → `--sb-primary-foreground` | B→`--accent-ink-foreground` (A) |
| `--control-on` (31, 101) | LAT 75 → `--sb-foreground` | B→`--foreground` |
| `--control-glyph` (32, 102) | LAT 76 → `--sb-background` | B→`--background` |
| `--control-track` (33, 103) (unread) | LAT 79 → `--sb-control` → `--sb-accent` | B→`--interaction-pressed` |
| `--control-track-hover` (34, 104) (unread) | LAT 80 → `--sb-border` | B→`--hairline` |
| `--control-thumb` (35, 105) (unread) | LAT 81 → `--sb-foreground-lighter` | B→`--text-muted` |
| `--control-thumb-on` (36, 106) (unread) | LAT 82 → `--sb-primary-foreground` | B→`--accent-ink-foreground` |
| `--control-thumb-shadow` (37, 108) (unread) | LAT 83 → `--sb-shadow-lg` | B→`--shadow-floating` |
| `--control-on-subtle` (38) | LAT 77 → `--sb-control-25` (α) | A (α) |
| `--control-fill` (40, 107) (unread) | LAT 78 → `--sb-foreground` | B→`--foreground` |
| `--focus-ring` (43, 96) | LAT 43 `transparent` | A `transparent` |
| `--success` (44, 109) | LAT 86 → `--sb-brand-600` | A |
| `--warning` (45, 110) | LAT 90 → `--sb-warning-600` | A |
| `--danger` (46, 111) | LAT 94 → `--sb-destructive` | B→`--destructive` (T) |
| `--shadow-resting` (48, 112) | LAT 252 → `--sb-shadow-xs` | B→`--shadow-xs` (T). Seed tweakcn: shadow x 0, y 1px, blur 2px, spread 0, opacity 0.1, colour #000 → its `--shadow-xs` = `0px 1px 2px 0px hsl(0 0% 0% / 0.05)`, which equals SB 703 |
| `--shadow-raised` (49, 113) | LAT 253 → `--sb-shadow-md` | A (literal SB 705). tweakcn's md can't reproduce it (#81) |
| `--shadow-floating` (50, 114) | LAT 254 → `--sb-shadow-lg` | A (literal SB 706) |
| `--arc-gradient-from`, `-to` (52-53, 115-116) | LAT 146-147 → `--sb-brand-200/400` | A |
| `--arc-gradient` (54) (unread) | LAT 148 | A=`linear-gradient(100deg, var(--arc-gradient-from), var(--arc-gradient-to))` |
| `--arc-gradient-foreground` (55, 117) (unread) | LAT 149 → `--sb-foreground` | B→`--foreground` |
| `--arc-gradient-soft/line/ink` (57-61, 118-120) (unread) | LAT 150-152 → brand-200/500/600 | A (gradient literals over additions brand steps) |
| `--space-1..24` (62-64) | LAT 237-248 | A=`calc(var(--spacing) * N)` |
| `--radius-control` (65) | LAT 156 → `--sb-radius-md` | B→`--radius-md` (A=f(`--radius`)) |
| `--radius-panel` (65) | LAT 157 → md | B→`--radius-md` |
| `--radius-surface` (65) | LAT 158 → lg | B→`--radius-lg` |
| `--radius-pill` (65) | LAT 161 → full | A `calc(infinity * 1px)` |
| `--control-height-sm/md/lg` (66) | LAT 171-173 → `--sb-size-tiny/small/medium` (26/34/38px) | A |
| `--font-display` (67) | LAT 219 → `--sb-font-heading` | B→`--font-sans` (T) |
| `--font-body` (68) | LAT 220 → `--sb-font-sans` | B→`--font-sans` (T) |
| `--text-xs..5xl` (69-71) | LAT 221-229 → SB 658-675 | A (plus `--text-*--line-height`, SB 659-675, new names in additions) |
| `--tracking-body` (72) | LAT 230 → `--sb-tracking-normal` | B→`--tracking-normal` (T) |
| `--tracking-display` (72) | LAT 231 → `--sb-tracking-tight` | A=`calc(var(--tracking-normal) - .025em)` |
| `--leading-body`, `--leading-display` (73) | LAT 232-233 → sm / 2xl line heights | B→`--text-sm--line-height`, `--text-2xl--line-height` (A) |
| `--ease-enter/standard/exit/in-out/spring` (74-79) | LAT 263-267 → `--sb-ease-*` | A (5 literals; `--ease-spring` = control ease, as today) |
| `--duration-instant/fast/standard/considered/spring` (80) | LAT 268-272 → `--sb-duration-*` | A |
| `--series-1..4` (163-176) (unread) | LAT 142-145 → `--sb-chart-1..4` | B→`--chart-1..4` (T; tweakcn chart slots = SB 310-313 / 638-641) |
| `--border-width` (198) | LAT 351 → `--sb-border-width` | A `1px` |
| `--weight-normal`, `--weight-medium` (199-200) | LAT 352-353 | A 450 / 500 |
| `--radius-xs/sm/xl/2xl/3xl` (201-205) | LAT 354-358 | A=f(`--radius`), §2.8 |
| `--overlay-backdrop` (206) | LAT 359 | A=`color-mix(in oklab, var(--background) 80%, transparent)` |
| `--tooltip-muted` (207) | LAT 361 | A=`color-mix(in oklab, var(--background) 62%, var(--foreground))` |
| `--skeleton-fill` (208) | LAT 364 → `--sb-border` | B→`--hairline` |
| `--icon-size-xs..2xl` (209-214) | LAT 191-196 → 12 / 14 / 16 / 18 / 20 / 24px | A |
| `--icon-size` (225-230) | per-slot variable | none (stays in Arc) |

### 4.2 Lane-only hooks (166, defined only in `lane-arc-theme.css`)

| Hooks (LAT line) | Today → SB | Destination |
|---|---|---|
| `--workspace-canvas` (23), `--dialog-background` (341) | `--sb-dash-canvas` / `--sb-dash-sidebar` → `--sb-background` | B→`--background` |
| `--navigation-background` (24) | `--sb-dash-sidebar` | B→`--sidebar` (T; tweakcn `--sidebar` = page background value) |
| `--floating-foreground` (31) (unread), `--state-neutral-text` (103), `--request-property-foreground` (137), `--segment-foreground` (184) | `--sb-foreground-light` | B→`--muted-foreground` |
| `--interaction-background` (37), `--button-secondary-background` (306) | `--sb-raised-control` = card (light) / muted α (dark) | A `--button-secondary-background`: `:root` `var(--card)`, `.dark` `var(--surface-muted)`; `--interaction-background` B→ it |
| `--button-secondary-hover` (307) | `--sb-raised-control-hover` = muted (light) / accent (dark) | A: `:root` `var(--surface-muted)`, `.dark` `var(--interaction-pressed)` |
| `--interaction-border` (38), `--input-readonly-border` (316) | `--sb-border-button` → `--sb-border` | B→`--hairline` |
| `--interaction-hover` (39), `--state-neutral-hover` (105), `--selection-background/hover/pressed` (62-64) | `--sb-surface-200` / `--sb-muted` | B→`--surface-muted` |
| `--interaction-pressed` (40), `--interaction-focus` (41), `--segment-selection-background` (186) | `--sb-selection` / `--sb-accent` (α) | A `--interaction-pressed` (α); others B→ it |
| floating-scope overrides (276-282) | `--sb-border-overlay`, `--sb-overlay-hover` (= `--sb-accent`) | bridge scope: B→`--border-overlay` (A α), B→`--interaction-pressed` |
| nav-scope overrides (285-289) | `--sb-sidebar-accent-50`, `--sb-selection` | bridge scope: B→`--nav-hover` (A α), B→`--interaction-pressed` |
| `--focus-outline` (44) | `--sb-ring` (α) | A=`color-mix(--ring 55%)` |
| `--focus-outline-width`, `--focus-outline-offset` (45-46) | `--sb-ring-width/offset` 2px | A |
| `--primary-background` (53) | `--sb-primary-solid` | B→`--primary` (T) |
| `--primary-label` (54) | `--sb-primary-solid-foreground` | B→`--primary-foreground` (T) |
| `--primary-hover-background` (55), `--primary-focus-background` (56), `--primary-pressed-background` (57) | `--sb-primary-solid-hover` | A `--primary-hover`; the three B→ it |
| `--primary-hover-opacity`, `--primary-pressed-opacity` (58-59) | `1` | A |
| `--selection-foreground/secondary-foreground/icon` (65-67), `--search-highlight-foreground` (139) | `--sb-foreground` | B→`--foreground` |
| `--selection-border` (68) | `--sb-border-control-hover` | B→`--input-border-hover` |
| `--selection-property-border` (69), `--state-neutral-border` (106), `--request-property-border` (138), `--input-border` (314) | `--sb-border-strong` / `--sb-border-control` | B→`--border-strong` |
| `--selection-focus-decoration` (70) (unread) | `underline` | A |
| `--success-foreground` (87) (unread), `--state-success-text/icon` (112-113) | `--sb-brand-600` | B→`--success` |
| `--success-soft` (88) (unread), `--state-success-background/hover` (114-115) | `--sb-brand-default-10` | A `--success-soft`; others B→ |
| `--success-border` (89) (unread), `--state-success-border` (116) | `--sb-brand-500` | A `--success-border`; other B→ |
| `--warning-foreground` (91) (unread), `--state-warning-text/icon` (117-118) | `--sb-warning-600` | B→`--warning` |
| `--warning-soft` (92) (unread), `--state-warning-background/hover` (119-120) | `--sb-warning-10` | A; others B→ |
| `--warning-border` (93) (unread), `--state-warning-border` (121) | `--sb-warning-500` | A; other B→ |
| `--destructive` (95), `--state-danger-text/icon` (122-123), `--button-danger-background` (309), `--input-error-border-active` (319) | `--sb-destructive` | **T** `--destructive`; others B→ |
| `--destructive-foreground` (96) | `--sb-destructive` (red text) | retired, §2.5 |
| `--destructive-soft` (97) (unread), `--state-danger-background/hover` (124-125) | `--sb-destructive-10` | A=`color-mix(--destructive 10%)`; others B→ |
| `--destructive-border` (98) (unread), `--state-danger-border` (126) | `--sb-border-destructive` | A=`color-mix(--destructive 30%)`; other B→ |
| `--info` (99), `--info-foreground` (100) (unread), `--state-info-text/icon` (107-108) | `--sb-info` | A `--info`; others B→ |
| `--info-soft` (101) (unread), `--state-info-background/hover` (109-110) | `--sb-info-10` | A=`color-mix(--info 10%)`; others B→ |
| `--info-border` (102) (unread), `--state-info-border` (111) | `--sb-border-info` | A=`color-mix(--info 30%)`; other B→ |
| `--state-neutral-background` (104), `--request-property-background` (136) | `--sb-surface-75` → `--sb-card` | B→`--card` |
| `--project-blue/green/violet/amber/coral/slate` (129-134) | `--sb-color-{blue,green,violet,amber,tomato}-900`, `--sb-color-scale-900` | A, light **and** dark (C5). Slate differs per mode: `hsl(206 6% 56.1%)` / `hsl(0 0% 43.9%)` |
| `--button-danger-foreground` (308) | `--sb-destructive-foreground` | B→`--destructive-foreground` (T) |
| `--button-danger-hover` (310) | `--sb-destructive-hover` | A |
| `--input-background` (313) | `--sb-field` (α) | A |
| `--input-border-hover` (315) | `--sb-border-control-hover` (α) | A |
| `--input-error-background`, `--input-error-border` (317-318) | `--sb-destructive-200/400` | A |
| `--lane-panel-radius` (160) | lg | B→`--radius-lg` |
| `--workspace-pane-radius` (162) | xl | B→`--radius-xl` |
| `--request-row-radius`, `--sidebar-row-radius`, `--segment-radius`, `--select-panel-radius` (163-167) | md | B→`--radius-md` |
| `--checkbox-radius` (165), `--segment-item-radius` (181) | sm | B→`--radius-sm` |
| `--menu-item-radius` (333) | `--sb-radius-item` | B→`--radius-item` (A) |
| `--button-radius-sm/md/lg` (293-295) | SB 770-772 | A=f(`--radius`), §2.8 |
| `--segment-height` (174), `--floating-action-height` (188) | `--sb-size-tiny` | B→`--control-height-sm` |
| `--segment-border-width` (177), `--segment-gap` (180), `--segment-selection-border-width` (185), `--button-solid-border-width` (302), `--select-viewport-padding` (337) | `0` | A |
| `--segment-background` (178) | `transparent` | A |
| `--segment-padding` (179), `--floating-border-width` (215), `--workspace-pane-border-width` (216) | `--sb-border-width` | B→`--border-width` |
| `--segment-item-padding` (182), `--button-padding-sm/md/lg` (296-298) | SB 773-775 | A: `--button-padding-sm/md/lg` = `calc(var(--spacing) * 2.5)`, `calc(var(--spacing) * 3)`, `calc(var(--spacing) * 4)`; `--segment-item-padding` B→`--button-padding-sm` |
| `--segment-font-size` (183) | `--sb-text-xs` | B→`--text-xs` |
| `--segment-selection-shadow` (187), `--project-dot-shadow` (255), `--avatar-status-shadow` (256), `--user-menu-presence-shadow` (257), `--sidebar-photo-shadow` (258), `--sidebar-logo-shadow` (259) | `none` | A |
| `--menu-row-height` (189) | `--sb-menu-item-height` (formula SB 740) | A (same formula over `--spacing`, `--text-xs`) |
| `--sidebar-row-height` (190) | `--sb-sidebar-item-height` 2rem | A |
| `--sidebar-icon-size`, `--sidebar-action-icon-size` (197-198) | `--icon-size-md` | B→`--icon-size-md` |
| `--toolbar-icon-size` (199) | `--sb-header-button-size` 30px | A |
| `--request-toolbar-height`, `--workspace-header-height` (200-201) | `--sb-header-height` 3rem | A `--header-height`; both B→ |
| `--request-row-height` (202) | `--sb-size-inner-xlarge` 44px | B→`--size-inner-xlarge` (A, new: `--size-inner-tiny/small/medium/xlarge` = 24/28/32/44px, read by product, §5) |
| `--request-group-gap` (203), `--badge-sm-padding` (210), `--badge-icon-padding-start` (323), `--menu-item-gap` (335) | `calc(--sb-spacing * 2)` | B→`--space-2` |
| `--badge-sm-icon-padding-start` (324) | `--sb-spacing` | B→`--space-1` |
| `--badge-padding-x` (322) | `* 3` | B→`--space-3` |
| `--popover-padding` (339) | `* 4` | B→`--space-4` |
| `--menu-item-padding` (334), `--select-item-padding` (338), `--textarea-padding` (343) | multi-value `calc` | A (same expressions over `--spacing`) |
| `--request-avatar-size` (205) | `--badge-sm-height` | B→`--badge-sm-height` |
| `--request-title-line-height` (206) | `--sb-text-sm--line-height` | B→`--text-sm--line-height` |
| `--badge-sm-height` (209) | `max(…)` formula | A (same formula) |
| `--badge-sm-font` (211) | `--sb-text-badge` 9px | A |
| `--badge-sm-gap` (212), `--badge-gap` (326) | `--sb-badge-gap` .25rem | A `--badge-gap`; other B→ |
| `--badge-font-weight` (213) | medium | B→`--weight-medium` |
| `--badge-height` (320) | `--sb-badge-height` formula | A |
| `--badge-padding-y` (325) | 3px | A |
| `--checkbox-size` (214) | 1rem | A |
| `--menu-font-weight` (234) | normal | B→`--weight-normal` |
| `--button-icon-sm/md/lg` (299-301) | `--icon-size-sm/lg/xl` | B→ |
| `--button-disabled-opacity` (303) | `--sb-opacity-disabled` .5 | A `--opacity-disabled`; B→ |
| `--button-raised-shadow`, `--button-default-shadow` (304-305) | SB 780-781 (edge strength / colour per mode, SB 778-786) | A (formulas and per-mode edge inputs copied as-is) |
| `--button-solid-sheen` (311), `--button-secondary-sheen` (312) | SB 776 / 777, 784 | A |
| `--menu-padding` (332) | .25rem | A |
| `--menu-shadow` (336), `--popover-shadow` (340) | `--sb-shadow-md` | B→`--shadow-raised` |
| `--dialog-shadow` (342, dark 346) | md light / xs dark | A: `:root` `var(--shadow-raised)`, `.dark` `var(--shadow-xs)` |
| `--overlay` (360) | `--overlay-backdrop` | B→ |

### 4.3 tweakcn slots and how Lane uses each

| tweakcn slot | Lane reads it? | Value to set in tweakcn (light / dark) |
|---|---|---|
| `--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--primary-foreground`, `--muted-foreground`, `--destructive`, `--destructive-foreground`, `--ring`, `--sidebar`, `--chart-1..5` | **yes** (see tables) | `--sb-background`, `--sb-foreground`, `--sb-card`, `--sb-secondary`, `--sb-primary-solid`, `--sb-primary-solid-foreground`, `--sb-foreground-light`, `--sb-destructive`, `--sb-destructive-foreground`, the **opaque** ring base (`oklch(.7 .15 157.5)` / `oklch(.76 .15 157.5)`), `--sb-background`, `--sb-chart-1..5` |
| `--card-foreground`, `--popover-foreground`, `--secondary(-foreground)`, `--muted`, `--accent(-foreground)`, `--border`, `--input`, `--sidebar-foreground/primary/primary-foreground/accent/accent-foreground/border/ring` | preview only | flattened values from #81 §3 |
| `--font-sans`, `--font-mono` | yes | Geist / Geist Mono |
| `--font-serif` | no | — |
| `--radius` | yes (whole scale) | `0.5rem` |
| shadow inputs → `--shadow-xs` | yes (resting only) | x 0, y 1px, blur 2px, spread 0, opacity 0.1, colour #000 (both modes) |
| other `--shadow-*` | no | — |
| `--tracking-normal` | yes | `0em` |
| `--spacing` | yes (also all Tailwind spacing) | `0.25rem` |

### 4.4 Tailwind `@theme` (today `globals.css:8-39`) after the switch

- **tweakcn's `@theme inline`** supplies the `--color-*` names for its slots.
- **The bridge's `@theme inline`** (loaded later, so it wins):
  - `--color-muted-foreground: var(--muted-foreground)`, the same as tweakcn.
  - `--font-weight-normal/medium/semibold` → `--weight-*`.
  - `--radius-xs..4xl` → additions radii.
- **Dropped as unused** (no product class uses them): `--color-secondary` (tweakcn's own stands), `--color-input`, `--color-ring`, `--text-type-ui*`.
- Classes in use today: `text-muted-foreground`, `text-foreground`, `text-destructive-foreground` (→ `text-destructive`, §2.5) and `font-medium`.
- **Base styles.** `globals.css:43-64` stay in `globals.css` (plumbing, no values) but read `--text-*`, `--text-*--line-height`, `--weight-*`, `--tracking-*` and `--spacing` instead of `--sb-*`.
- **tweakcn's own `@layer base`** paints `body` with `--background` / `--foreground` (same as `globals.css:46-47`). It also puts `outline-ring/50` on `*`. That has no visible effect: every `outline` in `src/**/*.css` names its own colour, and focus uses Arc's `!important` rule.

### 4.5 Clerk (`src/components/auth/clerk-appearance.ts`): all 17 colour keys plus type, radius and spacing

All 17 colour keys come from `@clerk/ui` `appearance.d.ts:678-777`. Stage A keeps today's pixels. The C1 and C2 fixes are visible changes, so they are listed for Stage B.

| Clerk key | Today (line) | Stage A | Stage B fix (#82) |
|---|---|---|---|
| `colorPrimary` | `--primary-background` (6) | `var(--primary)` | keep for the button. **C1:** give link elements (`footerActionLink`, `formResendCodeLink`, `identityPreviewEditButton`, `formFieldAction`) `color: var(--accent)` (ink) |
| `colorPrimaryForeground` | `--primary-label` (7) | `var(--primary-foreground)` | — |
| `colorForeground`, `colorInputForeground`, `colorNeutral` | `--foreground` (8, 12, 17) | `var(--foreground)` | — |
| `colorMutedForeground` | `--text-secondary` (9) | `var(--muted-foreground)` | — |
| `colorBackground` | `--surface` (10) | `var(--card)` | — |
| `colorInput` | `--input-background` (11) | `var(--input-background)` | — |
| `colorBorder` | `--border` (13) | `var(--border)` | — |
| `colorMuted` | `--surface-muted` (14) | `var(--surface-muted)` | — |
| `colorRing` | `--focus-outline` (15) | `var(--focus-outline)` | — |
| `colorDanger` | `--danger` (16) | `var(--destructive)` | — |
| `colorSuccess` | unmapped (Clerk `#22C543`) | additions `--clerk-success: #22C543` | **C2:** → `var(--success)` |
| `colorWarning` | unmapped (`#F36B16`) | additions `--clerk-warning: #F36B16` | → `var(--warning)` |
| `colorShimmer` | unmapped (`rgba(255,255,255,.36)`) | additions `--clerk-shimmer` (that literal) | keep, or tie to a Lane shimmer |
| `colorShadow` | unmapped (black) | `var(--shadow-color)` (tweakcn, `#000000`) | — |
| `colorModalBackdrop` | unmapped (`#000` at .27) | additions `--clerk-backdrop` (that literal) | → `var(--overlay-backdrop)` |
| `fontFamily` | `--font-body` (18) | `var(--font-sans)` | — |
| `fontFamilyButtons` | unmapped | `var(--font-sans)` | — |
| `fontFamilyMono` | unmapped | `var(--font-mono)` | — |
| `borderRadius` | `--radius-control` (19) | unchanged (bridge) | — |
| `spacing` | `calc(var(--sb-spacing) * 4)` (39) | `var(--space-4)` | — |
| `fontSize`, `fontWeight` (40-41, 95-96) | `--text-*`, `--weight-*` | unchanged | — |
| `headerTitle.fontWeight` (50) | `--sb-font-weight-semibold` | `var(--weight-semibold)` | — |

- Mapping the three Clerk-default colours as additions literals makes the C2 check ("no unmapped Clerk colour key") pass in Stage A without a visible change. They are named `--clerk-*` so Stage B can delete them.
- **Tests:** `clerk-appearance.test.ts` also reads `--sb-spacing` and must be updated.

## 5. Local token redefinitions and direct `--sb-*` reads

### 5.1 Module CSS that redefines a theme name

From a scan of every `.css` under `src/` (outside `src/styles/` and `foundation.css`) for declarations of any of the 280 names or `--sb-*`:

| File:line | What | Must move? |
|---|---|---|
| `src/components/requests/request-picker-avatar.module.css:17-22` | `--picker-background` → `--sb-color-{blue,green,purple,yellow,orange,red}-300` | **Yes (C5).** Add Lane additions `--avatar-tone-blue/green/violet/amber/coral/slate`, light (SB palette step 300, light block) **and** dark (the dark block, e.g. blue-300 `hsl(214 59.4% 15.3%)`, SB 448). Module reads become renames. (`slate` → `red-300` looks like a slip, C5; fix it in Stage B, not A.) |
| `src/components/requests/request-labels.module.css:8` | `color: var(--sb-color-purple-900)` | **Yes (C5).** Additions `--label-purple` (`hsl(272 51% 54%)`, both modes) |
| `src/components/requests/request-rows.module.css:143` | `--control-height-md: var(--sb-size-inner-small)` | Re-point to `--size-inner-small` in A. Whether this compact density is legitimate is a Stage B question |
| `src/components/requests/tasks/data-table-toolbar.module.css:36,52,66` | `--control-height-sm` → `--sb-size-inner-small/xlarge`; `:52` `--text-sm: var(--text-xs)` | Re-point in A; Stage B question (named in #79). `:36,66` also depend on `:root[data-visual-system="lane"]` (keep that attribute in A) |
| `data-table-toolbar.module.css:8` | `--radius-control: var(--radius-pill)` | Alias only; Stage B question |
| `src/components/requests/detail.module.css:76` | private `--property-row: var(--sb-size-inner-xlarge)` | Re-point |
| `request-rows.module.css:33-41,53` | selected-row aliases of `--request-property-*`, `--project-*` → `--selection-*` | No (context aliases, no values) |
| `src/components/arc/blocks/workspace-sidebar/workspace-sidebar.module.css:222-227` | `--project-*` → `--selection-icon` | No (Arc, alias) |
| `src/components/requests/request-picker-layout.module.css:2,23` | `--popover-padding` → `--menu-padding` / `--space-4` | No (alias) |
| `src/components/projects/project-dot.module.css:2-7`, `intake-form.module.css:5-6,12` | private aliases of theme hooks | No |
| `src/app/globals.css:8-39` | Tailwind `@theme` → `--sb-*` | Replaced by tweakcn's and the bridge's `@theme`, §4.4 |
| `[data-theme="dark"]` blocks (C6): `workspace-sidebar.module.css:4,5,198,205`, `floating-button-group.module.css:23-29`, `user-menu.module.css:84`, `workspace-shell.module.css:13` | mode selectors outside the theme | Not in A, as long as next-themes keeps `attribute={["class","data-theme"]}` (`layout.tsx:90`). Deleting or rewriting the three Arc ones is optional and would update 3 existing adaptations |

So two files **must** move values into Lane additions (8 palette reads). Five files **re-point** sizes (no visible change).

### 5.2 Direct `--sb-*` reads to rename (32 `src` files + 2 scripts)

Renames (all values live in additions or tweakcn):

| Old name | New name |
|---|---|
| `--sb-spacing` | `--spacing` |
| `--sb-border-width` | `--border-width` |
| `--sb-font-weight-*` | `--weight-*` |
| `--sb-text-*` (and `--line-height`) | `--text-*` (same) |
| `--sb-tracking-tight` | `--tracking-display` |
| `--sb-tracking-normal` | `--tracking-normal` |
| `--sb-size-inner-*` | `--size-inner-*` |
| `--sb-table-head-height` | `--table-head-height` |
| `--sb-popover-width` | `--popover-width` |
| `--sb-opacity-disabled` | `--opacity-disabled` |
| `--sb-selection` | `--interaction-pressed` |
| `--sb-sidebar-width` | `--navigation-width` |
| `--sb-radius-sm` | `--radius-sm` |
| `--sb-font-mono` | `--font-mono` |
| `--sb-secondary` | drop |
| `--sb-color-*` | §5.1 |

Files:
- `src/app`: `globals.css`, `(app)/intake/intake-form.module.css`, `(app)/requests-overview.module.css`, `(app)/app-skeletons.module.css`, `privacy/privacy.module.css`.
- `src/components/auth`: `auth.module.css`, `clerk-appearance.ts`, `clerk-appearance.test.ts`, `clerk-profile.module.css`.
- `src/components/requests`: 15 `.module.css` (detail, intake-attachment-list, intake-launcher, measurement-date-dialog, measurement-plan-fields, measurement-plan-summary, request-agreement, request-labels, request-peek, request-picker-avatar, request-picker-layout, request-property-pickers, request-rows, request-selection, tasks/data-table-toolbar).
- `src/components/settings`: `profile.module.css`, `settings.module.css`.
- `src/components/shell`: `notification-bell.module.css`, `page-strip.module.css`, `use-sidebar-resize.ts`, `workspace-search-pane.module.css`, `workspace-shell.module.css`.
- Arc: `src/components/arc/blocks/settings-command/settings-command.module.css` (§6 count).
- Scripts:
  - `scripts/brand/brand-assets.mjs:35-42` reads `supabase-tokens.css` and its `[data-visual-system]` selectors. Repoint it to `theme.css` `:root` / `.dark` (C7).
  - `scripts/design-system/token-contract(.test).mjs` hard-codes the old file names (`:8,25-29`). It is replaced by the #79 check.

## 6. Arc adaptations and pixel identity

### 6.1 Arc files that need recorded adaptations

| File | Why | Ledger effect |
|---|---|---|
| `src/components/arc/blocks/settings-command/settings-command.module.css` | reads `--sb-border-width` ×6, `--sb-font-weight-medium` ×1, `--sb-spacing` ×25 | already adapted; new `localSha256` + one line in `arc-sources.md:406` |
| `src/components/arc/foundation.css` | **none** with the recommended layer import (file unchanged) | — (if option (a) from C4 were chosen instead: 1 updated adaptation removing the dark / `[data-accent]` / series blocks) |
| `workspace-sidebar.module.css`, `floating-button-group.module.css`, `user-menu.module.css` | only if the optional C6 clean-up is done | 3 updated adaptations (optional) |

- **Required: 1** updated adaptation. The ledger stays at 67 records / 62 adapted. No pristine Arc file needs to change.
  - The 5 pristine files are `motion-tokens.ts` ×2, `segmented-control.tsx`, `skeleton.tsx` and `use-today.ts`.
- **Not Arc, but needed:** `scripts/design-system/arc-source-check.mjs:46` must accept the layered import.
- **Note for the #79 check:** `src/components/arc/motion-tokens.ts:2-24` holds Arc's JS motion values (durations 0.12-0.48s, springs). These sit outside the theme file and don't match Lane's CSS durations (e.g. `--duration-standard` is 200ms in CSS, `standard: 0.24` in JS). They are pristine Arc and drive Motion springs, so the check needs a recorded exemption for them. Lining them up is Stage B.

### 6.2 Can Stage A be pixel-identical?

**Yes, for every value Lane and Arc paint**, given the choices above: ratio radii, md/lg shadows in additions, see-through colours in additions, `--accent` bridged, `foundation.css` layered, and tweakcn seeded with Lane's values (§4.3). All tweakcn-sourced colours except two are inside sRGB, so tweakcn's internal hex holds them exactly as an 8-bit screen shows them.

**The unavoidable differences:**

1. **Two colours outside sRGB lose a little saturation on wide-gamut (P3) screens**, such as Nikhil's Mac:
   - dark `--primary` (`oklch(.43627 .11 157.5)`, red channel −17.6/255 → `#006338`);
   - `--destructive-foreground` (`oklch(.99 .0112 25)`, red 259/255 → `#fff9f8`), in both modes.

   The OKLab differences are 0.0054 and 0.0059: "side by side only" on #81's scale, and likely none on sRGB screens, which clip the same way. Avoiding it would mean keeping those two out of tweakcn. That isn't recommended, because `--primary` is the main brand slot.
2. **Before Geist finishes loading,** text falls back to the generic `sans-serif` instead of next/font's metric-matched `Geist Fallback`. tweakcn writes `Geist, sans-serif`; today's stack is `Geist, "Geist Fallback", …` (`supabase-tokens.css:651`). This is a brief font swap and layout shift on first load only. Once Geist has loaded, the text looks the same. It goes away if tweakcn's font field accepts a typed stack (`Geist, "Geist Fallback", sans-serif`); confirm when seeding.
3. **The tweakcn preview won't match Lane** for radius steps (sm/md/lg/xl), shadows other than `xs`, and the preview-only slots (§4.3). This is not a change in Lane. It matters for Stage B and the readability warning: Nikhil will see the true result only in Lane.

**If Nikhil instead wants tweakcn's own radius and shadow formulas to drive Lane** (so that the tweakcn preview matches Lane), these become visible changes:
- **Corners.** Pick `--radius: 10px` so controls stay 8px. Then:
  - checkbox and segment items: 5.33 → 6px;
  - cards and dialogs: 10.67 → 10px;
  - content pane: 16 → 14px.

  xs / 2xl / 3xl / 4xl, the menu item (6px) and the button-by-size radii have no tweakcn step.
- **Shadows.** Popovers, menus, tooltips and the light-mode dialog would use tweakcn `md` (`0 1px 3px /.1, 0 2px 4px -1px /.1` with the seed above) instead of `0 4px 6px -1px /.1, 0 2px 4px -2px /.1`. Dropdowns, sheets and the switch thumb would use `lg` (`… 0 4px 6px -1px`) instead of `0 10px 15px -3px /.1, 0 4px 6px -4px /.1`. That means tighter, shallower elevation.

This is a product choice for the sign-off ticket (#85), not a technical constraint.

### 6.3 Out of scope for this ticket but touched by the mapping

- **`global-error.tsx` (C3)** imports the same chain (`:10-13`). It must import `globals.css` only, like the layout. It stays light-only until C3's script is added.
- **`data-visual-system="lane"`** is still read by `data-table-toolbar.module.css:36,66`, `requests-overview.module.css:8` and `brand-assets.mjs:41-42`. Keep the attribute in Stage A. Its removal belongs to #79's "leftovers" question.
- **Docs that change at build time:** `docs/design-system/supabase-tokens.md` (retire), `docs/design-system/arc-sources.md` (settings-command line, layered foundation), and `AGENTS.md` / `DESIGN.md` wherever they name `supabase-tokens.css` as the single source.
