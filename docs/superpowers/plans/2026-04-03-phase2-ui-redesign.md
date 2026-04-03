# Phase 2 UI Redesign — Warm Cream Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the warm cream design system to all remaining pages and components still on the dark zinc theme — zero dark surfaces left in the app after this pass.

**Architecture:** Pure CSS class substitution across 4 independent domains (Requests, Features, Auth, Settings), executed in parallel. One structural fix: strip the standalone header/wrapper from `requests/[id]/page.tsx` so it renders inside the 4-zone dashboard shell. No logic, props, or data fetching changes — purely visual.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS with arbitrary value syntax, CSS custom properties already defined in `app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-04-03-phase2-ui-redesign-design.md`

---

## Universal Token Mapping

Every agent follows this table exactly. When in doubt, prefer the CSS var — never introduce new hex values.

| Old class | Replacement |
|---|---|
| `bg-zinc-950` | `bg-[var(--bg-base)]` |
| `bg-zinc-900` | `bg-[var(--bg-subtle)]` |
| `bg-zinc-900/50` | `bg-[var(--bg-subtle)]` (drop opacity) |
| `bg-zinc-800` | `bg-[var(--bg-hover)]` |
| `bg-zinc-800/50` | `bg-[var(--bg-hover)]` (drop opacity) |
| `bg-zinc-700/50` | `bg-[var(--bg-hover)]` |
| `text-white` | `text-[var(--text-primary)]` |
| `text-zinc-300` | `text-[var(--text-primary)]` |
| `text-zinc-400` | `text-[var(--text-secondary)]` |
| `text-zinc-500` | `text-[var(--text-secondary)]` |
| `text-zinc-600` | `text-[var(--text-tertiary)]` |
| `text-zinc-700` | `text-[var(--text-tertiary)]` |
| `border-zinc-800` | `border-[var(--border)]` |
| `border-zinc-800/50` | `border-[var(--border)]` |
| `border-zinc-700` | `border-[var(--border)]` |
| `border-zinc-600` | `border-[var(--border-strong)]` |
| `placeholder-zinc-600` | `placeholder-[var(--text-tertiary)]` |
| `focus:border-zinc-600` | `focus:border-[var(--border-strong)]` |
| `hover:bg-zinc-800` | `hover:bg-[var(--bg-hover)]` |
| `hover:bg-zinc-900` | `hover:bg-[var(--bg-subtle)]` |
| `hover:text-white` | `hover:text-[var(--text-primary)]` |
| `hover:text-zinc-300` | `hover:text-[var(--text-primary)]` |
| `bg-white text-zinc-900` (primary button) | `bg-[var(--accent)] text-[var(--accent-text)]` |

**Do NOT change:**
- `text-red-400`, `text-green-400`, `text-yellow-400` used for quality scores and status indicators — these are semantic, not theme
- `bg-red-500`, `bg-green-500`, `bg-yellow-500` for progress bars — semantic
- P0/P1/P2 priority badge colors (`bg-red-500/15 text-red-400`, `bg-orange-500/15 text-orange-400`, `bg-yellow-500/15 text-yellow-500/80`) — semantic alerts, keep as-is

## Phase Color Remapping

Replace these hardcoded phase colors wherever they appear (phase badge objects in `request-list.tsx` are already done — apply to any other files that duplicate them):

| Old | New |
|---|---|
| `text-indigo-400` / `bg-indigo-500/10` / `border-indigo-500/20` (Predesign) | `text-[#D4A84B]` / `bg-[#D4A84B]/10` / `border-[#D4A84B]/20` |
| `text-purple-400` / `bg-purple-500/10` / `border-purple-500/20` (Design) | `text-[#A394C7]` / `bg-[#A394C7]/10` / `border-[#A394C7]/20` |
| `text-blue-400` / `bg-blue-500/10` / `border-blue-500/20` (Dev) | `text-[#7DA5C4]` / `bg-[#7DA5C4]/10` / `border-[#7DA5C4]/20` |
| `text-green-400` / `bg-green-500/10` / `border-green-500/20` (Track phase badge only) | `text-[#86A87A]` / `bg-[#86A87A]/10` / `border-[#86A87A]/20` |
| `text-indigo-400` (Figma link color) | `text-[var(--accent)]` |
| P3 badge: `bg-zinc-700/50 text-zinc-400 border-zinc-700` | `bg-[var(--bg-hover)] text-[var(--text-tertiary)] border-[var(--border)]` |

