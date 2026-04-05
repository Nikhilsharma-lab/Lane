# Speed Layer — Design Spec

**Date:** 2026-04-02
**Status:** Approved
**Part of:** Killer Features — Approach 3 (Speed + Visibility)
**Build order:** 1 of 7 (first to build)

---

## Goal

Make Lane feel as fast as Linear and Notion. Speed is not a feature — it is the product feel that makes every other feature land. A slow tool with great features feels broken. A fast tool with good features feels magical.

Every interaction must be keyboard-accessible. Every mutation must be instant. No loading spinners on actions — ever.

---

## Component 1: Command Palette (Cmd+K)

### Trigger
- `Cmd+K` (Mac) / `Ctrl+K` (Windows) from anywhere in the app
- Clicking the search icon in the header also opens it
- Closes on `Esc` or clicking outside

### Default State (no input)
Shows three groups without typing:
1. **Recent** — last 5 requests the user visited
2. **Quick actions** — Create request, Create idea, Invite teammate
3. **Pages** — Dashboard, Insights, Ideas, Team

### Search State (typing)
Fuzzy search across all org requests by title. Results grouped in order:

| Group | Contents |
|-------|----------|
| Pages | Matched nav pages |
| Requests | Matched requests (title, phase badge, assignee) |
| Actions | Context-aware actions (see below) |
| Create | "Create request for '[query]'" shortcut |

### Context-Aware Actions
- If a request detail page is open: palette shows actions scoped to that request — Advance stage, Assign designer, Sign off, Mark blocked, Copy link
- If no request is open: actions are global — Create request, Create idea, Go to Insights

### Keyboard Behaviour
- `↑` / `↓` — navigate results
- `Enter` — execute selected item
- `Esc` — close palette
- Typing filters results in real time (debounced 100ms)

### Implementation
- Library: `cmdk` (same as Linear)
- Rendered as a full-screen overlay with centered modal
- Request list stored in a lightweight React context (`RequestsProvider`) mounted at `app/(dashboard)/layout.tsx` — fetched once on layout load, available on all dashboard pages (Dashboard, Insights, Ideas, Team). No additional API calls when palette opens.
- Actions execute the same API routes already built (advance-phase, assign, validate)
- Header gets a search icon (`/` or magnifier) that also opens the palette — create as part of this build

---

## Component 2: J/K List Navigation

### Scope
Active on the dashboard request list whenever the list is visible and chat/input is not focused.

### Key Map

| Key | Action |
|-----|--------|
| `J` | Move focus to next request |
| `K` | Move focus to previous request |
| `Enter` | Open focused request |
| `Esc` | Close request detail, restore list focus at same position |
| `/` | Focus search/filter input |
| `?` | Open keyboard shortcut cheatsheet |

### Visual Treatment
- Focused request: subtle left-border highlight (`border-l-2 border-indigo-500`) + `bg-zinc-900` background
- No special mode to activate — works as soon as list is visible
- Focus resets to top when filter or sort changes

### Shortcut Hints
- Shown at bottom of list in `text-zinc-600`: `J/K navigate · Enter open · / search · ? shortcuts`
- Desktop only — hidden on mobile (`hidden md:block`)

---

## Component 3: Cmd+N Quick Capture

### Trigger
- `Cmd+N` (Mac) / `Ctrl+N` (Windows) from anywhere in the app
- Floating modal, centered, renders above all other content

### Fields

| Field | Required | Default |
|-------|----------|---------|
| Title | Yes | — |
| Business goal | No | — |
| Priority | No | P2 |

### Keyboard Flow
- `Tab` moves between fields
- `Enter` on last field submits
- `Esc` cancels and discards

### On Submit
- Request created immediately as `phase: predesign / predesignStage: intake / status: draft`
- Modal closes instantly
- Toast shown: *"Request created"* with inline link to open the request
- AI triage runs async in background — triage badge updates on the dashboard when complete (via Supabase Realtime)
- No blocking — user can keep working

### What Quick Capture Does NOT Do
- No file attachment
- No assignee selection
- No Figma URL
- No deadline
These are filled in from the request detail page after capture.

---

## Component 4: Optimistic UI + Keyboard Hints

### Optimistic UI Rules
All of the following update instantly in the UI before server response:
- Advancing phase/stage (advance-phase route)
- Assigning designer (assign route)
- Submitting sign-off (validate route)
- Kanban state moves (kanban route)
- Voting on ideas (vote route)
- Marking request blocked (toggle-blocked route)

**On success:** server response confirms — no visual change needed.
**On error:** silently rollback to previous state + show toast: *"Something went wrong — try again"*

**Implementation:** React `useOptimistic` hook (built into Next.js 14 / React 19). Each action component manages its own optimistic state — no global state manager needed.

**Loading spinners:** Only permitted on initial page load. Never on actions or mutations.

### Keyboard Hints
- Every action button with a shortcut shows a `<kbd>` element to its right
- Style: `text-zinc-600 text-xs border border-zinc-700 rounded px-1`
- Shown on hover/focus — not always visible (reduces clutter)
- Desktop only

### Shortcut Cheatsheet (`?` key)
Modal listing all shortcuts grouped by context:

**Global**
- `Cmd+K` — Command palette
- `Cmd+N` — Quick capture
- `?` — This cheatsheet

**Request List**
- `J / K` — Navigate requests
- `Enter` — Open request
- `Esc` — Close request / go back
- `/` — Search

**Request Detail** (when request is open)
- `Cmd+Enter` — Advance to next stage
- `Cmd+B` — Mark blocked / unblock

---

## What Is Not Being Built

- **Custom keybinding settings** — Deferred permanently. Opinionated shortcuts + cheatsheet is the right call. Linear and Notion don't offer this.
- **Mobile keyboard shortcuts** — Keyboard-first is desktop-only. Mobile gets touch-optimised UI separately.
- **Offline mode** — Not in scope.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `components/ui/command-palette.tsx` | Create — global Cmd+K palette |
| `components/ui/keyboard-shortcuts.tsx` | Create — `?` cheatsheet modal |
| `components/ui/quick-capture.tsx` | Create — Cmd+N floating modal |
| `hooks/use-keyboard-nav.ts` | Create — J/K list navigation hook |
| `hooks/use-global-shortcuts.ts` | Create — Cmd+K, Cmd+N, `?` global listeners |
| `app/(dashboard)/layout.tsx` | Modify — mount global shortcut listeners + palette |
| `components/requests/request-list.tsx` | Modify — wire J/K navigation |
| `components/requests/predesign-panel.tsx` | Modify — add `useOptimistic` on advance |
| `components/requests/design-phase-panel.tsx` | Modify — add `useOptimistic` on advance + sign off |
| `components/requests/dev-phase-panel.tsx` | Modify — add `useOptimistic` on kanban moves |
| `components/requests/track-phase-panel.tsx` | Modify — add `useOptimistic` on impact save |
| `components/requests/assign-panel.tsx` | Modify — add `useOptimistic` on assign |
| `components/requests/validation-gate.tsx` | Modify — add `useOptimistic` on sign-off |
| `components/ideas/idea-card.tsx` | Modify — add `useOptimistic` on vote |
| `context/requests-context.tsx` | Create — lightweight context for org request list |

### New Dependency
```bash
npm install cmdk
```

---

## Success Criteria

- Cmd+K opens in <100ms
- Any request reachable in <3 keystrokes from anywhere
- Quick capture (title only) completable in <5 seconds
- Zero loading spinners on any mutation
- Every primary action has a keyboard shortcut
- New user discovers shortcuts within first session (via `?` hint at bottom of list)
