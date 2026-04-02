# Design Radar — Design Spec

**Date:** 2026-04-02
**Status:** Approved
**Part of:** Killer Features — Approach 3 (Speed + Visibility)
**Build order:** 2 of 7 (after Speed Layer)

---

## Goal

Give the Design Head (and team leads) a single page that answers the Monday morning question in under 10 seconds: who's working, who's stuck, what's at risk, and what shipped this week. No clicking, no filtering, no digging — one view.

---

## Page

**Route:** `/dashboard/radar`
**Nav:** Added to the dashboard header alongside Requests / Team / Insights / Ideas

---

## Access Model

| Role | What they see | Action buttons |
|------|--------------|----------------|
| `lead` or `admin` with no `managerId` (Design Head) | Full radar | Actions on all designers |
| `lead` with a `managerId` set (Team Lead) | Full radar | Actions on direct reports only |
| `pm`, `designer`, `developer` | Full radar | Read-only (no action buttons) |

**Access control is computed server-side.** The page passes a `canAction(designerId)` function to each component — true if viewer is Design Head, or if the designer's `managerId === viewer.id`.

There is no lock-out message. Everyone sees the full radar. Action buttons are simply absent for non-leads.

### `managerId` setup

Admin sets reporting relationships from the existing Team page (`/dashboard/team`). A "Reports to" dropdown per member (admin-only UI). If a lead has no reportees configured, they see the full radar read-only until the admin sets it up.

---

## Layout

Single scrollable column, 4 panels in order:

```
┌─────────────────────────────────────────────────┐
│  Panel 1: DESIGNER STATUS                        │
│  One card per designer showing status dot,       │
│  name, active request count, and action buttons  │
├─────────────────────────────────────────────────┤
│  Panel 2: PHASE HEAT MAP                         │
│  4 buckets: Predesign · Design · Dev · Track     │
│  Request counts only — no sub-stages             │
├─────────────────────────────────────────────────┤
│  Panel 3: RISK PANEL                             │
│  Stalled requests · Sign-off overdue · Figma drift│
├─────────────────────────────────────────────────┤
│  Panel 4: SHIPPED THIS WEEK                      │
│  Shipped cards with full cycle time primary,     │
│  design + dev cycle time collapsed               │
└─────────────────────────────────────────────────┘
```

---

## Panel 1: Designer Status

### Status Logic

For each designer in the org, look at all their active requests ("active" = phase is predesign, design, or dev — not track, not draft, not shipped). Status is computed across all active requests; the card displays the most recently `updatedAt` one.

| Signal | Status |
|--------|--------|
| Any active request has `status: blocked` | 🔴 Blocked |
| No active request moved in 5+ days | 🔴 Stuck |
| No active request moved in 2–4 days | 🟡 Idle |
| Any active request moved in last 24h | 🟢 In Flow |
| No active requests at all | ⚪ No active work |

Blocked overrides time-based signals. A designer with one blocked request and one active request is 🔴 Blocked regardless of time.

### Card Layout

```
🟢 Ananya Sharma          [Nudge] [Mark at-risk]
   3 active · last moved 2h ago
```

```
🔴 Riya Patel             [Nudge] [Mark at-risk]
   2 active · BLOCKED · Dark Mode (4 days)
```

Action buttons shown only to authorised viewers (Design Head or Team Lead with this designer as reportee).

### Action: Nudge

Posts a system comment on the designer's most stalled active request:
> _"Design Head sent a check-in nudge."_

Uses the existing `POST /api/requests/[id]/comment` route with `isSystem: true`. Also calls the existing `POST /api/requests/[id]/nudge` route if present.

### Action: Mark at-risk

Sets `status: blocked` on the designer's most stalled active request. Uses the existing `POST /api/requests/[id]/toggle-blocked` route.

---

## Panel 2: Phase Heat Map

4 buckets showing count of org requests in each phase. Excludes `draft` and `shipped`/`completed` status requests.

```
Predesign   Design    Dev      Track
   12          4        7        2
```

Each bucket is a link — clicking it navigates to `/dashboard` with that phase pre-filtered (via URL query param, e.g. `?phase=design`).

---

## Panel 3: Risk Panel

Three risk categories, each shown as a collapsible list of request rows.

### Risk 1: Stalled Requests
Active requests (phase: predesign/design/dev) with `updatedAt` older than 5 days. Sorted by staleness (most stalled first).

Row: `[Priority badge] Request title · Phase · Designer · X days stalled`

### Risk 2: Sign-off Overdue
Requests in `designStage: validate` with `updatedAt` older than 3 days (proxy for "been waiting for sign-offs for 3+ days").

Row: `[Priority badge] Request title · Waiting for sign-offs · X days`

