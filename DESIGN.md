# Design System — DesignQ

**Last Updated:** 2026-04-03
**Status:** Approved — ready for implementation

---

## Product Context

- **What this is:** AI-native design operations command center for design leaders
- **Who it's for:** Design leads and heads at startups with 5–15 person design teams
- **Space/industry:** DesignOps SaaS — competes with Jira, Linear, Notion
- **Project type:** Web app dashboard (Next.js, App Router)

---

## Aesthetic Direction

- **Direction:** Warm Editorial Minimalism
- **Decoration level:** Intentional — subtle, purposeful. No gradients, no blobs, no decorative noise.
- **Mood:** A tool that feels like it was built *by* a designer, *for* designers. Warm without being soft. Precise without being cold. The only DesignOps tool that earns trust from design leaders on first look.
- **Anti-patterns to avoid:** Purple gradients, icon grids in colored circles, centered everything, uniform border-radius on all elements, generic stock-photo hero sections.

---

## Typography

### Fonts

| Role | Font | Weight range | Usage |
|------|------|-------------|-------|
| UI / All text | **Satoshi** | 300–700 | Headings, body, labels, nav, buttons — everything human-authored |
| Data / Precision | **Geist Mono** | 400–500 | Request IDs, phase tags, timestamps, version numbers, file sizes |

**Loading:** Satoshi via Fontshare CDN (`https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&display=swap`). Geist Mono already in stack via Next.js font optimization.

**The rule:** If a human wrote it → Satoshi. If the system generated it → Geist Mono.

Geist Mono appears on:
- Request IDs: `REQ-042`
- Phase/stage labels: `DESIGN · VALIDATE`
- Timestamps in activity feeds: `Mar 28, 2:45 PM`
- Figma version numbers: `v3`
- File sizes, counts, commit refs

### Type Scale

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `text-xs` | 11px | 400 | Badges, timestamps, metadata |
| `text-sm` | 13px | 400/500 | Body, labels, nav items |
| `text-base` | 15px | 400/500 | Card titles, primary content |
| `text-lg` | 18px | 600 | Page titles, section headings |
| `text-xl` | 24px | 700 | Stat numbers in left pane |
| `text-2xl` | 30px | 700 | Empty state headings |

---

## Color

### Approach
Restrained — one accent color, warm neutrals, semantic colors for status only.

### Core Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#F8F6F1` | App background — warm ivory |
| `--bg-surface` | `#FFFFFF` | Cards, right dock, modals |
| `--bg-subtle` | `#F0EDE6` | Icon rail, left global pane |
| `--bg-hover` | `#EAE6DE` | Row/nav hover states |
| `--text-primary` | `#1C1917` | Warm near-black — all primary text |
| `--text-secondary` | `#78716C` | Labels, metadata, descriptions |
| `--text-tertiary` | `#A8A29E` | Placeholders, timestamps, faint text |
| `--border` | `#E7E2DA` | Card edges, panel dividers |
| `--border-strong` | `#D4CFC7` | Active separators, input focus |
| `--accent` | `#2E5339` | Deep forest green — buttons, active nav, CTAs |
| `--accent-subtle` | `#EAF2EC` | Accent backgrounds, selected states |
| `--accent-text` | `#FFFFFF` | Text on accent backgrounds |

### Status Colors
Desaturated, warm-toned — designed to coexist with the cream base without clashing.

| Status | Color | Hex |
|--------|-------|-----|
| Requested | Warm gray | `#A8A29E` |
| In Progress | Muted blue | `#7DA5C4` |
| In Review | Warm amber | `#D4A84B` |
| Approved | Muted sage | `#86A87A` |
| Handed Off | Muted lavender | `#A394C7` |

### Dark Mode
Defer — nail the light design first. When added: desaturate all surfaces, reduce accent to 80% opacity, warm grays shift cooler.

---

## Spacing

- **Base unit:** 4px
- **Density:** Comfortable — not cramped, not airy
- **Scale:** `2` `4` `8` `12` `16` `24` `32` `48` `64` `96`

---

## Layout

### Shell Structure
Four fixed zones — never collapses unless user toggles.

```
┌────────┬──────────────────┬──────────────────────────┬───────────────┐
│  Rail  │   Global Pane    │      Main Canvas         │  Detail Dock  │
│  48px  │     256px        │       flex-1             │    400px      │
│ always │  always visible  │  board / requests / etc  │  slides in    │
└────────┴──────────────────┴──────────────────────────┴───────────────┘
```