---

## Task 1 — Requests Domain

**Files to modify:**
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

---

- [ ] **Step 1.1: Apply shell integration fix to `requests/[id]/page.tsx`**

The page currently wraps itself in a standalone shell. Remove the outer wrapper and header entirely. The dashboard layout (`app/(dashboard)/layout.tsx`) already provides the 4-zone shell.

**Remove this block** (lines 173–192 of page.tsx):
```tsx
// REMOVE: outer wrapper div
<div className="min-h-screen bg-zinc-950 text-white">
  {/* Real-time subscription */}
  <RealtimeRequest requestId={request.id} />
  {/* Header */}
  <header className="border-b border-zinc-800 px-6 py-4">
    <div className="max-w-5xl mx-auto flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold">DesignQ</span>
        <span className="text-zinc-700">·</span>
        <Link href="/dashboard" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          Requests
        </Link>
        <span className="text-zinc-700">/</span>
        <span className="text-sm text-zinc-300 truncate max-w-xs">{request.title}</span>
      </div>
      <Link href="/dashboard/team" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        Team
      </Link>
    </div>
  </header>

  <main className="max-w-5xl mx-auto px-6 py-10">
    ...page content...
  </main>
</div>  {/* REMOVE closing tag too */}
```

**Replace with** (the `<RealtimeRequest>` moves inside, outer wrapper gone):
```tsx
return (
  <>
    <RealtimeRequest requestId={request.id} />
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ... rest of content unchanged ... */}
      </div>
    </div>
  </>
);
```

Also remove the `Link` import if it's only used in the header. Check — it's also used for duplicate request links and the Figma link, so keep the import.

- [ ] **Step 1.2: Apply token mapping to `requests/[id]/page.tsx`**

Apply the universal token mapping table to all remaining zinc classes in the file. Key substitutions in this file:

```tsx
// Section headers (e.g. "Description", "Business Context")
// Before:
<h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">

// After:
<h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-2">

// Comment blocks
// Before:
<div className="border border-zinc-800 rounded-lg px-4 py-3">
  <span className="text-xs font-medium text-zinc-300">{author?.fullName}</span>
  <span className="text-xs text-zinc-600">...</span>
  <p className="text-sm text-zinc-400 leading-relaxed">{c.body}</p>
</div>

// After:
<div className="border border-[var(--border)] rounded-lg px-4 py-3">
  <span className="text-xs font-medium text-[var(--text-primary)]">{author?.fullName}</span>
  <span className="text-xs text-[var(--text-tertiary)]">...</span>
  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{c.body}</p>
</div>

// AI Triage section header
// Before:
<div className="border border-zinc-800 rounded-xl overflow-hidden">
  <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
    <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">AI Triage</span>
    <span className="text-[10px] text-zinc-600 font-mono">{aiAnalysis.aiModel}</span>
  </div>
  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">

// After:
<div className="border border-[var(--border)] rounded-xl overflow-hidden">
  <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
    <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">AI Triage</span>
    <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{aiAnalysis.aiModel}</span>
  </div>
  <div className="w-full h-1.5 bg-[var(--bg-hover)] rounded-full overflow-hidden">

// Figma link color
// Before: className="... text-indigo-400 hover:text-indigo-300 ..."
// After:  className="... text-[var(--accent)] hover:text-[var(--accent)] opacity-80 hover:opacity-100 ..."

// AI suggestions bullet
// Before: <span className="text-indigo-400 shrink-0">-</span>
// After:  <span className="text-[var(--accent)] shrink-0">-</span>

// Sidebar history stage text
// Before: <span className="text-xs text-zinc-600 capitalize">
// After:  <span className="text-xs text-[var(--text-tertiary)] capitalize">

// "No comments yet"
// Before: <p className="text-sm text-zinc-700">
// After:  <p className="text-sm text-[var(--text-tertiary)]">

// system comment badge
// Before: <span className="text-[10px] text-zinc-600 bg-zinc-800 rounded px-1.5 py-0.5">system</span>
// After:  <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-hover)] rounded px-1.5 py-0.5">system</span>
```

