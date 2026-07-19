---
name: Lane
description: Gallery-neutral productivity UI with deliberate Desk Tab accents and an independently authored Night Studio mode.
colors:
  gallery-canvas: "oklch(0.9839 0.0025 345.2)"
  gallery-surface: "oklch(0.9978 0.0011 17.2)"
  gallery-recessed: "oklch(0.9648 0.005 345.3)"
  gallery-raised: "oklch(0.9798 0.005 345.3)"
  graphite-ink: "oklch(0.2087 0.0111 346.5)"
  graphite-muted: "oklch(0.4798 0.0113 352.7)"
  gallery-hairline: "oklch(0.8794 0.0087 349.3)"
  control-boundary: "oklch(0.621 0.0145 353.4)"
  focus-raspberry: "oklch(0.6009 0.1506 350)"
  action-raspberry: "oklch(0.4795 0.1193 349.8)"
  identity-ink: "oklch(0.2294 0.0181 62.9)"
  identity-raspberry: "oklch(0.7802 0.1194 350.1)"
  identity-persimmon: "oklch(0.7973 0.1229 43.4)"
  identity-chartreuse: "oklch(0.84 0.1295 118)"
  night-canvas: "oklch(0.1491 0.0056 355.7)"
  night-surface: "oklch(0.1908 0.0052 355.4)"
  night-raised: "oklch(0.2357 0.0064 0.6)"
typography:
  family: "Geist, ui-sans-serif, system-ui, sans-serif"
  mono: "Geist Mono, ui-monospace, monospace"
  scale: "11 / 12 / 13 / 14 / 16 / 22 / 24 / 28 / 30 / 36px"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
spacing:
  base: "4px"
  scale: "4 / 8 / 12 / 16 / 24 / 32px"
---

# Lane Design System

## 1. Creative north star: Gallery Neutral + Desk Tabs

Lane should feel like a well-run design studio presented with gallery-level restraint: clean near-neutral working surfaces, graphite structure, and a few physical marker tabs that make important states easy to find. It is not parchment, a lifestyle mood board, or decorative stationery. Its material quality comes from low-chroma surfaces, generous legibility, deliberate boundaries, and tactile but compact controls.

The colour strategy is **restrained full palette**: neutrals carry almost the entire product; three named accents appear only when they communicate interaction or product state. Primary actions remain graphite in light mode and near-white in dark mode. This keeps Lane enterprise-grade and keyboard-fast without becoming generic gray software.

The foundation has five non-interchangeable layers. **Material** defines canvas and elevation. **Text** defines reading hierarchy. **Interaction** defines control boundaries and focus. **Semantic feedback** defines error, warning, success, and information. **Identity** identifies people and invitations. One token serves one layer; routes and components must not borrow a colour from another layer because it happens to look similar.

Plane remains the strict reference for information architecture, composition, interaction, states, responsive behaviour, keyboard behaviour, and component organization. Plane does not supply Lane's colours, vocabulary, product scope, or code. Local `src/components/ui` source and semantic Tailwind tokens are the implementation truth.

## 2. Light mode: Gallery Light

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Canvas | `--background` | `oklch(0.9839 0.0025 345.2)` | App and auth background |
| Surface | `--card` | `oklch(0.9978 0.0011 17.2)` | Cards and primary work areas |
| Recessed | `--recessed` / `--muted` | `oklch(0.9648 0.005 345.3)` | Secondary and inset regions |
| Raised | `--raised` / `--popover` | `oklch(0.9798 0.005 345.3)` | Menus and transient overlays |
| Ink | `--foreground` | `oklch(0.2087 0.0111 346.5)` | Primary text and graphite actions |
| Muted ink | `--muted-foreground` | `oklch(0.4798 0.0113 352.7)` | Supporting text; 4.5:1 minimum |
| Disabled surface | `--disabled` | `oklch(0.9407 0.005 345.3)` | Unavailable actions without opacity |
| Disabled ink | `--disabled-foreground` | `oklch(0.5001 0.01 349.5)` | Unavailable labels and icons; 4.5:1 minimum |
| Hairline | `--border` | `oklch(0.8794 0.0087 349.3)` | Decorative dividers and passive grouping only |
| Control boundary | `--control` / `--input` | `oklch(0.621 0.0145 353.4)` | Inputs, selects, outlined actions, and selection indicators |

