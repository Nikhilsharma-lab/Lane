# Lane UI Redesign — Design Spec

**Date:** 2026-04-03
**Status:** Approved — ready for implementation planning
**Scope:** Core shell + Requests list + Request detail (right dock)

---

## Problem

The current Lane UI is built on a dark theme with bright emerald green accents. It has a traditional sidebar-nav-plus-modal structure. As a DesignOps tool targeting design leaders — people who care deeply about craft and aesthetics — the current design doesn't signal "built by designers, for designers." It looks like every other SaaS tool.

Additionally, the current modal-based request detail creates a jarring context switch. The layout has no persistent global awareness panel.

---

## Goals

1. Redesign the visual language to feel warm, minimal, and premium — like Anthropic/Claude/Notion
2. Restructure the layout to a fixed 3-panel command center with persistent global context pane
3. Add a right detail dock that slides in on request click (no context switch)
4. Establish a complete design token system implementable across all future screens

---

## Non-Goals

- Full app redesign in one pass (deferred to Phase 2)
- Dark mode (deferred until light design is validated)
- Auth screen redesign (Phase 2)
- Idea Board redesign (Phase 2)

---

## Design System Summary

Full details in `/DESIGN.md`. Key decisions:

| Attribute | Decision |
|-----------|----------|
| Background | `#F8F6F1` warm ivory |
| Accent | `#2E5339` deep forest green |
| UI Font | Satoshi (all human-authored text) |
| Data Font | Geist Mono (IDs, timestamps, phase tags) |
| Layout | Fixed 4-zone shell |
| Motion | Quiet — ease-out, no bounce |

---

## Layout Architecture

### Four Fixed Zones

```
┌────────┬──────────────────┬──────────────────────────┬───────────────┐
│  Rail  │   Global Pane    │      Main Canvas         │  Detail Dock  │
│  48px  │     256px        │       flex-1             │    400px      │
└────────┴──────────────────┴──────────────────────────┴───────────────┘
```

The dock is conditionally rendered — absent when no request is selected, slides in (200ms ease-out, pushes canvas) when a request is clicked.

### Icon Rail
- Fixed 48px width
- `--bg-subtle` background
- Logo mark at top
- Nav icons: Board, Requests, Idea Board, Team, Settings
- User avatar at bottom
- Active state: `--accent` fill on icon

### Left Global Pane
- Fixed 256px, always visible, never collapses
- `--bg-subtle` background, `--border` right edge
- **Stats section:** Active count + Overdue count in Satoshi 700 24px
- **My Work section:** Requests assigned to viewer, REQ-ID in Geist Mono
- **Recent Activity:** Last 3–5 items, condensed, timestamps in Geist Mono
- Section labels in Geist Mono uppercase 10px `--text-tertiary`

### Main Canvas
- `--bg-base` background, 24px padding
- Contains current view (Requests list by default)
- Page title: Satoshi 600 18px `--text-primary`
- Shrinks when right dock opens (no overlay — pushes inward)

### Right Detail Dock
- 400px, `--bg-surface`, `--border` left edge
- Slides in on request click: `transform: translateX(0)` from `translateX(100%)`, 200ms ease-out
- Close (×) top-right, clicking any empty area outside also closes
- Tabs: Details / Activity / Files
- Request ID in Geist Mono at top
- Phase/stage label in Geist Mono uppercase

---

## Requests List (Main Canvas)

### Row Structure
Each request row is a card (`--bg-surface`, `--radius-lg`, `--border`):

```
┌─────────────────────────────────────────────────────────────────┐
│  REQ-042 [Geist Mono]    Brand refresh logo [Satoshi 500]       │
│  DESIGN · VALIDATE [Geist Mono]  • Priya • Due Mar 28  [Amber] │
└─────────────────────────────────────────────────────────────────┘
```

- Click anywhere on row → opens right dock
- Hover state: `--bg-hover` transition 100ms
- Status badge: colored per status tokens, Satoshi 600 11px
- Phase·Stage: Geist Mono uppercase 10px `--text-tertiary`

### Toolbar
- Page title left
- Filter chips center (Status, Assignee, Phase)
- "New request" button right — `--accent` fill, Satoshi 600, `--radius-md`

---

## Right Dock — Request Detail

### Header
- Close (×) button top-right
- Request ID: Geist Mono 12px `--text-tertiary`
- Title: Satoshi 600 18px `--text-primary`
- Status badge + Phase tag row

### Tabs
Three tabs — Details / Activity / Files

**Details tab:**
- Assignee, PM, Design Head (avatar + name)
- Phase progress indicator (4 phases, current highlighted in `--accent`)
- Stage within phase
- Problem statement
- Due date
- Priority

**Activity tab:**
- Chronological feed of comments, status changes, Figma updates
- Timestamps in Geist Mono
- Figma version tags in Geist Mono (`v3`)
- Comment input at bottom

**Files tab:**
- Figma links with version in Geist Mono
- Uploaded files

---

## Component Tokens

### Cards
```css
.request-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  transition: background 100ms ease-out;
}
.request-card:hover {
  background: var(--bg-hover);
}
```

### Primary Button
```css
.btn-primary {
  background: var(--accent);
  color: var(--accent-text);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  font-family: 'Satoshi', sans-serif;
  font-weight: 600;
  font-size: 13px;
}
```

### Status Badge
```css
.badge {
  font-family: 'Satoshi', sans-serif;
  font-weight: 600;
  font-size: 11px;
  border-radius: var(--radius-sm);
  padding: 2px var(--space-2);
}
```

### Geist Mono data strings
```css
.data-label {
  font-family: 'Geist Mono', monospace;
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
```

---

## Implementation Scope

### Phase 1 (this spec)
1. CSS token system in `globals.css` — replace all existing color/font vars
2. Shell layout component — 4-zone flex layout
3. Icon rail component
4. Left global pane component (stats, my work, activity)
5. Right detail dock component (slide animation, tabs)
6. Requests list view — card rows, toolbar
7. Satoshi font loading via Fontshare CDN

### Phase 2 (next spec)
- Idea Board
- Dashboard
- Auth screens (login, signup)
- Dark mode toggle

---

## Files to Modify

| File | Change |
|------|--------|
| `app/globals.css` | Replace color vars, add new tokens, import Satoshi |
| `app/layout.tsx` | Restructure to 4-zone shell |
| `components/Sidebar.tsx` | Replace with Icon Rail (48px) |
| `components/Header.tsx` | Remove — absorbed into main canvas toolbar |
| `app/(dashboard)/requests/page.tsx` | Requests list with new card rows |
| `components/requests/RequestCard.tsx` | New component — warm card row |
| `components/GlobalPane.tsx` | New component — left 256px pane |
| `components/DetailDock.tsx` | New component — right 400px dock |
