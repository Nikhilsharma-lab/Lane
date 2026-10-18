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
| Request rows, group headers | Request row 44px (inner-xlarge), table head 40px; both use rounded-md (8px), density and rounding approved 2026-10-16 |
| Menu rows | Dropdown item 28px, item radius 6px |
| Elevation resting/raised/floating | `shadow-xs`/`shadow-md`/`shadow-lg` |
| Motion fast/standard/considered | 150/200/300ms; control ease `cubic-bezier(.22,1,.36,1)`, enter ease `cubic-bezier(.16,1,.3,1)` |

`lane-arc-theme.css` lists every mapping with the Supabase component it copies.

## Arc internals left as Arc wrote them

The scope chosen on 2026-10-13 was tokens plus Lane's own CSS. Arc's locked source (`src/components/arc/`, hash-checked by `scripts/design-system/arc-source-check.mjs`) reads the tokens above for colour, radius, type and elevation, had 742 literal values in 30 files in the October 13 audit (historical count, not regenerated after the October 16 adaptations): 586 sizes and spacings, 45 radii, 45 motion values, 59 colour mixes, 4 type and 3 shadow values, plus the JS springs in `src/components/arc/lib/motion-tokens.ts`. The largest are `blocks/workspace-sidebar` (186), `notification-center` (95), `user-menu` (66), `sortable-data-table` (51) and `drawer` (44).

The October 16 shared-controls increment replaces the button padding, single-radius treatment and secondary border with sourced Supabase hooks, adds input state surfaces and badge spacing, and records the three CSS adaptations in `arc-source-hashes.json` and `arc-sources.md`. Badge case, type sizes, tracking and line heights remain Lane/Arc choices; this is visual-value integration, not identical Supabase component output.

## Updating

When Supabase changes, re-resolve the values from the files above at a new pinned commit, replace `src/styles/supabase-tokens.css`, and update the SHA here. New Arc components pick up Supabase values for every foundation token automatically; any literal inside a new component, or a new foundation token, needs mapping.


## Tasks 1–2 verification, 2026-10-16

The recorded commit resolves through GitHub's API; its committer timestamp is 2026-10-13T09:25:19Z. Exact blob identities, 278 light and 279 dark computed-colour comparisons, and source-backed geometry are in [the verification record](supabase-controls-verification-2026-10-16.json). All 557 compared colours match after removing earlier rounding. This covers the shared semantic colours, palette and mapped surface aliases; it is not a claim to have tested every component or chart token.

Corrected the 2xl/3xl/4xl radii to Studio's 4/3 scale. Button shadow edges now retain the source calculation instead of four-decimal approximations. The source expression uses contrast-border 0.30636225 in light and 0.275625 in dark. General elevation values and the 0.25rem spacing unit were checked against installed Tailwind v4 defaults; button materials, padding, size-specific radii, input states and badge spacing were checked against the pinned Supabase files.

Arc `secondary` keeps its existing low-emphasis purpose and maps to Supabase `default`; Arc `primary` and `danger` map to Supabase's corresponding filled treatments. Ghost keeps Arc's semantic low-emphasis treatment. Input keeps Arc's default 34px control size, label/help/error behavior, disabled treatment and plain composer appearance. Badge vertical padding and gap follow Supabase while existing typography remains: resulting heights need not equal Supabase's 17px uppercase badge. These are explicit composition/typography differences, not missing token sources.

Review: `Design review / Supabase controls / Review` in Storybook. `Verified Controls` checks rendered radius, material shadow, absence of a double border, badge padding, keyboard activation, text entry, invalid state and disabled/pending semantics. `Foundations / Arc application / Spacing And Shadows` shows the foundation values. Plain `Primitives / Controls` still opts out as an Arc reference.

Browser verification passed: 114 tests across six affected story files; dark/reduced-motion controls at 390px; dark controls/foundations at 768px; controls at 1024px. Light layout was visually inspected at 390/768/1024/1440px with no horizontal overflow; dark controls were visually inspected in the app browser. TypeScript, lint and source provenance checks passed. No hosted/provider verification or deployment was performed. Existing contrast exceptions remain; the existing disabled contrast rule was not broadened.

Both `pnpm build:storybook` and `pnpm build` passed with network access enabled for the existing Google Fonts dependency. The initial sandbox build could not fetch Geist. A mistakenly broad pre-change story run was stopped after failures in workspace-search, linear-primitives and request-detail stories; the focused 114-check run passed. Full-suite green is not claimed.

### Review refinement: badge breathing room and icons

Nikhil requested more horizontal padding on 2026-10-16 after reviewing the badges. Lane now maps default badge padding to three Supabase spacing units (12px per side), and compact badges to two units (8px). The original `--sb-badge-padding-x` remains the exact 5.5px source value; this is an explicit Lane composition choice for larger sentence-case labels. The controls review now includes all five badge tones with icons and leading-icon, trailing-icon and icon-only buttons using existing Arc APIs. The focused dark/390px controls test passed after this refinement.