- [ ] **Step 1.3: Apply token mapping to `predesign-panel.tsx`**

```tsx
// Panel outer border
// Before: <div className="border border-zinc-800 rounded-xl overflow-hidden">
// After:  <div className="border border-[var(--border)] rounded-xl overflow-hidden">

// Panel header row
// Before:
<div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Phase 1 — Predesign</span>
  <span className="text-xs text-zinc-600">PM + Org decides what to build</span>
// After:
<div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
  <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">Phase 1 — Predesign</span>
  <span className="text-xs text-[var(--text-tertiary)]">PM + Org decides what to build</span>

// Stage stepper border
// Before: <div className="px-5 py-4 border-b border-zinc-800/50">
// After:  <div className="px-5 py-4 border-b border-[var(--border)]">
```

For the stage stepper circles (done/current/pending states), apply the same pattern — zinc backgrounds become `--bg-subtle`/`--bg-hover`, zinc borders become `--border`/`--border-strong`, zinc text becomes `--text-tertiary`.

The advance button at the bottom of the panel:
```tsx
// Before (active CTA): className="... bg-white text-zinc-900 ..."
// After:               className="... bg-[var(--accent)] text-[var(--accent-text)] ..."

// Before (disabled):  className="... bg-zinc-800 text-zinc-600 ..."
// After:              className="... bg-[var(--bg-hover)] text-[var(--text-tertiary)] ..."
```

- [ ] **Step 1.4: Apply token mapping to `design-phase-panel.tsx`, `dev-phase-panel.tsx`, `track-phase-panel.tsx`**

These three panels follow the same structure as `predesign-panel.tsx`: outer border, panel header row, stage stepper, content body, advance button. Apply the same substitutions:
- `border-zinc-800` → `border-[var(--border)]`
- `bg-zinc-900/50` → `bg-[var(--bg-subtle)]`
- `text-zinc-400` → `text-[var(--text-secondary)]`
- `text-zinc-600` → `text-[var(--text-tertiary)]`
- `bg-white text-zinc-900` button → `bg-[var(--accent)] text-[var(--accent-text)]`
- `bg-zinc-800 text-zinc-600` disabled → `bg-[var(--bg-hover)] text-[var(--text-tertiary)]`

- [ ] **Step 1.5: Apply token mapping to form components**

For `new-request-form.tsx` and `edit-request-modal.tsx`:

```tsx
// Form inputs
// Before:
className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"

// After:
className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)]"

// Form labels
// Before: <label className="block text-sm text-zinc-300 mb-1.5">
// After:  <label className="block text-sm text-[var(--text-primary)] mb-1.5">

// Error text
// Before: <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
// After:  Keep red error styling — it's semantic. Only change if the background color is dark zinc.
//         If the error bg is `bg-red-950/40`, change to `bg-red-500/10` for light theme.

// Modal overlay backdrop
// Before: className="fixed inset-0 bg-zinc-950/80 ..."
// After:  className="fixed inset-0 bg-[var(--text-primary)]/40 ..."

// Modal card
// Before: className="... bg-zinc-900 border border-zinc-800 ..."
// After:  className="... bg-[var(--bg-surface)] border border-[var(--border)] ..."

// Submit button
// Before: className="... bg-white text-zinc-900 ..."
// After:  className="... bg-[var(--accent)] text-[var(--accent-text)] ..."

// Cancel button
// Before: className="... text-zinc-400 hover:text-zinc-200 ..."
// After:  className="... text-[var(--text-secondary)] hover:text-[var(--text-primary)] ..."
```

- [ ] **Step 1.6: Apply token mapping to remaining request components**

Apply the universal token mapping table to each of these files:
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

