# Lane tokens

Nikhil approved wiring the reviewed Polar preview into the actual app on 2 November 2026.
Use this reference when changing the product palette or comparing it with the capture.
Lane-owned globals use the `--lane-*` namespace. Arc and tweakcn keep compatibility
slots through the value-free bridge. Product CSS reads semantic names from `src/styles/theme.css` through
`src/styles/theme-bridge.css`. Never import the captured palette into product CSS.
The approved mapping now lives in the product theme. Typography, sizes and motion
retain the reviewed Lane values.

## Evidence and authority

The 2 November 2026 capture inspected the signed-in Polar sandbox Metrics page in
dark mode. It found 150 non-empty colour variables and 25 rendered property/colour
combinations. All 150 matched within one sRGB byte: 106 against Polar globals.css,
44 against its imported Tailwind 4.3.3 baseline. Browser serialization explains
that tolerance. This is not a match to a verified deployment commit.

Sources: [Polar globals.css](https://github.com/polarsource/polar/blob/main/clients/apps/web/src/styles/globals.css),
[Tailwind 4.3.3](https://github.com/tailwindlabs/tailwindcss/blob/v4.3.3/packages/tailwindcss/theme.css).
Captured files are frozen under [references/polar](references/polar/manifest.json).
Use the frozen files to reproduce the approved palette; public main can change.

- [All 150 variables](references/polar/polar-colours.csv): browser value, hex, source definition, source hex and comparison.
- [Resolved comparison](references/polar/polar-token-comparison.json): machine-readable evidence.
- [Preview mappings](references/polar/preview-mapping.json): every override in cascade order, including the secondary-text adjustment.
- [Polar source](references/polar/polar-source-globals.css): original light/dark declarations.
- [Imported baseline](references/polar/tailwind-4.3.3-theme.css): framework variables, not Polar-owned primitives.

Hidden menus, pointer states, other routes and Polar's light mode were not sampled.
The light preview uses source-defined colours. A declared variable is not evidence
that a visible element uses it. Never call this an exhaustive Polar design system.

## Which layer to use

Components use `--surface`, `--foreground`, `--text-secondary`, `--border` and other
existing semantic names. Components never read Polar primitives directly.
The bridge renames compatibility hooks to Lane tokens and contains no values.
`preview-mapping.json` freezes the reviewed mapping. The complete
[approved theme export](references/polar/approved-theme-export.css) was pasted through
`theme:paste`; matching Lane additions were updated in the same central file.
Browser Lab colours use their original source OKLCH definitions. The actual app
needs no preview attribute, palette switch or extra stylesheet. `design:check`
compares every mapped light/dark role with the capture.

```css
/* Correct: the installed Timeline consumes a semantic role. */
.segment { background: var(--border-strong); }
/* Incorrect in a component: locks it to one preview and theme. */
.segment { background: #292929; }
```

## Surface and text decisions

| Role consumed by components | Light preview backing | Dark preview backing |
| --- | --- | --- |
| `--background`, `--sidebar` | gray-50 | polar-950 `#090909` |
| `--surface` via `--card` | white | polar-900 `#111111` |
| `--surface-raised` via `--popover` | white | polar-900 `#111111` |
| `--surface-muted` | gray-100 | polar-800 `#181818` |
| `--input-background` | gray-50 | polar-800 `#181818` |
| `--foreground` | gray-900 | white |
| `--text-secondary` via `--muted-foreground` | gray-600 | polar-400 `#858585` |
| `--text-muted` | gray-600 | polar-400 `#858585` |
| `--border` via `--hairline` | gray-200 | polar-700 `#212121` |
| `--border-strong` | gray-300 | polar-600 `#292929` |
| `--primary` | blue-600 | blue-600 |
| `--success` | green-600 | green-400 |
| `--warning` | yellow-600 | yellow-500 |
| `--destructive` | red-500 | red-500 |

These are Lane-role mappings, not Polar's semantic aliases copied verbatim.
Polar's captured `--foreground` is polar-500, while prominent page text paints white.
The preview maps body text to white and secondary text to polar-400 for readability.
Do not replace that decision with the darker polar-500 simply because the token exists.
Status and project hues remain separate from the primary blue.

```text
What needs a background?
├── App canvas/sidebar → --background / --sidebar
├── Reading panel or thread → --surface
├── Floating menu → --surface-raised
└── Hover or selected row → existing interaction/selection semantic tokens

What needs ink?
├── Request title, body, active tab → --foreground
├── Supporting description or inactive tab → --text-secondary
├── Timestamp or count → --text-muted
└── Status meaning → --success / --warning / --danger with a text label
```

## Polar neutral primitives

| Step | 50 | 100 | 200 | 300 | 400 | 500 |
| --- | --- | --- | --- | --- | --- | --- |
| Hex | #d9d9d9 | #c9c9c9 | #adadad | #9e9e9e | #858585 | #757575 |

| Step | 600 | 700 | 800 | 900 | 950 |
| --- | --- | --- | --- | --- | --- |
| Hex | #292929 | #212121 | #181818 | #111111 | #090909 |

Never use Orbit tokens for the dashboard mapping: they are present in the stylesheet
but are a separate surface family. Never treat extension-injected colours as Polar.
For the remaining ramps, use the full CSV instead of inventing intermediate steps.

## Namespace and value ownership

- `src/styles/theme.css`: the standard tweakcn export followed by canonical
  `--lane-*` additions. Import/export slots such as `--background` remain standard
  so a future tweakcn paste works; `--lane-background` exposes that same value.
- `src/styles/theme-bridge.css`: compatibility names such as `--space-2`,
  `--surface` and `--radius-control` point to Lane-owned globals. No literals.
- Components: use a semantic Lane token or an existing compatibility hook.
  Never introduce a second palette or write `--polar-*` in runtime code.
- `scripts/design-system/lane-theme.test.mjs`: checks all approved colour mappings,
  the Lane namespace, undefined references and the frozen source hashes.

The November 2 audit also replaced the old green secondary accent/gradient/link
states with the captured blue ramp. Opacity, stacking levels, icon stroke and
text-relative sizing now live in Lane additions. The filter back-button animation
reads the shared size/spacing tokens. The export in [references/lane](references/lane/theme-export.css)
is the current Lane export; the original approved export remains frozen as evidence.

## Verify a change

Run `pnpm design:check` and inspect both app themes. Check title/body, secondary
text, form errors, selected rows, keyboard focus and disabled controls separately.
Verify rendered values as well as token definitions: aliases can be shadowed later.
Never rewrite the frozen capture to make a test pass; record an intentional new mapping separately.
See [Request pane composition](request-pane-composition.md) for component decisions.

## Spacing compatibility

Polar imports Tailwind's `--spacing: 0.25rem` base (see the frozen baseline).
Lane's theme already defines the same base, with `--space-1`, `--space-2` and
the remaining steps derived from it. Use those semantic steps in component CSS;
do not repeat rem/px values or introduce a second spacing scale. Request rows
use `--space-1` between the checkbox hit area and the code, and `--space-2`
between identity/text elements. Priority follows the title; never reserve an
empty priority column before the code. Colours, typography, radii and control
sizes continue to read the central theme/bridge; this adjustment adds no literals.
