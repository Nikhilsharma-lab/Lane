# Phase 2 UI Redesign — Warm Cream Rollout to All Remaining Pages

**Date:** 2026-04-03  
**Status:** Approved — ready for implementation  
**Phase 1 reference:** `docs/superpowers/specs/2026-04-03-ui-redesign-design.md`

---

## Objective

Apply the warm cream design system (already live in the shell, dock, and request list) to all remaining pages still on the dark zinc theme. No new design decisions — pure token substitution + two structural fixes.

---

## Scope

### Pages and components still on dark zinc:
- `app/(dashboard)/dashboard/requests/[id]/page.tsx` + all 14 sub-components in `components/requests/`
- `app/(dashboard)/dashboard/ideas/page.tsx` + `components/ideas/` (4 files)
- `app/(dashboard)/dashboard/radar/page.tsx` + `components/radar/` (4 files)
- `app/(dashboard)/dashboard/insights/page.tsx` + `components/insights/` (2 files)
- `app/(dashboard)/dashboard/dev/page.tsx` + `components/dev-board/` (4 files)
- `app/(auth)/login/page.tsx`, `signup/page.tsx`, `invite/[token]/page.tsx`
- `app/(settings)/settings/layout.tsx` + all settings sub-pages + `components/settings/` (11 files)

---

## Token Mapping (universal — all agents use this)

| Old (dark zinc) | New (warm CSS var) |
|---|---|
| `bg-zinc-950` | `bg-[var(--bg-base)]` |
| `bg-zinc-900` | `bg-[var(--bg-subtle)]` |
| `bg-zinc-800` | `bg-[var(--bg-hover)]` |
| `bg-zinc-700/50` | `bg-[var(--bg-hover)]` |
| `text-white` | `text-[var(--text-primary)]` |
| `text-zinc-300` | `text-[var(--text-primary)]` |
| `text-zinc-400` | `text-[var(--text-secondary)]` |
| `text-zinc-500` | `text-[var(--text-secondary)]` |
| `text-zinc-600` | `text-[var(--text-tertiary)]` |
| `border-zinc-800` | `border-[var(--border)]` |
| `border-zinc-700` | `border-[var(--border)]` |
| `border-zinc-600` | `border-[var(--border-strong)]` |
| `placeholder-zinc-600` | `placeholder-[var(--text-tertiary)]` |
| `focus:border-zinc-600` | `focus:border-[var(--border-strong)]` |
| `hover:bg-zinc-800` | `hover:bg-[var(--bg-hover)]` |
| `hover:text-white` | `hover:text-[var(--text-primary)]` |
| `bg-white text-zinc-900` (primary button) | `bg-[var(--accent)] text-[var(--accent-text)]` |

---

## Phase Color Remapping

The 4-phase system uses hardcoded Tailwind colors. Replace with warm-toned equivalents that sit harmoniously on `#F8F6F1`. These hex values are already defined as status colors in the design system — no new colors introduced.

| Phase | Current | New hex | New classes |
|---|---|---|---|
| Predesign | `text-indigo-400` / `bg-indigo-500/10` / `border-indigo-500/20` | `#D4A84B` (warm amber) | `text-[#D4A84B]` / `bg-[#D4A84B]/10` / `border-[#D4A84B]/20` |
| Design | `text-purple-400` / `bg-purple-500/10` / `border-purple-500/20` | `#A394C7` (muted lavender) | `text-[#A394C7]` / `bg-[#A394C7]/10` / `border-[#A394C7]/20` |
| Dev | `text-blue-400` / `bg-blue-500/10` / `border-blue-500/20` | `#7DA5C4` (muted blue) | `text-[#7DA5C4]` / `bg-[#7DA5C4]/10` / `border-[#7DA5C4]/20` |
| Track | `text-green-400` / `bg-green-500/10` / `border-green-500/20` | `#86A87A` (muted sage) | `text-[#86A87A]` / `bg-[#86A87A]/10` / `border-[#86A87A]/20` |

**Priority badge P3:** `bg-zinc-700/50 text-zinc-400` → `bg-[var(--bg-hover)] text-[var(--text-tertiary)]`

---

## Structural Fix: requests/[id] Shell Integration

The request detail page currently wraps itself in a standalone shell with its own header. This must be removed so the page renders inside the existing 4-zone dashboard shell.

**What to remove:**
- The outer `<div className="min-h-screen bg-zinc-950 text-white">` wrapper
- The entire `<header>` block (breadcrumb nav with "DesignQ · Requests / title")

**What replaces it:**
- The page content becomes the direct body of the main canvas — no wrapper, just the `<main>` content
- Navigation context (breadcrumb) is already implied by the shell's icon rail active state