Each file uses the same zinc class patterns. Mechanically apply the token mapping table. For any button that was `bg-white text-zinc-900` (primary CTA), use `bg-[var(--accent)] text-[var(--accent-text)]`.

- [ ] **Step 1.7: Verify — no zinc classes remain in requests domain**

```bash
grep -rn "bg-zinc\|text-zinc\|border-zinc\|placeholder-zinc" \
  app/\(dashboard\)/dashboard/requests/\[id\]/page.tsx \
  components/requests/
```

Expected: no output. If any lines appear, fix them before continuing.

Also check TypeScript compiles:
```bash
cd /Users/yashkaushal/DesignQ2 && npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors (or same errors as before this task — don't introduce new ones).

- [ ] **Step 1.8: Commit**

```bash
git add app/\(dashboard\)/dashboard/requests/ components/requests/
git commit -m "feat: apply warm cream theme to requests domain (phase 2 UI)"
```

---

## Task 2 — Features Domain

**Files to modify:**
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

---

- [ ] **Step 2.1: Read each page file before editing**

Read each of these 4 files first to understand their current structure:
- `app/(dashboard)/dashboard/ideas/page.tsx`
- `app/(dashboard)/dashboard/radar/page.tsx`
- `app/(dashboard)/dashboard/insights/page.tsx`
- `app/(dashboard)/dashboard/dev/page.tsx`

These pages may have their own inline page header/wrapper similar to what was removed from `requests/[id]`. If any page has a `<div className="min-h-screen bg-zinc-950 ...">` outer wrapper with its own `<header>`, check whether it sits inside the `(dashboard)` layout group. If yes (they all do — confirmed by file paths), remove the standalone header wrapper just like Task 1. The dashboard shell already provides the chrome.

- [ ] **Step 2.2: Apply token mapping to ideas components**

For `components/ideas/idea-board.tsx`:
```tsx
// Page/board wrapper
// Before: <div className="min-h-screen bg-zinc-950 text-white"> or similar outer bg
// After:  Remove standalone wrapper if present; token-map remaining classes

// Board header
// Before: className="... border-b border-zinc-800 ..."
// After:  className="... border-b border-[var(--border)] ..."

// "New Idea" button
// Before: className="... bg-white text-zinc-900 ..."
// After:  className="... bg-[var(--accent)] text-[var(--accent-text)] ..."
```

For `components/ideas/idea-card.tsx`:
```tsx
// Card container
// Before: className="border border-zinc-800 rounded-xl p-4 bg-zinc-900 ..."
// After:  className="border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-surface)] ..."

// Vote counts
// Before: className="text-zinc-400 ..."
// After:  className="text-[var(--text-secondary)] ..."

// Upvote/downvote buttons (active state)
// Before: className="... text-green-400 ..." / className="... text-red-400 ..."
// After:  Keep green/red — semantic vote indicator

// Author name
// Before: className="text-zinc-300 ..."
// After:  className="text-[var(--text-primary)] ..."

// Metadata (date, category)
// Before: className="text-zinc-600 ..."
// After:  className="text-[var(--text-tertiary)] ..."
```

For `components/ideas/idea-form.tsx` — apply the same form input pattern as Task 1.5:
```tsx
// Input fields
// Before: bg-zinc-900 border-zinc-800 text-white placeholder-zinc-600 focus:border-zinc-600
// After:  bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--border-strong)]
```

For `components/ideas/idea-validation-panel.tsx` — apply universal token mapping.

- [ ] **Step 2.3: Apply token mapping to radar components**

Apply the universal token mapping to all 4 radar components:
- `components/radar/designer-status.tsx`
- `components/radar/heat-map.tsx`
- `components/radar/risk-panel.tsx`
- `components/radar/shipped-week.tsx`

These components display data cards. Common patterns:
```tsx
// Stat card
// Before: className="border border-zinc-800 rounded-xl p-4 bg-zinc-900"
// After:  className="border border-[var(--border)] rounded-xl p-4 bg-[var(--bg-surface)]"

// Section label
// Before: className="text-xs text-zinc-500 uppercase tracking-wide"
// After:  className="text-xs text-[var(--text-secondary)] uppercase tracking-wide"

