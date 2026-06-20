---
name: Lane
description: Engineered, keyboard-fast design-ops UI — monochrome calm with one evergreen signal.
colors:
  cool-paper: "oklch(0.988 0.003 250)"
  slate-ink: "oklch(0.20 0.012 255)"
  near-black-slate: "oklch(0.21 0.015 255)"
  slate-mist: "oklch(0.96 0.006 250)"
  slate-fog: "oklch(0.965 0.005 250)"
  slate-gray: "oklch(0.51 0.012 255)"
  hover-slate: "oklch(0.95 0.008 250)"
  signal-evergreen: "oklch(0.50 0.115 160)"
  alert-clay: "oklch(0.58 0.18 25)"
  hairline: "oklch(0.91 0.006 250)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.near-black-slate}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-destructive:
    backgroundColor: "{colors.alert-clay}"
    textColor: "{colors.alert-clay}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.slate-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  badge:
    backgroundColor: "{colors.near-black-slate}"
    textColor: "{colors.cool-paper}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Lane

## 1. Overview

**Creative North Star: "The Instrument Panel"**

Lane is a precision instrument, not a poster. Every control is deliberate, legible, and instant; the chrome recedes so the work — a design request, the shared board, the gate's reframing — is the only thing on stage. The spiritual cousin is Linear: monochrome-forward, keyboard-fast, engineered restraint. Surfaces are cool-slate neutrals from near-white to near-black, and the entire palette runs in grayscale **except one color**: a deep evergreen that behaves like a single live indicator on a panel. It lights up only where something is genuinely active or important — the intake gate's verdict, focus rings, selected/active states, links. Its rarity is the entire point.

This system explicitly rejects the surveillance-dashboard look it exists to oppose (no charts, gauges, activity graphs, or "last active" affordances), gamified PM SaaS (no streaks, badges, confetti, progress-pressure), the generic AI-startup costume (no purple gradients, glassmorphism, gradient text, hero-metric templates, or per-section eyebrow kickers), and joyless enterprise gray density (no cramped gray-on-gray, no tiny text). It is quiet because quiet is trustworthy, and dense only where density buys legibility.

Depth is conveyed by **tonal layering and hairline rings, never by shadow**. The palette is authored and locked in OKLCH; do not re-tweak it.

**Key Characteristics:**
- Monochrome cool-slate surfaces; one evergreen signal used on ≤10% of any screen.
- Flat by default — hairline `ring-1` borders and tonal steps stand in for elevation.
- One typeface, Geist, across everything; hierarchy comes from size and weight, never a second family. No serifs.
- Compact, keyboard-fast controls (32px default height); visible evergreen focus ring everywhere.
- Light is the default; dark is a full, first-class mode, not an afterthought.

## 2. Colors

A cool-slate grayscale (hue ~250–255) carrying the whole interface, interrupted by exactly one saturated evergreen signal.

### Primary
- **Near-Black Slate** (`oklch(0.21 0.015 255)`): the default action color. Solid primary buttons, the badge default, high-emphasis text. Monochrome-forward — most actions are this near-black, *not* the brand color.

### Secondary
- **Signal Evergreen** (`oklch(0.50 0.115 160)`; dark mode `oklch(0.64 0.13 162)`): the one signature. Reserved for the gate moment, focus rings, active/selected states, and links. Never a generic button color.

### Neutral
- **Cool Paper** (`oklch(0.988 0.003 250)`): body background and card surface. A true cool near-white — *not* a warm cream/sand.
- **Slate Ink** (`oklch(0.20 0.012 255)`): primary foreground text.
- **Slate Mist** (`oklch(0.96 0.006 250)`): secondary surfaces and secondary buttons.
- **Slate Fog** (`oklch(0.965 0.005 250)`): muted surfaces; **Slate Gray** (`oklch(0.51 0.012 255)`) for muted/placeholder text — this is the contrast floor, never lighter.
- **Hover Slate** (`oklch(0.95 0.008 250)`): hover/selected neutral surface.
- **Hairline** (`oklch(0.91 0.006 250)`): borders, inputs, dividers. The primary elevation tool.

### Tertiary
- **Alert Clay** (`oklch(0.58 0.18 25)`): destructive/error only, and almost always *tinted* (`alert-clay/10` background with clay text), not a loud solid red.

### Named Rules
**The One Signal Rule.** The evergreen appears on ≤10% of any screen. If two evergreen things are visible at once, one of them is wrong. Its scarcity is what makes it read as "live."

**The True-Neutral Rule.** Backgrounds are cool (hue ~250), never warm. The cream/sand/beige body is forbidden; warmth is not Lane's voice.

## 3. Typography

**UI / Display Font:** Geist (with `ui-sans-serif, system-ui, sans-serif`)
**Mono Font:** Geist Mono (with `ui-monospace, monospace`)

**Character:** One family, no pairing. Geist is the precise instrument face that runs the whole panel; hierarchy is built from size and weight, not a second typeface. This is deliberate — a single, well-tuned sans reads as engineered restraint, and avoids the accidental-near-match trap of two similar families.

### Hierarchy
- **Display** (Geist 600, `2.25rem` / `text-4xl`, line-height 1.1, letter-spacing -0.02em): the gate verdict and other peak moments. Page titles and empty states use the same family one step down (`text-3xl`). Fixed rem sizes, not fluid — product UI views at consistent DPI.
- **Title** (Geist 500, 1rem, line-height 1.4): card titles, section headers, dialog titles.
- **Body** (Geist 400, 0.875rem, line-height 1.5): the default UI text size. Cap prose at 65–75ch.
- **Label** (Geist 500, 0.875rem): buttons, form labels, nav items — medium weight carries emphasis without size.
- **Mono** (Geist Mono, 0.8125rem): IDs, tokens, code, timestamps where monospacing aids scanning.

