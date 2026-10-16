# Supabase tokens: Lane's visual source of truth

Decided by Nikhil on 2026-10-13. Lane's colour, type, radius, spacing, shadow, motion and component-size values are Supabase Studio's design tokens, copied exactly. They replace the Lane-authored primitives of 2026-10-10 (`lane-primitives.css`, deleted) and every older Linear-derived value.

## Files

| File | Role |
| --- | --- |
| `src/styles/supabase-tokens.css` | The tokens, as `--sb-*` custom properties. The only place a visual value is written. |
| `src/styles/lane-arc-theme.css` | Maps every Arc foundation token (all 97) and every Lane hook onto `--sb-*`. |
| `src/app/globals.css` | Tailwind theme and Studio's base layer, both reading the tokens. |
| `src/lib/fonts.ts` | Geist and Geist Mono. |

Product CSS outside `src/components/arc/` uses Arc hooks or `--sb-*` tokens only: no hex, `oklch()`, `color-mix()`, px, rem or ms literals for design values. The only literals left are mechanics, not design: the 1px screen-reader-only pattern, `0s` transition steps, reduced-motion `0.01ms`, and media/container query thresholds, because CSS cannot read custom properties there. Viewport breakpoints sit on Supabase's Tailwind breakpoints (480 and 640px) except the 880px sidebar auto-collapse, which `use-sidebar-resize.ts` and its stories share and which stays as it was.

## Source

`supabase/supabase` at `64a6aa908594975646d157def9e7a74940634d8f` (master, 2026-10-13), Apache-2.0:

- Colour: `packages/ui/build/css/source/semantic.css` with `themes/light.css` and `themes/dark.css` (hue 157.5; contrast 0.53 light, 0.5 dark). Supabase derives these at runtime from a few inputs; Lane stores the resolved results. Alpha overlays (`muted`, `accent`, borders) stay as alpha, as in Supabase.
- Palette and charts: `packages/config/css/colors.css` and `charts.css`, every Radix family copied verbatim as `--sb-color-*`.
- Radius and type sizes: Tailwind v4 defaults with `apps/studio/styles/globals.css` overrides (radii ×4/3: sm 5.33px, md 8px, lg 10.67px, xl 16px; text-2xl 22px, 3xl 28px, 4xl 34px; font-weight-normal 450).
- Shadows and motion: Tailwind v4 shadows, `control-surface-shadows` from `packages/config/css/utilities.css`, eases and durations from `animations.css` and the Button component.
- Component sizes: `packages/ui` Button `SIZE` (26/34/38/42/50px) and `SIZE_INNER` (24/28/32/36/44px), dropdown items (28px), Badge (17px, 9px uppercase text), Checkbox (16px), sidebar items (32px) and width (13rem), table rows (16px cell padding, 52px rows; 40px heads), and Studio's 48px header with 30px header buttons.

## Deliberate differences

- **Typeface.** Studio uses Inter, Manrope and Source Code Pro; Lane uses Geist and Geist Mono (Nikhil, 2026-10-13). Weights and sizes are Studio's.
- **Accessibility.** Values are pixel-exact even where they miss WCAG AA (Nikhil, 2026-10-13). This overrides the contrast and touch-target floor in `PRODUCT.md` for visual values: light warning text (`warning-600`, 3.05:1), dark destructive text (3.36:1), translucent control outlines (about 1.4:1) and 9px badge text ship as Supabase has them. The 44px coarse-pointer overrides were removed. Storybook's axe run keeps every rule except `color-contrast`; the story contrast floors were removed. Keyboard focus rings remain (Supabase draws them too).
- **Composition stays Lane's.** Tokens set values, not layout. Lane keeps its inset content pane (Supabase's inset sidebar variant, rounded-xl), its row anatomy, and its rule that avatars match the height of the metadata badges beside them (now 17px).

## Role mapping (summary)

| Lane / Arc role | Supabase token |
| --- | --- |
| Page canvas, sidebar | `dash-sidebar` (`background`) |
| Content pane, cards | `surface-100` (`card`) |
| Menus, popovers, raised surfaces | `overlay` (`secondary`), border `border-overlay`, hover `overlay-hover` |
| Text, secondary, muted | `foreground`, `foreground-light`, `foreground-lighter` |
| Borders | `border`, `border-muted`, `border-strong` |
| Row hover, selected row | `surface-200`, `muted` (Supabase table rows) |
| Current or pressed item | `selection` |
| Links, Done glyph | `primary` |
| Main button | `primary-solid`, hover `primary-solid-hover`, label `primary-solid-foreground` |
| Checkbox and radio | `foreground` fill with `background` glyph; unchecked `control/25` |
| Status badges | Badge variants: `warning-600`/`warning/10`/`warning-500`, `brand-600`/`brand/10`/`brand-500`, `destructive`/`destructive/10`/`border-destructive` |
| Focus | `ring`, 2px with 2px offset |
| Project markers, type dots | Palette step 900; picker avatars step 300 |
| Controls sm/md/lg | Button tiny/small/medium: 26/34/38px |
| Request rows, group headers | Table row 52px (square), table head 40px |
| Menu rows | Dropdown item 28px, item radius 6px |
| Elevation resting/raised/floating | `shadow-xs`/`shadow-md`/`shadow-lg` |
| Motion fast/standard/considered | 150/200/300ms; control ease `cubic-bezier(.22,1,.36,1)`, enter ease `cubic-bezier(.16,1,.3,1)` |

`lane-arc-theme.css` lists every mapping with the Supabase component it copies.

## Arc internals left as Arc wrote them

The scope chosen on 2026-10-13 was tokens plus Lane's own CSS. Arc's locked source (`src/components/arc/`, hash-checked by `scripts/design-system/arc-source-check.mjs`) reads the tokens above for colour, radius, type and elevation, but still contains 742 literal values in 30 files: 586 sizes and spacings, 45 radii, 45 motion values, 59 colour mixes, 4 type and 3 shadow values, plus the JS springs in `src/components/arc/lib/motion-tokens.ts`. The largest are `blocks/workspace-sidebar` (186), `notification-center` (95), `user-menu` (66), `sortable-data-table` (51) and `drawer` (44).

Visible consequences: Arc buttons keep their own padding and a visible border on the secondary variant where Supabase uses an inset shadow; Arc badges do not uppercase or track their text; and one control radius serves every button size where Supabase grows radius with height. Replacing these means recording each file as an Arc adaptation in `docs/design-system/arc-source-hashes.json` and `arc-sources.md`.

## Updating

When Supabase changes, re-resolve the values from the files above at a new pinned commit, replace `src/styles/supabase-tokens.css`, and update the SHA here. New Arc components pick up Supabase values for every foundation token automatically; any literal inside a new component, or a new foundation token, needs mapping.