// Large number / metric
// Before: className="text-2xl font-bold text-white"
// After:  className="text-2xl font-bold text-[var(--text-primary)]"
```

- [ ] **Step 2.4: Apply token mapping to insights components**

Apply universal token mapping to:
- `components/insights/digest-panel.tsx`
- `components/insights/pm-calibration.tsx`

- [ ] **Step 2.5: Apply token mapping to dev-board components**

Apply universal token mapping to all 4 dev-board components. Kanban-specific patterns:

For `components/dev-board/kanban-column.tsx`:
```tsx
// Column container
// Before: className="bg-zinc-900/50 rounded-xl border border-zinc-800 ..."
// After:  className="bg-[var(--bg-subtle)] rounded-xl border border-[var(--border)] ..."

// Column header
// Before: className="text-xs font-medium text-zinc-400 uppercase tracking-wide"
// After:  className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide"

// Card count badge
// Before: className="text-xs text-zinc-600 bg-zinc-800 rounded px-1.5"
// After:  className="text-xs text-[var(--text-tertiary)] bg-[var(--bg-hover)] rounded px-1.5"
```

For `components/dev-board/kanban-card.tsx`:
```tsx
// Card
// Before: className="border border-zinc-800 rounded-lg p-3 bg-zinc-900 hover:border-zinc-700 cursor-pointer"
// After:  className="border border-[var(--border)] rounded-lg p-3 bg-[var(--bg-surface)] hover:border-[var(--border-strong)] cursor-pointer"
```

For `components/dev-board/card-drawer.tsx` — applies to the slide-out panel for a kanban card:
```tsx
// Drawer panel
// Before: className="... bg-zinc-900 border-l border-zinc-800 ..."
// After:  className="... bg-[var(--bg-surface)] border-l border-[var(--border)] ..."
```

- [ ] **Step 2.6: Apply token mapping to project and notification components**

For `components/projects/project-badge.tsx` and `components/projects/project-switcher.tsx`:
- Apply universal token mapping. Project switcher likely has a dropdown — treat dropdowns same as modals: `bg-[var(--bg-surface)] border-[var(--border)]`.

For `components/notifications/notifications-bell.tsx`:
- Dropdown panel: `bg-[var(--bg-surface)] border-[var(--border)]`
- Notification items: `hover:bg-[var(--bg-hover)]`
- Unread badge: keep as-is if it uses a semantic accent color

- [ ] **Step 2.7: Verify — no zinc classes remain in features domain**

```bash
grep -rn "bg-zinc\|text-zinc\|border-zinc\|placeholder-zinc" \
  app/\(dashboard\)/dashboard/ideas/ \
  app/\(dashboard\)/dashboard/radar/ \
  app/\(dashboard\)/dashboard/insights/ \
  app/\(dashboard\)/dashboard/dev/ \
  components/ideas/ \
  components/radar/ \
  components/insights/ \
  components/dev-board/ \
  components/projects/ \
  components/notifications/
```

Expected: no output.

```bash
cd /Users/yashkaushal/DesignQ2 && npx tsc --noEmit 2>&1 | head -30
```
Expected: no new errors.

- [ ] **Step 2.8: Commit**

```bash
git add \
  app/\(dashboard\)/dashboard/ideas/ \
  app/\(dashboard\)/dashboard/radar/ \
  app/\(dashboard\)/dashboard/insights/ \
  app/\(dashboard\)/dashboard/dev/ \
  components/ideas/ \
  components/radar/ \
  components/insights/ \
  components/dev-board/ \
  components/projects/ \
  components/notifications/
git commit -m "feat: apply warm cream theme to features domain (phase 2 UI)"
```

---

## Task 3 — Auth Domain

**Files to modify:**
- `app/(auth)/login/page.tsx`
- `app/(auth)/signup/page.tsx`
- `app/(auth)/invite/[token]/page.tsx`

---

- [ ] **Step 3.1: Apply token mapping to `login/page.tsx`**

Full before/after for the critical classes:

```tsx
// Page background
// Before: <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
// After:  <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center p-4">