Gallery Light is near-neutral rather than cream. The decorative hairline may be subtle because it does not carry an affordance. Interactive boundaries must use `--control` or its `--input` alias and maintain at least 3:1 contrast; never strengthen a weak control with a route-level gray or opacity override.

## 3. Dark mode: Night Studio

Dark mode is authored separately, not produced by swapping light values. The physical scene is a design team reviewing briefs in a dim studio under a desk lamp.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Canvas | `--background` | `oklch(0.1491 0.0056 355.7)` | Deep neutral graphite page |
| Surface | `--card` | `oklch(0.1908 0.0052 355.4)` | Main working surface |
| Raised | `--raised` / `--popover` | `oklch(0.2357 0.0064 0.6)` | Menus, overlays, and raised controls |
| Ink | `--foreground` | `oklch(0.9397 0.0035 354.7)` | Primary dark-mode text |
| Muted ink | `--muted-foreground` | `oklch(0.7211 0.0075 354.9)` | Supporting text |
| Disabled surface | `--disabled` | `oklch(0.2357 0.0064 0.6)` | Unavailable actions on graphite |
| Disabled ink | `--disabled-foreground` | `oklch(0.6304 0.0094 349.4)` | Unavailable labels and icons; 4.5:1 minimum |
| Hairline | `--border` | `oklch(0.2992 0.008 351.4)` | Decorative dividers and passive grouping only |
| Control boundary | `--control` / `--input` | `oklch(0.5011 0.0112 352.7)` | Inputs, selects, outlined actions, and selection indicators |

Depth in Night Studio comes from the 14.9% → 19.1% → 23.6% surface ladder. Do not add shadows to compensate for weak surface separation. Accent chroma is reduced in dark mode so tabs remain luminous without vibrating.

The theme control offers **System, Light, and Dark**, follows the operating system by default, is stored locally per browser, and does not require account or database state.

## 4. Desk Tab accents

| Accent | Light | Dark | Locked meaning |
| --- | --- | --- | --- |
| Persimmon | `oklch(0.5011 0.1384 47.1)` | `oklch(0.7511 0.1205 48.4)` | Warning, attention, and solution-shaped gate results |
| Chartreuse | `oklch(0.4493 0.0992 124.6)` | `oklch(0.7805 0.1002 124.8)` | Constructive/problem-framed and completed states |
| Raspberry focus | `oklch(0.6009 0.1506 350)` | `oklch(0.7391 0.1108 349.5)` | Focus boundary and current selection |
| Raspberry action ink | `oklch(0.4795 0.1193 349.8)` | `oklch(0.7391 0.1108 349.5)` | Readable links, indicators, and hybrid gate results |

Accents behave like labels attached to work, not paint poured over the interface. Use a strong accent for a small marker, icon, focus ring, or compact state; use its soft wash for a selected surface. Never use colour as the only carrier of meaning: every state also needs a text label or familiar icon.

Raspberry is the interaction signature, but light-mode focus and readable action ink are intentionally different values. `--focus` / `--ring` owns the boundary; `--brand` owns readable foreground use. They may share a dark-mode value only because that value passes both contrast jobs. Raspberry is not the default button colour.

## 5. Typography, density, and elevation

- Geist is the only interface family. Geist Mono is only for IDs, invite links, compact status tags, and scan-friendly metadata. Product type uses only regular 400, medium 500, and semibold 600.
- Display is 36px/42px semibold with -0.025em tracking. Auth and Onboarding titles are 28px/34px on mobile and 30px/36px from the small breakpoint upward. Product page titles are 22px/28px on mobile and 24px/30px from the small breakpoint upward. Headings balance and stop at 22ch.
- Section titles are 16px/24px semibold. Long-form Request reading copy is 16px/25px with a 68ch maximum and pretty wrapping. Default UI copy is 14px/21px. Strong row and control copy is 14px/20px medium or semibold.
- Labels are 13px/18px medium; supporting copy is 13px/19px; metadata is 12px/17px; micro IDs and compact status tags are 11px/16px medium in Geist Mono. Routes use the semantic `text-type-*` tokens or the shared Typography primitive instead of raw sizes.
- Utility controls are 32px on desktop. Product controls are 36px on desktop and expose a 44px mobile touch target. Form controls are 44px on desktop and 48px on mobile. Identity rows are at least 52px on desktop and 60px on mobile. Shared primitives own those metrics.
- Spacing follows a 4px base with 4 / 8 / 12 / 16 / 24 / 32px steps.
- Related fields stay 16–24px apart, major content groups are 32px apart, and labels sit 8px above their controls. Actions do not wrap; leading icons and trailing actions keep fixed lanes.
- Typography and density are theme-invariant: Gallery Light and Night Studio use identical sizes, weights, line heights, wrapping, spacing, and control geometry. Only semantic colour tokens change.
- Surfaces are flat. Use tonal steps and one-pixel hairlines. Shadows are reserved for transient overlays that genuinely float.
- No nested cards. Divide a surface with spacing, a hairline, or a tonal change.