### Named Rules
**The One-Family Rule.** Geist carries everything. There are no serifs and no second sans anywhere in Lane; if a heading needs more presence, reach for size, weight, or tracking — never another typeface.

## 4. Elevation

Lane is **flat by default**. There are no box-shadow tokens. Depth is built from two tools: tonal layering (the `Cool Paper → Slate Mist → Slate Fog` step between background, surface, and recessed areas) and **hairline rings** — cards carry `ring-1` at `foreground/10`, inputs and dividers use the `Hairline` border. A card footer is distinguished by a `border-t` and a `Slate Mist/50` fill, not a drop shadow.

### Named Rules
**The No-Shadow Rule.** If you reach for `box-shadow` to separate two surfaces, you've skipped the right tool. Use a hairline ring or a tonal step instead. Shadows read as 2014-era UI and as the AI-glassmorphism tell; both are forbidden. The single permitted exception is a transient overlay (dropdown/dialog/toast) that genuinely floats above the page — and even there, keep it minimal.

## 5. Components

### Buttons
- **Shape:** gently rounded (`10px`, `rounded-lg`); compact `32px` default height (`h-8`), `text-sm` medium.
- **Primary:** Near-Black Slate fill, Cool Paper text; hover lightens to `primary/80`. The everyday action.
- **Outline:** Cool Paper fill, Hairline border, Slate Ink text; hover fills Slate Fog. The common secondary.
- **Ghost:** transparent; hover fills Slate Fog. For low-emphasis and icon actions.
- **Destructive:** *tinted* — `alert-clay/10` fill with Alert Clay text, hover deepens to `/20`. Never a loud solid red.
- **Hover / Focus / Active:** all states transition; `focus-visible` shows a 3px evergreen ring (`ring/50`) plus border; `active` nudges down 1px (`translate-y-px`) for a tactile press.

### Cards / Containers
- **Corner Style:** `14px` (`rounded-xl`).
- **Background:** Cool Paper (`bg-card`).
- **Elevation Strategy:** `ring-1` at `foreground/10` — a hairline, not a shadow (see Elevation).
- **Internal Padding:** `16px` (`md`); footers get a `border-t` and `Slate Mist/50` fill.
- **Note:** nested cards are forbidden. Use tonal steps or hairlines to subdivide.

### Inputs / Fields
- **Style:** transparent fill, Hairline border, `10px` radius, `32px` height, `text-sm`.
- **Focus:** evergreen border + 3px evergreen ring (`ring/50`).
- **Placeholder:** Slate Gray — must meet body contrast, never lighter "for elegance."
- **Error / Disabled:** `aria-invalid` swaps to Alert Clay border + ring; disabled drops to 50% opacity with a muted fill.

### Badges
- **Shape:** full pill (`rounded-4xl`), `20px` tall, `text-xs` medium.
- **Variants:** default (Near-Black Slate), secondary (Slate Mist), outline, ghost, and tinted destructive. Use for lifecycle state and metadata — but pair color with a label/shape (see Do's & Don'ts), never color alone.

### Navigation
- App-shell sidebar in Geist. Items are ghost-styled at rest; the **active item** is the one place the evergreen signal earns its keep (active text/indicator). Hover fills Slate Fog. Fully keyboard-operable with a visible focus ring.

### The Intake Gate (signature component)
The product's defining surface. When a request is classified (problem / solution / hybrid) and reframed, this is the moment the evergreen signal is allowed to lead and the verdict is set at the largest Geist display weight. It should feel like a sharp, helpful senior colleague delivering a considered reframe — confident, never a spinner-and-wizard gimmick. This is the one screen permitted extra craft and presence; everything else stays quiet so the gate can speak.

## 6. Do's and Don'ts

### Do:
- **Do** keep the evergreen signal on ≤10% of any screen — gate, focus, active/selected, links. Everywhere else is grayscale.
- **Do** convey elevation with hairline `ring-1` borders and tonal steps (`Cool Paper → Slate Mist → Slate Fog`).
- **Do** build heading hierarchy from Geist's size and weight alone; never introduce a serif or a second typeface.
- **Do** give every interactive element a visible evergreen `focus-visible` ring and full keyboard operability (WCAG 2.2 AA floor, AAA where feasible).
- **Do** pair lifecycle color with a label or shape (Open / In Progress / Done), so state never depends on hue alone.
- **Do** keep controls compact and instant (32px default), with `active:translate-y-px` for tactile feedback.

### Don't:
- **Don't** build anything that reads as a **surveillance dashboard** — no charts, gauges, activity graphs, "last active," or utilization. This is the line Lane exists to hold.
- **Don't** add **gamified PM SaaS** affordances — no streaks, badges-as-rewards, confetti, leaderboards, or progress-pressure.
- **Don't** ship the **generic AI-startup look** — no purple gradients, glassmorphism, gradient text (`background-clip: text`), hero-metric templates, or tiny uppercase tracked eyebrows above sections.
- **Don't** drift into **enterprise gray density** — no cramped gray-on-gray, sub-`0.875rem` body text, or placeholder text below the Slate Gray contrast floor.
- **Don't** use `box-shadow` to separate surfaces (transient overlays excepted); use a hairline ring or tonal step.
- **Don't** introduce a warm cream/sand/beige background; Lane's neutrals are cool (hue ~250).
- **Don't** use the evergreen as a generic button color, or nest cards.