// App name
// Before: <h1 className="text-xl font-semibold text-white">DesignQ</h1>
// After:  <h1 className="text-xl font-semibold text-[var(--text-primary)]">DesignQ</h1>

// Subtitle
// Before: <p className="text-zinc-400 text-sm mt-1">Sign in to your workspace</p>
// After:  <p className="text-[var(--text-secondary)] text-sm mt-1">Sign in to your workspace</p>

// Info message box (blue)
// Before: className="... text-blue-400 bg-blue-950/40 border border-blue-900/50 ..."
// After:  className="... text-[var(--accent)] bg-[var(--accent-subtle)] border border-[var(--accent)]/20 ..."

// Form labels
// Before: <label className="block text-sm text-zinc-300 mb-1.5">
// After:  <label className="block text-sm text-[var(--text-primary)] mb-1.5">

// Input fields
// Before: className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
// After:  className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"

// Error box
// Before: className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2"
// After:  className="text-sm text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"

// Primary button (Sign in)
// Before: className="w-full bg-white text-zinc-900 rounded-lg py-2.5 text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
// After:  className="w-full bg-[var(--accent)] text-[var(--accent-text)] rounded-lg py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"

// Footer link text
// Before: <p className="mt-6 text-center text-sm text-zinc-500">
// After:  <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">

// Footer link
// Before: <Link href="/signup" className="text-zinc-300 hover:text-white transition-colors">
// After:  <Link href="/signup" className="text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
```

- [ ] **Step 3.2: Apply token mapping to `signup/page.tsx`**

`signup/page.tsx` follows the same layout as login. Apply identical substitutions:
- Page bg: `bg-[var(--bg-base)]`
- Inputs: `bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--border-strong)]`
- Labels: `text-[var(--text-primary)]`
- Primary button: `bg-[var(--accent)] text-[var(--accent-text)]`
- Footer links: `text-[var(--text-primary)] hover:text-[var(--accent)]`
- Error: `text-red-600 bg-red-500/10 border border-red-500/20`

- [ ] **Step 3.3: Apply token mapping to `invite/[token]/page.tsx`**

Read the file first to check its structure. Apply the same auth-page pattern: warm ivory background, white card (`bg-[var(--bg-surface)]` with `border-[var(--border)]`), accent button. Any informational banners use `bg-[var(--accent-subtle)] text-[var(--accent)] border-[var(--accent)]/20` instead of blue zinc equivalents.

- [ ] **Step 3.4: Verify — no zinc classes remain in auth domain**

```bash
grep -rn "bg-zinc\|text-zinc\|border-zinc\|placeholder-zinc" app/\(auth\)/
```

Expected: no output.

```bash
cd /Users/yashkaushal/DesignQ2 && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 3.5: Commit**

```bash
git add app/\(auth\)/
git commit -m "feat: apply warm cream theme to auth pages (phase 2 UI)"
```

---

## Task 4 — Settings Domain

**Files to modify:**
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

- [ ] **Step 4.1: Apply token mapping to `settings/layout.tsx`**

```tsx
// Before:
<div className="min-h-screen bg-zinc-950 text-white">
  <div className="max-w-5xl mx-auto px-6 py-10 flex gap-12">

// After:
<div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
  <div className="max-w-5xl mx-auto px-6 py-10 flex gap-12">
```

- [ ] **Step 4.2: Apply token mapping to `settings-sidebar.tsx`**

```tsx
// Sidebar nav link (active)
// Before: className="... bg-zinc-800 text-white ..."
// After:  className="... bg-[var(--accent-subtle)] text-[var(--accent)] ..."

// Sidebar nav link (inactive)
// Before: className="... text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 ..."
// After:  className="... text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] ..."

// Section label
// Before: className="text-xs text-zinc-600 uppercase tracking-wide ..."
// After:  className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide ..."
```

- [ ] **Step 4.3: Apply token mapping to all settings form components**