## 6. Component rules

### Buttons

- Auth and Onboarding use one shared action component with four semantic roles. Screens choose only the role, label, optional Lucide icon, and state. They may not override action colour, opacity, height, radius, spacing, icon size, or loading treatment.
- Primary: graphite fill on Gallery Light; near-white fill in Night Studio. It is 48px on mobile and 44px from the small breakpoint upward.
- Secondary: a 44px bordered control for a meaningful but non-primary operation such as resending an email.
- Tertiary: a 44px quiet, full-width alternative for Back, Skip, switching paths, or repeating a completed flow. It remains visually identical wherever it appears.
- Utility: a compact 32px high-utility action such as Copy or Join inside a row.
- A validation message never makes an otherwise available primary action look disabled. The person must be able to correct the field and submit again without the CTA changing visual role.
- In Night Studio, active primary and compact high-utility actions use the near-white fill with dark ink. Never place a near-black control on the near-black canvas and expect its border to carry the affordance.
- Disabled controls use `--disabled` and `--disabled-foreground`, never blanket opacity. Disabled labels and icons maintain at least 4.5:1 contrast against the disabled surface. A disabled tertiary action remains transparent and uses disabled ink. A disabled action must still be identifiable at a glance in both themes.
- Loading disables interaction, sets `aria-busy`, retains the action's semantic visual role, and replaces only the leading icon and label needed to explain progress.
- Secondary actions use the semantic control boundary; tertiary actions are borderless. Both use semantic surfaces and text tokens, never arbitrary gray values.
- Focus: visible 3px raspberry ring. Active controls may move down 1px.
- Required states: default, hover, focus-visible, active, disabled, loading, and error where relevant.

### Selection controls

- Radio groups and selects use Lane's shared Base UI-backed source. A route may supply labels, descriptions, values, icons, and validation copy; it may not rebuild keyboard handling or selection indicators.
- Radio groups remain controlled for their entire lifetime. Arrow keys move and select within the group; Home and End reach the first and last option. The whole option row is the hit target and receives the visible 3px raspberry focus ring.
- Radio rows are 56px minimum on mobile and 58px from the small breakpoint upward. They keep fixed 18px icon and indicator lanes around a flexible text lane so wrapped labels cannot misalign the controls.
- Unselected radios use a clearly visible 1.5px control outline, not the page hairline. Both themes must meet the same legibility standard.
- Selected radio rows use `--brand-soft`, a brand boundary, raspberry Lucide icon, stronger label weight, and a solid `--brand` indicator with a high-contrast Lucide check. Checked state is also exposed semantically; colour is never the only signal.
- Select triggers are 48px on mobile Auth/Onboarding surfaces and 44px from the small breakpoint upward. Closed, keyboard-focus, open, disabled, and invalid states use semantic tokens and the same 10px radius.
- An open select keeps a 3px raspberry ring after focus moves into the popup, and its Lucide chevron rotates upward. The popup opens below and start-aligned to the trigger, matches its width, uses the raised surface, and keeps its transient shadow minimal.
- Select options are at least 44px high. The selected option uses `--brand-soft` plus a raspberry Lucide check; the highlighted option uses the neutral accent surface. Optional descriptions sit below the 14px label at 12px/17px without changing the trigger's short display label.
- Disabled radios and selects use `--disabled` and `--disabled-foreground`, never blanket opacity. Their labels, outlines, checks, and chevrons remain identifiable in both themes.
- Required visual baselines cover radio selected/focus, select open/selected, and select disabled across desktop/mobile and Gallery Light/Night Studio. Contract tests reject hand-built Auth radios and opacity-based disabled states.