Icon-pill refinement: leading padding is 8px (default) or 4px (compact), with trailing padding unchanged at 12px/8px. Text-only pills remain symmetric. The 4px icon-to-label gap is unchanged. All values use the Supabase spacing unit.


### Application adoption, 2026-10-16

Approved controls now apply through the existing global app import. Remaining shared surfaces were aligned with the same pinned source: menus use p-1 and rounded-item, root dropdown/select/popover shadow-md; dialogs use actual Studio bg-dash-sidebar and shadow-md (light)/shadow-xs (dark). Field variants share bg-field and border-control. Clerk's supported appearance variables now use the same primary action, input and focus colours. Arc handlers, semantics, motion, typography and existing composition remain; select keeps its trailing indicator with mirrored source insets. Icon-pill and text-only badge spacing remain as approved above.

Verification: source ledger, TypeScript, lint, both builds and 50 focused browser test executions passed. Screen smoke and manual responsive review covered Requests, detail, Intake, Profile and onboarding; local sign-in rendered with the green primary action. Broader runs stalled; Sidebar Project tree / Create Reveals Project failed on its missing new Project heading, so this is not full-suite or hosted verification. See the application checkpoint in `docs/superpowers/plans/2026-10-16-arc-supabase-design-system.md` for exact scopes and limitations.


## Global consumer enforcement — 2026-10-16

Supersedes the earlier exception for fixed Arc component CSS internals. Application and component styles now reference shared tokens, including fallbacks. Layout dimensions may be calculated as multiples of the spacing unit; this preserves Lane composition rather than copying Studio page layouts. Radii use the shared radius scale. Default body weight now follows the shared normal weight instead of local 400 declarations.

`pnpm design:check` now runs token-contract regression tests, a PostCSS consumer audit, a TypeScript AST audit of static JSX inline styles, and source provenance checks. The existing pull-request/main CI workflow already runs this command. Adding a component from a registry does not exempt it from the consumer audit. Source token definitions (`supabase-tokens.css`, Arc `foundation.css`) remain explicit sources; the mapping may compose semantic colours from Supabase tokens. Overlay and inverse-tooltip blends are Lane semantic compositions in that mapping, not claims of newly verified upstream values.

Exceptions are mechanical: responsive query thresholds, 1px screen-reader clipping, mask paint, zero values, proportional geometry, measured/resizable layout, SVG drawing geometry and JavaScript motion physics. Runtime calculations and utility classes still require review; the static guard is not a proof over arbitrary JavaScript.

`Foundations / Global token contract / Shared Values Propagate` changes the root Supabase spacing and radius tokens, asserts that sidebar padding, notification padding, avatar size and button corners update, then restores the theme.

### Shared icon sizing

Lucide icons and custom SVG icons marked `data-ui-icon` read `--icon-size`, falling back to `--icon-size-md`. The size roles xs/sm/md/lg/xl/2xl map to the existing Supabase 12/14/16/18/20/24px tokens. Use `data-icon-size` for a distinct role; omit it for the containing control's default. Button supplies its compact/default/large size to nested icons; Badge and EmptyState supply their own roles. Menu icon slots and selection spacers read the same size tokens.

Numeric `size`, outer SVG `width`/`height`, fixed Tailwind icon dimensions and unsupported roles are rejected by `pnpm design:check`, which already runs in CI. SVG viewBox/path/mask coordinates, proportional brand artwork and control-scaled checkbox marks remain geometry. Semantic colours and Arc animation are preserved. The source scan covers production JSX in app/components, including Lucide aliases and dynamic icon slots; arbitrary runtime-generated attributes still require browser review.

`Shared Icon Sizes` proves that changing source tokens updates standalone, nested-button and custom icons, while preserving their colours.

### Shared control ownership, 2026-10-18

Use Arc `SearchField` for search inputs, with `hideLabel` when the surrounding search surface provides the visual context. Do not duplicate its icon/input shell. `SegmentedControl` uses the pinned Supabase text-tone segmented ToggleGroup material through shared `--segment-*` roles; Arc retains its interaction and motion implementation.

Request property chips use compact secondary Button styling. Editable properties render Button; read-only properties render `Badge appearance="control"`, which composes the same CSS and remains a span. Regular informational badges retain their existing appearance. Page CSS must not override shared control padding, radius or material tokens.

The token audit now rejects native search inputs outside SearchField and component-role token definitions outside their shared component or theme owner. This includes button, input and segment roles and badge geometry roles; contextual semantic badge colours remain permitted. Supabase source tokens may not be redefined by components. Rendered stories separately cover search insets/clear focus, segmented material/keyboard operation, and matching read-only/editable property geometry. These checks prevent the observed drift patterns; arbitrary runtime-generated styling still requires review.

Verification for this increment: 60 affected browser stories passed, plus 11 focused responsive/reduced-motion executions; 16 token-audit tests, token/provenance audits, TypeScript, scoped lint and production build passed. Actual localhost search and Request detail were visually checked. This is local application evidence, not deployed verification. See `docs/superpowers/plans/2026-10-18-control-consistency.md`.