### Risk 3: Post-Handoff Figma Drift
Rows from `figma_updates` where `postHandoff: true` and `devReviewed: false`. Groups by request.

Row: `[Priority badge] Request title · Figma updated post-handoff · Dev hasn't reviewed`

If any category has zero items, it shows a green "All clear" row instead of collapsing.

---

## Panel 4: Shipped This Week

Requests where `phase` reached `track` in the last 7 days (using `updatedAt` as proxy — the moment `updatedAt` was set when phase changed to track).

### Cycle Time Definitions

| Cycle | From | To |
|-------|------|----|
| **Full** (primary) | `createdAt` | `updatedAt` when phase → track |
| Design | When phase entered `design` (via `requestStages` table if it exists, otherwise "—") | `figmaLockedAt` (handoff) |
| Dev | `figmaLockedAt` (handoff) | `updatedAt` when phase → track |

If `requestStages` data is unavailable for a request, design/dev cycle times show "—" rather than crashing.

### Card Layout

```
Dark Mode for Mobile
Ananya · 12 days full cycle
[▶ Design: 4d · Dev: 6d]   ← collapsed by default, click to expand
```

If nothing shipped this week: "Nothing shipped yet this week — keep pushing."

---

## Architecture

### Data Fetching

Single server component. Two database queries run in parallel:

```typescript
const [requests, profiles] = await Promise.all([
  db.select().from(requests).where(eq(requests.orgId, orgId)),
  db.select().from(profiles).where(eq(profiles.orgId, orgId)),
]);
```

Assignments are joined via a third query or joined into the requests query. Figma updates for risk panel fetched separately (filtered to `postHandoff: true AND devReviewed: false`).

All computation (status classification, risk sorting, cycle time calculation) happens in server-side utility functions — not in components.

### Real-time

Same pattern as existing dashboard: an invisible client wrapper component (`RealtimeRadar`) subscribes to Postgres Changes on the `requests` table filtered by `orgId`, calls `router.refresh()` on any change.

```typescript
// components/realtime/realtime-radar.tsx
supabase.channel(`radar:${orgId}`)
  .on("postgres_changes", { table: "requests", filter: `org_id=eq.${orgId}` }, () => router.refresh())
  .subscribe()
```

---

## Schema Changes

### `profiles` table — add `managerId`

```typescript
managerId: uuid("manager_id")
  .references(() => profiles.id, { onDelete: "set null" })
  .default(null)
```

Nullable. When null: user has no manager (Design Head, or not yet configured). Self-referential FK (manager is also a profile in the same org).

After adding: run `npm run db:push`.

---

## Files to Create / Modify

| File | Action |
|------|--------|
| `db/schema/users.ts` | Modify — add `managerId` column |
| `app/(dashboard)/dashboard/radar/page.tsx` | Create — server component, access gate, data fetch |
| `components/radar/designer-status.tsx` | Create — status cards + action buttons |
| `components/radar/heat-map.tsx` | Create — 4 phase buckets |
| `components/radar/risk-panel.tsx` | Create — 3 risk categories |
| `components/radar/shipped-week.tsx` | Create — shipped cards with cycle times |
| `components/realtime/realtime-radar.tsx` | Create — invisible realtime wrapper |
| `lib/radar.ts` | Create — pure computation functions (classifyDesignerStatus, getRiskItems, getShippedThisWeek, computeCycleTimes) |
| `app/api/team/[memberId]/manager/route.ts` | Create — PATCH endpoint to set managerId |
| `app/(dashboard)/dashboard/team/page.tsx` | Modify — add "Reports to" dropdown (admin only) |
| `app/(dashboard)/dashboard/page.tsx` | Modify — add Radar nav link |
| `app/(dashboard)/dashboard/team/page.tsx` | Modify — add Radar nav link |
| `app/(dashboard)/dashboard/insights/page.tsx` | Modify — add Radar nav link |
| `app/(dashboard)/dashboard/ideas/page.tsx` | Modify — add Radar nav link |

---

## What Is Not Being Built

- **Push notifications / alerts** — that's Killer Feature #6 (Proactive Alerts). Design Radar is a pull view.
- **Historical trends** — no "last 4 weeks" charts. One view, right now.
- **Per-request actions from the radar** — clicking a request navigates to its detail page. No inline editing.
- **Mobile optimisation** — radar is desktop-only (same as keyboard shortcuts).
- **Custom stall thresholds** — 5 days for stalled, 3 days for sign-off overdue are hardcoded. No settings UI.

---

## Success Criteria

- Design Head sees the full org picture in under 10 seconds
- Designer status updates live (via real-time) without page refresh
- Risk panel shows zero false positives (blocked = actually blocked, stalled = actually stalled)
- Nudge and mark-at-risk actions work in one click
- Team leads see action buttons only for their direct reports
- Shipped cycle times are accurate to within 1 day