### Icons, notes, and status

- Lucide is the only interface icon family. Never combine two hand-authored symbols into a new envelope, warning, send, lock, or success glyph.
- Use one familiar icon for one action: `Send` for sending, `Copy` for copying, `Link` for a usable invite link, and `LoaderCircle` for pending work.
- Icons occupy a fixed 16px or 18px slot with `flex-shrink: 0`. An icon that qualifies an entire two-line message is vertically centred to that message; a first-line-only marker aligns to the first text baseline.
- Remove icons that merely decorate explanatory copy. A recovery note such as “retry later from Settings” needs no warning or information glyph when the preceding state already explains the failure.
- Status colour supports a precise label; it never compensates for an unclear icon or contradictory copy.

### Feedback and status

- Lane has exactly three feedback layers: attached field validation, persistent contextual feedback, and transient toast. The nearest owner wins; one outcome appears in one location.
- `src/components/ui/feedback.tsx` owns persistent and inline feedback chrome. A route supplies only `kind`, optional `title`, copy, and `panel` or `inline` placement. Routes may not replace its icon, colour, surface, border, spacing, live-region role, or alignment.
- Semantic mapping is locked: error = `CircleAlert`, success = `CircleCheck`, warning = `TriangleAlert`, information = `Info`, and external loading status = `LoaderCircle`. All use Lucide at 1.8 stroke. Panel icons occupy a fixed 32px tile with an 18px glyph; inline icons occupy a fixed 18px lane with a 16px glyph.
- Feedback tokens are authored independently for Gallery Light and Night Studio: semantic foreground, soft surface, border, and icon-tile surface must all remain explicit. Never use route opacity, an inherited black stroke, or `color-mix()` to manufacture semantic contrast.
- A panel is for an outcome or condition that must remain visible in context. Its icon is vertically centred against the complete copy block, including wrapped descriptions. An inline message belongs beside the form or action that owns the failure.
- Field validation remains attached beneath its control through `FieldError`, uses no icon, and is not duplicated as form feedback. Plain explanatory copy also uses no icon; information is not automatically a warning.
- Sonner is reserved for outcomes whose originating row or control leaves or changes context. Toasts reuse the same semantic Lucide mapping and tokens, include a close control, and use a specific title plus recovery-oriented description when needed.
- Error feedback uses an assertive alert and persists until corrected. Success, warning, information, and loading use polite status announcements. Loading feedback never duplicates a button that already exposes its loading label and `aria-busy`.
- Required visual baselines cover panel and inline feedback across desktop/mobile and Gallery Light/Night Studio. Contract tests reject Auth-specific feedback copies, route-owned semantic icons, and icon-bearing field errors.

### Rows and identity

- Member, pending-invite, onboarding-workspace, Request, notification, and comment lists use one shared row geometry. A route supplies content and actions; it may not rebuild the alignment lanes.
- Every row has a fixed 32px leading lane, a 12px gap, a flexible `min-width: 0` copy lane, and a fixed trailing-action lane. Empty leading or action slots remain present when adjacent rows need the alignment.
- Titles use 14px/20px semibold text, descriptions use 12px/17px muted text, and compact metadata may use 11px/16px. Identity rows are at least 60px on mobile and 52px from the small breakpoint upward. Flat hairline groups are the default; separate rounded cards are reserved for genuinely independent outcomes.
- Identity marks use Lane's shared Base UI Avatar source and a deterministic Desk Tab surface (raspberry, persimmon, then chartreuse). The same name or email always receives the same tone across onboarding, shell, settings, notifications, and comments.
- Identity colour is not semantic feedback colour. Initials and the Lucide invitation glyph always use the dedicated graphite `--identity-ink` on a dedicated identity-tab surface; they never reuse brand, warning, success, or their soft washes.
- The identity-tab fills and graphite ink are identical in Gallery Light and Night Studio so identity does not change with the theme. Every pair maintains at least 8:1 measured contrast at the 32px mark size.
- Neutral identity treatment is reserved for unknown or unavailable identity. A pending invitation uses the Lucide `Mail` glyph in the same deterministic 32px mark; it does not invent a separate avatar language.
- Long names, email addresses, CJK, RTL, emoji, and absent data must never move the leading or action lanes. Copy truncates only where the full value is available nearby; substantive Request and comment copy wraps.
- Essential row actions remain visible, keyboard reachable, and at least 32px on desktop / 44px on mobile where they are the sole touch target. Hover may strengthen an action but may not be the only way to discover it.
- Unread notifications use the same identity lane plus a labelled state and a small brand indicator. Colour is supportive; read/unread actions and accessible names remain explicit.
- Required visual baselines cover member and pending-invite rows plus Request, notification, and comment examples across desktop/mobile and Gallery Light/Night Studio. Contract tests reject route-owned avatar palettes and duplicated row geometry.

