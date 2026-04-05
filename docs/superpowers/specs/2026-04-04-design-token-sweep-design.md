# Design Spec: Token-First UI + Accessibility + Borrowed Techniques

**Date:** 2026-04-04  
**Status:** Approved  
**Scope:** globals.css token fixes + full component sweep (zero hardcoded values)

---

## Problem

1. `card.tsx` and `button.tsx` use default shadcn slate colors — not our design tokens
2. `request-list.tsx` has ~15 hardcoded hex values inline
3. `--text-secondary` and `--text-tertiary` fail WCAG AA contrast on our cream base
4. No tokens exist for elevation, shadow-borders, or section alternation
5. Future rebrand requires touching every component rather than editing one file

## Goal

A single `globals.css` edit should be able to fully retheme the product. Every color, shadow, radius, and spacing value used in components must reference a CSS custom property.

---

## Section 1: Token Changes in globals.css

### Contrast Fixes

| Token | Current | Proposed | Ratio on `--bg-base` | WCAG AA |
|---|---|---|---|---|
| `--text-secondary` | `#78716C` | `#6B6460` | 4.95:1 | ✅ |
| `--text-tertiary` | `#A8A29E` | `#706A65` | 4.6:1 | ✅ |

**Note:** Visual hierarchy between secondary and tertiary is maintained through font size and weight, not just darkness — correct typography practice.

### New Tokens (three borrowed techniques)

```css
/* Accent hover state */
--accent-hover: #264830;

/* Vercel: shadow-as-border — warm-tinted rgba, no actual border needed */
--shadow-border:       0 0 0 1px rgba(28, 25, 23, 0.08);
--shadow-border-hover: 0 0 0 1px rgba(28, 25, 23, 0.14);
--shadow-card:         0 0 0 1px rgba(28, 25, 23, 0.06), 0 1px 2px rgba(28, 25, 23, 0.04);

/* Notion: warm-white section alternation */
--bg-section: #F2EFE9;

/* Linear: elevated surface for modals, right dock */
--bg-elevated: #FDFCFA;

/* Accessible input boundary (meets WCAG 3:1 for UI components) */
--border-input: #97918A;

/* Focus ring */
--focus-ring-color: var(--accent);
```

---

## Section 2: Component Sweep Rules

### The Rule
No component may use:
- Any hardcoded hex color (e.g. `#78716C`, `#FEE2E2`)
- Any Tailwind color utility that references the slate/zinc/stone palette (e.g. `bg-slate-200`)
- Any hardcoded shadow, border, or radius that isn't from a token

Every value must trace back to `globals.css`.

### Exceptions
- Status badge colors (`--status-*`) are tokens — use them via `var()`
- Priority colors (P0–P3) need dedicated tokens added: `--priority-p0-bg`, `--priority-p0-text`, etc.
- Phase colors (predesign amber, design lavender, dev blue, track sage) need tokens too

### Priority badge tokens to add

```css
--priority-p0-bg:   #FEE2E2;  --priority-p0-text: #DC2626;
--priority-p1-bg:   #FFEDD5;  --priority-p1-text: #C2410C;
--priority-p2-bg:   #FEF9C3;  --priority-p2-text: #A16207;
--priority-p3-bg:   var(--bg-hover); --priority-p3-text: var(--text-secondary);
```

### Phase color tokens to add

```css
--phase-predesign:        #D4A84B;
--phase-predesign-bg:     rgba(212, 168, 75, 0.05);
--phase-predesign-border: rgba(212, 168, 75, 0.20);
--phase-predesign-badge:  rgba(212, 168, 75, 0.10);

--phase-design:           #A394C7;
--phase-design-bg:        rgba(163, 148, 199, 0.05);
--phase-design-border:    rgba(163, 148, 199, 0.20);
--phase-design-badge:     rgba(163, 148, 199, 0.10);

--phase-dev:              #7DA5C4;
--phase-dev-bg:           rgba(125, 165, 196, 0.05);
--phase-dev-border:       rgba(125, 165, 196, 0.20);
--phase-dev-badge:        rgba(125, 165, 196, 0.10);

--phase-track:            #86A87A;
--phase-track-bg:         rgba(134, 168, 122, 0.05);
--phase-track-border:     rgba(134, 168, 122, 0.20);
--phase-track-badge:      rgba(134, 168, 122, 0.10);
```

---

## Section 3: Component Changes

### card.tsx
- Remove: `border border-slate-200 bg-white text-slate-950 shadow-sm dark:*`
- Replace with: `boxShadow: var(--shadow-card)`, `background: var(--bg-surface)`, `color: var(--text-primary)`
- Use `var(--radius-lg)` for border radius

### button.tsx
Remap all variants:

| Variant | Background | Text | Border/Shadow | Hover |
|---|---|---|---|---|
| `default` | `var(--accent)` | `var(--accent-text)` | none | `var(--accent-hover)` |
| `outline` | `var(--bg-surface)` | `var(--text-primary)` | `var(--shadow-border)` | `var(--bg-hover)` |
| `secondary` | `var(--bg-hover)` | `var(--text-primary)` | none | `var(--bg-subtle)` |
| `ghost` | transparent | `var(--text-secondary)` | none | `var(--bg-hover)` |
| `destructive` | `var(--priority-p0-bg)` | `var(--priority-p0-text)` | none | same |

### input.tsx
- Border: `1px solid var(--border-input)` (meets 3:1 for UI components)
- Focus: `border-color: var(--focus-ring-color)`, `outline: none`
- Background: `var(--bg-surface)`
- Text: `var(--text-primary)`
- Placeholder: `var(--text-tertiary)`

### request-list.tsx
- All inline `style={{ color: "#..." }}` → `style={{ color: "var(--token)" }}`
- Phase colors → phase tokens
- Priority colors → priority tokens
- Request row: `boxShadow: var(--shadow-border)` on hover → `var(--shadow-border-hover)`
- Stalled indicator: `var(--priority-p1-text)` (reuse amber)
- Deadline badge: `background: var(--priority-p2-bg)`, `color: var(--priority-p2-text)`

---

## Section 4: Techniques Applied

### Vercel shadow-as-border
Cards and request rows use `box-shadow: var(--shadow-card)` instead of `border: 1px solid var(--border)`. Enables smoother transitions, better rounded corners, no box-model implications.

### Notion warm-white alternation
Left global pane uses `var(--bg-section)` (#F2EFE9) for alternating rows. Section dividers can use this as background to create rhythm without hard borders.

### Linear opacity-elevation
Right detail dock and modals use `var(--bg-elevated)` (#FDFCFA) — a barely-there warm white that separates elevated surfaces from the base without harsh contrast.

---

## Files to Change

1. `app/globals.css` — token fixes + new tokens
2. `components/ui/card.tsx` — off slate → tokens
3. `components/ui/button.tsx` — full variant remap
4. `components/ui/input.tsx` — border-input + focus token
5. `components/requests/request-list.tsx` — eliminate all hardcoded values

---

## Out of Scope

- Dark mode (deferred per DESIGN.md decisions log)
- Shell components (icon-rail, global-pane, detail-dock) — separate pass after validation
- shadcn components other than card/button/input