### Icon Rail (48px)
- App logo/mark at top
- 1px separator
- Nav icons (Board, Requests, Idea Board, Team, Settings)
- User avatar at bottom
- Background: `--bg-subtle`
- Active icon: `--accent` fill

### Left Global Pane (256px)
Always visible. Shows team pulse at a glance.
- **Stats row:** Active requests count + Overdue count (Satoshi 700, 24px)
- **My Work:** Requests assigned to current user (REQ-ID in Geist Mono)
- **Recent Activity:** Last 3–5 activity items, condensed
- Background: `--bg-subtle`
- Border right: `--border`

### Main Canvas (flex-1)
- Background: `--bg-base`
- Padding: 24px
- Contains: current view (Requests list, Board, Idea Board, etc.)
- Page title: Satoshi 600 18px

### Right Detail Dock (400px)
- Slides in when a request is clicked
- Pushes main canvas inward (does not overlay)
- Close button top-right (×)
- Background: `--bg-surface`
- Border left: `--border`
- Contains: full request detail (tabbed: Details / Activity / Files)

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 4px | Badges, status tags, mono chips |
| `radius-md` | 6px | Inputs, small buttons, pane items |
| `radius-lg` | 8px | Cards, request rows |
| `radius-xl` | 12px | Panels, modals, right dock |

---

## Motion

- **Philosophy:** Quiet and intentional. Motion serves comprehension, not delight.
- **Easing:** `ease-out` for entrances, `ease-in` for exits, `ease-in-out` for moves
- **Right dock:** slides in `ease-out 200ms` — pushes canvas, no overlay
- **Route transitions:** left pane content fades `150ms`
- **Row hover:** background shift `100ms ease-out`
- **No springs, no bounce** — refined and quiet throughout

---

## Implementation Scope (Phase 1)

Apply this design system to these screens first:

1. **Requests list** — main canvas view, request rows, filters
2. **Request detail** — right dock with tabs (Details, Activity, Files)
3. **Left global pane** — stats, my work, activity
4. **Global shell** — icon rail, layout zones, CSS tokens

Apply to remaining screens (Idea Board, Dashboard, Auth) after Phase 1 is validated.

---

## CSS Custom Properties (globals.css)

```css
:root {
  /* Backgrounds */
  --bg-base: #F8F6F1;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F0EDE6;
  --bg-hover: #EAE6DE;

  /* Text */
  --text-primary: #1C1917;
  --text-secondary: #78716C;
  --text-tertiary: #A8A29E;

  /* Borders */
  --border: #E7E2DA;
  --border-strong: #D4CFC7;

  /* Accent */
  --accent: #2E5339;
  --accent-subtle: #EAF2EC;
  --accent-text: #FFFFFF;

  /* Status */
  --status-requested: #A8A29E;
  --status-in-progress: #7DA5C4;
  --status-in-review: #D4A84B;
  --status-approved: #86A87A;
  --status-handed-off: #A394C7;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* Radius */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* Layout */
  --rail-width: 48px;
  --pane-width: 256px;
  --dock-width: 400px;
}
```

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-03 | Warm ivory base `#F8F6F1` not pure white | Differentiates from Jira/Linear, resonates with design-oriented users |
| 2026-04-03 | Deep forest green `#2E5339` accent | Warm, earthy, premium — not the standard SaaS blue/purple |
| 2026-04-03 | Satoshi for UI text | Geometric warmth, premium feel, not overused — pairs with mono contrast |
| 2026-04-03 | Geist Mono for data strings only | Adds techy precision without fighting the warm aesthetic |
| 2026-04-03 | Fixed 3-panel layout (no collapse) | Design leaders need persistent team pulse — always-on awareness |
| 2026-04-03 | Right dock pushes canvas (no overlay) | Preserves spatial context — user sees what they came from |
| 2026-04-03 | Instrument Serif rejected | Too editorial/fashion — wrong register for a SaaS tool |
| 2026-04-03 | Copper accent `#C4704A` rejected | Too lifestyle/fashion — forest green is warmer and more grounded |
| 2026-04-03 | Dark mode deferred | Nail the light design first, add dark toggle after validation |