### Inputs and field chrome

- Text and password fields use Lane's shared Base UI `Field` and `Input` source. An Auth or Onboarding route supplies the label, value, helper or error copy, optional trailing link, and optional Lucide icon; it may not override control height, radius, padding, colour, focus, invalid, disabled, read-only, or password-toggle treatment.
- A field is one owned stack: 13px/18px medium label, 8px gap, control, then one 13px/19px message lane. Helper copy yields to the error instead of stacking beneath it. Base UI connects the label and the active description or error to the control.
- Auth and Onboarding text, email, and password controls are 48px on mobile and 44px from the small breakpoint upward, with 10px radius and 12px horizontal padding. Password and other trailing controls occupy a fixed 48px mobile / 44px desktop hit lane so they never compress the value.
- Inputs use semantic `input`, `card`, `background`, `ring`, `disabled`, and `disabled-foreground` tokens. `input` aliases the strong control boundary; the decorative `border` hairline is not an input affordance. Placeholder text uses the muted-foreground contrast floor.
- Focus uses the same visible 3px raspberry ring as actions and selection controls. Invalid uses a destructive border and ring plus precise field-specific copy; do not mark a field invalid for a form-level or network failure.
- Disabled and read-only are different. Disabled prevents interaction and uses the semantic disabled surface and ink without opacity. Read-only preserves legible foreground text on the muted surface and may use one familiar Lucide lock when the reason is not otherwise obvious.
- Password visibility uses only Lucide `Eye` and `EyeOff`, an accessible pressed-state label, and a disabled toggle whenever the field is disabled. Toggling visibility changes neither value nor layout and pointer activation keeps input focus.
- Validation appears on blur or submit, then clears while the person edits. Required visual baselines cover default, filled, focus, invalid, disabled, read-only, password-hidden, and password-visible states across desktop/mobile and Gallery Light/Night Studio.
- Selects follow the locked Selection Controls contract above. Other menus and popovers use the raised surface in dark mode and remain keyboard-operable.

### Navigation and lifecycle

- Current navigation uses the raspberry soft wash plus text/icon change; hover remains a neutral tonal step.
- A selected Request row uses that soft wash, its labelled status dot, and a fixed Lucide chevron lane without a decorative edge stripe. Do not add a coloured `border-left`, selection rail, or other ornamental bar.
- Open / In Progress / Done always retain their labels. Accent markers may support the label but never replace it.
- The Intake gate is the highest-expression surface: its three classifications may use the three desk-tab accents, with explanation and confirmation remaining primary.

## 7. Refusals

- No surveillance-dashboard visual language: no utilization charts, activity graphs, last-active treatments, rankings, or performance colour scales.
- No generic AI-startup gradients, glass, cobalt-by-default, purple glow, or decorative colour blobs.
- No parchment, faux paper grain, doodles, tape, or stationery cosplay.
- No colour used simply to make an empty area interesting.
- No inverted dark mode, translucent dark borders, or shadow-based dark elevation.
- No new component until the matching Plane pattern, local UI source, and official shadcn registry have been checked.

## 8. Paper and implementation workflow

Paper is where approved light and dark foundations, components, journeys, breakpoints, and meaningful states are documented. The global colour foundation was approved on 2026-07-18 and is the source for the semantic roles recorded here; full pre-GTM journey and breakpoint coverage remains a separate audited workstream. Paper is a reviewable visual specification, not a code source. A Paper edit never changes production automatically.

The permanent flow is: inspect Plane → read Lane's local component → check official shadcn when uncertain or missing → specify material states in Paper → implement with semantic Tailwind tokens and Base UI composition → verify keyboard, focus, accessible names, responsive behaviour, loading, empty, success, and failure states. Only verified code may be deployed.