The dashboard layout at `app/(dashboard)/layout.tsx` already provides the shell. The requests/[id] route sits inside `(dashboard)` group so it inherits the shell automatically once the standalone wrapper is removed.

---

## Execution: 4 Parallel Agents

### Agent 1 — Requests domain
**Files:**
- `app/(dashboard)/dashboard/requests/[id]/page.tsx`
- `components/requests/predesign-panel.tsx`
- `components/requests/design-phase-panel.tsx`
- `components/requests/dev-phase-panel.tsx`
- `components/requests/track-phase-panel.tsx`
- `components/requests/new-request-form.tsx`
- `components/requests/edit-request-modal.tsx`
- `components/requests/validation-gate.tsx`
- `components/requests/handoff-checklist.tsx`
- `components/requests/context-brief-panel.tsx`
- `components/requests/assign-panel.tsx`
- `components/requests/comment-box.tsx`
- `components/requests/figma-history.tsx`
- `components/requests/impact-panel.tsx`
- `components/requests/stage-controls.tsx`
- `components/requests/triage-button.tsx`
- `components/requests/edit-request-button.tsx`

**Special instruction:** Apply the shell integration fix to `requests/[id]/page.tsx` in addition to the token mapping.

### Agent 2 — Features domain
**Files:**
- `app/(dashboard)/dashboard/ideas/page.tsx`
- `app/(dashboard)/dashboard/radar/page.tsx`
- `app/(dashboard)/dashboard/insights/page.tsx`
- `app/(dashboard)/dashboard/dev/page.tsx`
- `components/ideas/idea-board.tsx`
- `components/ideas/idea-card.tsx`
- `components/ideas/idea-form.tsx`
- `components/ideas/idea-validation-panel.tsx`
- `components/radar/designer-status.tsx`
- `components/radar/heat-map.tsx`
- `components/radar/risk-panel.tsx`
- `components/radar/shipped-week.tsx`
- `components/insights/digest-panel.tsx`
- `components/insights/pm-calibration.tsx`
- `components/dev-board/dev-board.tsx`
- `components/dev-board/kanban-column.tsx`
- `components/dev-board/kanban-card.tsx`
- `components/dev-board/card-drawer.tsx`
- `components/projects/project-badge.tsx`
- `components/projects/project-switcher.tsx`
- `components/notifications/notifications-bell.tsx`

### Agent 3 — Auth domain
**Files:**
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
- `app/(auth)/invite/[token]/page.tsx`

**Aesthetic note:** Auth pages use a centered card layout. The background becomes `--bg-base` (warm ivory). The card itself becomes `--bg-surface` (white) with `--border` edges. The primary CTA button becomes `--accent` / `--accent-text`. All zinc text classes follow the standard token mapping.

### Agent 4 — Settings domain
**Files:**
- `app/(settings)/settings/layout.tsx`
- `app/(settings)/settings/page.tsx`
- `app/(settings)/settings/account/page.tsx`
- `app/(settings)/settings/workspace/page.tsx`
- `app/(settings)/settings/members/page.tsx`
- `app/(settings)/settings/plan/page.tsx`
- `app/(settings)/settings/projects/page.tsx`
- `app/(settings)/settings/danger/page.tsx`
- `components/settings/settings-sidebar.tsx`
- `components/settings/account-form.tsx`
- `components/settings/workspace-form.tsx`
- `components/settings/members-list.tsx`
- `components/settings/pending-invites.tsx`
- `components/settings/plan-display.tsx`
- `components/settings/project-form.tsx`
- `components/settings/project-list.tsx`
- `components/settings/danger-zone.tsx`
- `components/settings/user-menu.tsx`
- `components/settings/password-form.tsx`

---

## What Does NOT Change

- `components/shell/` — already Phase 1 complete
- `components/requests/request-list.tsx` — already Phase 1 complete
- `globals.css` — CSS tokens already wired, no changes needed
- `tailwind.config.ts` — no changes needed
- All business logic, props, data fetching — purely visual class swaps
- Status colors for request statuses (Requested/In Progress/etc.) — already correct
- P0/P1/P2 priority badges using red/orange/yellow — these remain (they're semantic alerts, not theme colors)

---

## Success Criteria

- Zero `bg-zinc-950`, `bg-zinc-900`, `text-white` classes remain in any dashboard, auth, or settings file
- Phase badges use the warm remapped colors
- `requests/[id]` page renders cleanly inside the shell with no duplicate header
- Auth pages feel like the same product as the dashboard
- No functional regressions — all interactivity, forms, and data display unchanged