For `account-form.tsx`, `workspace-form.tsx`, `password-form.tsx` — these are standard forms. Apply the input pattern from Task 1.5:
```tsx
// Inputs
// Before: bg-zinc-900 border-zinc-800 text-white placeholder-zinc-600 focus:border-zinc-600
// After:  bg-[var(--bg-subtle)] border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--border-strong)]

// Labels
// Before: text-zinc-300 or text-zinc-400
// After:  text-[var(--text-primary)] or text-[var(--text-secondary)]

// Save button
// Before: bg-white text-zinc-900
// After:  bg-[var(--accent)] text-[var(--accent-text)]

// Hint/helper text
// Before: text-zinc-500 or text-zinc-600
// After:  text-[var(--text-secondary)] or text-[var(--text-tertiary)]
```

- [ ] **Step 4.4: Apply token mapping to members and team components**

For `members-list.tsx` and `pending-invites.tsx`:
```tsx
// Member row
// Before: className="border-b border-zinc-800 py-3 flex items-center gap-3"
// After:  className="border-b border-[var(--border)] py-3 flex items-center gap-3"

// Role badge
// Before: className="text-xs bg-zinc-800 text-zinc-400 rounded px-2 py-0.5"
// After:  className="text-xs bg-[var(--bg-hover)] text-[var(--text-secondary)] rounded px-2 py-0.5"

// Action buttons (invite/remove)
// Before: text-zinc-400 hover:text-zinc-200
// After:  text-[var(--text-secondary)] hover:text-[var(--text-primary)]
```

- [ ] **Step 4.5: Apply token mapping to plan, project, danger, and user-menu components**

For `plan-display.tsx`:
- Plan tier card: `border-[var(--border)] bg-[var(--bg-surface)]`
- Current plan label: `text-[var(--accent)]` for the active tier name
- Upgrade CTA: `bg-[var(--accent)] text-[var(--accent-text)]`

For `project-form.tsx` and `project-list.tsx`:
- Forms: same input pattern as 4.3
- Project rows: `border-[var(--border)]` cards

For `danger-zone.tsx`:
- Section header: `text-[var(--text-secondary)]`
- Warning text: keep `text-red-400` — it's semantic danger
- Danger button: keep red `bg-red-600 text-white` — do NOT apply accent here

For `user-menu.tsx` (dropdown in the header/rail):
- Dropdown panel: `bg-[var(--bg-surface)] border-[var(--border)]`
- Menu items: `hover:bg-[var(--bg-hover)] text-[var(--text-secondary)]`
- Destructive item (sign out): keep `text-red-400` — semantic

- [ ] **Step 4.6: Apply token mapping to all settings page files**

Read and apply token mapping to these page files:
- `settings/page.tsx`
- `settings/account/page.tsx`
- `settings/workspace/page.tsx`
- `settings/members/page.tsx`
- `settings/plan/page.tsx`
- `settings/projects/page.tsx`
- `settings/danger/page.tsx`

Page-level patterns: page title `text-[var(--text-primary)]`, section descriptions `text-[var(--text-secondary)]`, dividers `border-[var(--border)]`.

- [ ] **Step 4.7: Verify — no zinc classes remain in settings domain**

```bash
grep -rn "bg-zinc\|text-zinc\|border-zinc\|placeholder-zinc" \
  app/\(settings\)/ \
  components/settings/
```

Expected: no output.

```bash
cd /Users/yashkaushal/DesignQ2 && npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 4.8: Commit**

```bash
git add app/\(settings\)/ components/settings/
git commit -m "feat: apply warm cream theme to settings domain (phase 2 UI)"
```

---

## Final Verification

- [ ] **Step 5.1: Full zinc audit across entire app**

```bash
grep -rn "bg-zinc\|text-zinc\|border-zinc\|placeholder-zinc" \
  app/ components/ \
  --exclude-dir=node_modules \
  --include="*.tsx" \
  --include="*.ts"
```

Expected: zero results. If any appear, fix them.

- [ ] **Step 5.2: TypeScript check**

```bash
cd /Users/yashkaushal/DesignQ2 && npx tsc --noEmit
```

Expected: clean compile (no new errors introduced).

- [ ] **Step 5.3: Final commit**

```bash
git commit --allow-empty -m "chore: phase 2 UI redesign complete — warm cream applied to all pages"
```
