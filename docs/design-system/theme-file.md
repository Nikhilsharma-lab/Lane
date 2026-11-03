# The theme file: Lane's one source of look

Decided 2026-10-22 (spec [#87](https://github.com/Nikhilsharma-lab/Lane/issues/87), built in #91). Every colour, font, corner, shadow, size and motion value Lane paints is written in one file: `src/styles/theme.css`. Nothing else holds a visual value. This replaces the 2026-10-13 Supabase token setup (`supabase-tokens.css` and `lane-arc-theme.css`), which is deleted.

## Lane palette and namespace (2026-11-02)

Nikhil approved wiring the reviewed preview into the actual app. The complete
Polar-mapped export was pasted through the existing theme CLI, and the corresponding
Lane additions were updated in place. This is a source-grounded export in tweakcn
format, not an export from a saved tweakcn account. See [provenance and exact mapping](lane-tokens.md).
The blue accent, neutral surfaces and semantic colour roles now match that preview;
fonts, spacing, radii and motion retain the reviewed values. This supersedes the
older palette decisions, while the one-file editing contract still applies.

## The files

| File | What it is | Who edits it |
| --- | --- | --- |
| `src/styles/theme.css` | The theme. Top half: tweakcn's export. Bottom half: **Lane additions**. | Top half: re-paste only. Bottom half: Lane token edits. |
| `src/styles/theme-bridge.css` | Plumbing only. Points the names Arc and Lane's screens already use at the theme's names. Holds no values. | Only when a new Arc component or screen needs a name the theme doesn't have yet. |
| `src/app/globals.css` | Loads the theme, Arc's foundation (in a lower layer, so Arc's defaults can never paint over the theme) and the bridge. | Rarely. |
| `src/lib/fonts.ts` | Loads Geist and Geist Mono so the font names in the theme work. | Only when the font changes (see below). |

## The two halves of `theme.css`

**Top half: tweakcn's export.** Everything above the `/* Lane additions` comment is exactly what tweakcn's Code panel gives you (Tailwind v4, oklch): the Tailwind import, the light `:root` and dark `.dark` colours, fonts, corner radius, shadows, the `@theme inline` block and the base layer. Never edit it by hand. A re-paste replaces it entirely.

**Bottom half: Lane additions (`--lane-*`).** Everything below that comment is Lane's own: what tweakcn has no slot for. Each group has a one-line comment saying why it is there:

- Extra text, surface and line levels, including the see-through hairlines and washes (tweakcn drops transparency).
- Blue brand ink for links and interaction states, separate from semantic success (tweakcn's `--accent` is a grey hover).
- Focus ring geometry (2px outline, 2px away).
- Success, warning and info colours, so changing the brand colour never moves them.
- Project, avatar and label colours: fixed hues.
- Arc's neutral ramp and brand gradient.
- The three Clerk sign-in colours Lane never set, kept at Clerk's own values.
- Raised and floating (menu) shadows and the button edge, which tweakcn's shadow model can't make.
- Exact corner steps, written as ratios of tweakcn's `--radius`, so tweakcn's corner slider still moves every corner in proportion.
- Type sizes and weights, spacing steps, component sizes (buttons, rows, header, icons, badges) and motion.

**Two tweakcn names Lane does not paint with.** The bridge points `--accent` at the `--accent-ink` addition (Arc's `--accent` is brand ink; tweakcn's is a grey hover read only by its preview) and `--border` at the see-through `--hairline` addition (tweakcn exports drop transparency, so its `--border` is opaque). Both tweakcn values stay in the paste untouched.

Additions never reuse a name tweakcn exports (its `@theme inline` keys included), so a re-paste can't clash with them; `pnpm design:check` fails if one does. Anything that differs between light and dark has a value in both `:root` and `.dark`.

## Before the first real re-paste

The tweakcn half in the file today was **hand-written in tweakcn's export format** with Lane's current values (decision #84). It isn't saved in tweakcn yet. Do this once:

1. Run `pnpm theme:copy`. It copies Lane's current tweakcn half to your clipboard.
2. In tweakcn, open the editor, choose **Import**, paste, and import.
3. tweakcn's import loses shadow offsets and letter spacing, so check those two: shadow `0px 1px 2px 0px` at opacity 0.1, letter spacing `0em`. Fonts are Geist and Geist Mono.
4. **Save the theme in your tweakcn account** as "Lane". From then on, design in that saved theme.

## Trying a new look (one command)

Keep `pnpm dev` running and Lane open in the browser.

1. In tweakcn, change anything: colours, corners, shadows, or pick a whole preset.
2. Open **Code**, choose **Tailwind v4** and **oklch**, and click **Copy**.
3. Run `pnpm theme:paste`.

The browser updates on its own within a second, in light and dark (switch in Profile). The command replaces only the top half of `theme.css` and keeps the Lane additions, refreshes the tab colour and app icon, and runs the design check. Hard-to-read text colours are listed as warnings; they never block you.

- **Try another option:** copy a different theme in tweakcn and run `pnpm theme:paste` again. Repeat as often as you like.
- **Keep several options side by side:** save each one in tweakcn under its own name (for example "Lane – grey frame", "Lane – warm"). To switch, open it, Copy, `pnpm theme:paste`. You can also keep exports as files and paste one with `pnpm theme:paste path/to/option.css`.
- **Go back:** `pnpm theme:reset` returns the theme to the last committed version.
- **Keep one:** ask an engineer (or Claude) to commit it. Visible changes still go through the parity check: re-record with `LANE_E2E_ALLOW_REMOTE=1 pnpm theme-parity:record` and review the listed differences.

What tweakcn controls: page, sidebar, card and pop-up colours, text colours, the brand green, borders' opaque fallback, fonts, the corner slider and the resting shadow. What it doesn't control (kept in Lane additions): success/warning/Project/avatar colours, see-through hover and line colours, menu shadows, sizes and motion. Those change only by editing the bottom half.

If you change the font in tweakcn, an engineer also needs to load the new font in `src/lib/fonts.ts`; otherwise the browser falls back to a plain font.

## tweakcn quirks to remember

- **Keep the theme saved in tweakcn.** Importing an exported file back into tweakcn loses the shadow offsets and the letter-spacing. The saved theme in tweakcn is the real source; the CSS is a copy.
- **Transparency is dropped** in every export format except rgb. That is why Lane's see-through lines and washes live in Lane additions.
- **One radius, four corners.** tweakcn only exports small to extra-large corners (`--radius-sm` to `--radius-xl`) from one `--radius`. Lane's exact corner steps are in additions as `--lane-corner-*`, ratios of `--radius`; the bridge points the `--radius-*` names Arc, Lane and Tailwind read at them.
- **tweakcn's preview won't match Lane exactly** for corner steps, menu shadows and slots Lane doesn't use (tweakcn's grey `--accent`, the charts it previews).
- Lane sets dark mode with the `.dark` class tweakcn expects; your light/dark/system choice in Profile keeps working.

## Rules for code (enforced by `pnpm design:check`)

- Product CSS and JSX write no visual literals: no colour, px/rem, ms or font values. They read theme or bridge names. Mechanical exceptions only: the 1px screen-reader pattern, zero values, media/container query thresholds, SVG geometry, measured layout, and Arc animation geometry. JavaScript motion durations, eases, stagger and blur are a checked numeric adapter of Lane tokens; they may not drift.
- Only the theme file (and Arc's layered foundation) has dark-mode selectors (`.dark`, `[data-theme="dark"]`, `prefers-color-scheme: dark`). When a screen looks different in dark, give it a Lane additions token with a light and a dark value.
- The bridge holds only renames: no literals, calculations, colour mixing, keywords or dark-mode selectors. Every name it reads must be defined in `theme.css`.
- Non-binary opacity, stacking layers, text-relative dimensions and icon strokes read Lane tokens. Required variable references must resolve; component slots with explicit fallbacks and Radix-provided measurements are allowed.
- Every Arc foundation name must be defined by the theme or the bridge, so no Arc default can paint.
- Icons read `--icon-size` (roles xs to 2xl via `data-icon-size`); numeric icon sizes are rejected. Search inputs use Arc `SearchField`. Page CSS must not override shared control padding, corners or materials.
- `e2e/theme-parity.spec.ts` checks that pages paint the same resolved values as before the switch, in light and dark; the November 2 palette has its own frozen-role tests in `lane-theme.test.mjs`.

## Current verification boundaries

The November 2 source capture covered the signed-in dashboard in dark mode.
All 79 approved semantic colour mappings are checked against that capture; light
mode uses the frozen source definitions. The source inventory has 150 variables,
including unused library and Orbit values; those are reference material, not 150
colours that every Lane screen should paint. Typography, radii and motion retain
Lane's reviewed settings; the spacing base matches the source's Tailwind base.

The current palette retains three documented contrast warnings: destructive-button
text in light/dark (3.82:1), and muted text on the muted dark surface (4.36:1).
The token audit does not claim those pairs pass WCAG AA. Keyboard focus remains.

## Brand assets

`pnpm brand:assets` (`scripts/brand/brand-assets.mjs`) generates the favicon, app icons, web app manifest, browser tab colours (`src/app/theme-color.json`, read by the root layout and by `TabColour`, which switches the tab to Lane's resolved theme, the saved Profile choice) and Open Graph image from the theme file's light and dark `--background` / `--foreground` and Lane additions sizes, converted to hex because icon files are not CSS. `pnpm design:check` fails if a committed file differs from what the theme would produce. The mark is `LaneMark` in `src/components/auth/auth-shell.tsx`.

## History

2026-10-08 Geist preview and Linear review; 2026-10-09 Linear values in production; 2026-10-10 Lane-authored tokens (`lane-primitives.css`); 2026-10-13 Supabase Studio tokens (`supabase-tokens.css` mapped by `lane-arc-theme.css`, verification record in `supabase-controls-verification-2026-10-16.json`); 2026-10-22 one theme file. The older files are deleted; do not restore them.
