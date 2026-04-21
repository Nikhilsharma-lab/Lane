# Plane-Inspired Features for Lane — Design Spec

**Date:** 2026-04-10
**Status:** Draft
**Scope:** 15 features across 3 tiers, inspired by Plane (github.com/makeplane/plane)

---

## 1. Guiding Principles

All features MUST comply with Lane's anti-surveillance principles:

- No individual utilization %, "last active" timestamps, or speed rankings visible to leads
- AI nudges go to the designer PRIVATELY first
- Leads see TEAM health signals, not individual surveillance
- Every AI recommendation includes reasoning
- Every AI suggestion is override-able by humans

---

## 2. New DB Schema

### 2.1 `stickies` table (Unified stickies + reflections)

```typescript
stickies = pgTable("stickies", {
  id: uuid PK,
  orgId: uuid FK → organizations.id,
  authorId: uuid FK → profiles.id,
  requestId: uuid FK → requests.id | null,     // null = personal sticky, set = reflection
  content: text NOT NULL,
  color: text default "cream",                  // cream | green | rose | sky | amber
  isPinned: boolean default false,
  archivedAt: timestamp | null,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

**Privacy:** Stickies are ALWAYS private to the author. When linked to a request (`requestId` set), they appear in the request timeline as a "reflection" — but ONLY if the author explicitly shares it (future: `sharedAt` timestamp).

### 2.2 `notification_preferences` table

```typescript
notificationPreferences = pgTable("notification_preferences", {
  id: uuid PK,
  userId: uuid FK → profiles.id (unique),
  // Per-category × per-channel (in_app, email)
  nudgesInApp: boolean default true,
  nudgesEmail: boolean default false,
  commentsInApp: boolean default true,
  commentsEmail: boolean default true,
  stageChangesInApp: boolean default true,
  stageChangesEmail: boolean default false,
  mentionsInApp: boolean default true,
  mentionsEmail: boolean default true,
  weeklyDigestEmail: boolean default true,
  morningBriefingInApp: boolean default true,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

### 2.3 `activity_log` table (Request timeline)

```typescript
activityLog = pgTable("activity_log", {
  id: uuid PK,
  requestId: uuid FK → requests.id,
  actorId: uuid FK → profiles.id | null,       // null = system/AI
  action: text NOT NULL,                         // "stage_changed", "comment_added", "assigned", "figma_updated", etc.
  field: text | null,                            // which field changed (e.g., "phase", "designStage")
  oldValue: text | null,
  newValue: text | null,
  metadata: jsonb default {},                    // extra context (e.g., AI reasoning)
  createdAt: timestamp,
});
```

### 2.4 `cycles` table (Project-level appetite cycles)

```typescript
cycleStatusEnum = pgEnum("cycle_status", ["draft", "active", "completed", "cancelled"]);

cycles = pgTable("cycles", {
  id: uuid PK,
  orgId: uuid FK → organizations.id,
  projectId: uuid FK → projects.id,             // project-level cycles
  name: text NOT NULL,                           // e.g., "Cycle 4 — April 2026"
  status: cycleStatusEnum default "draft",
  appetiteWeeks: integer NOT NULL,               // time budget in weeks (e.g., 6)
  startsAt: timestamp,
  endsAt: timestamp,                             // derived from startsAt + appetiteWeeks
  createdById: uuid FK → profiles.id,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

### 2.5 `cycle_requests` join table

```typescript
cycleRequests = pgTable("cycle_requests", {
  id: uuid PK,
  cycleId: uuid FK → cycles.id,
  requestId: uuid FK → requests.id,
  addedAt: timestamp,
  addedById: uuid FK → profiles.id,
});
```

### 2.6 `initiatives` table

```typescript
initiatives = pgTable("initiatives", {
  id: uuid PK,
  orgId: uuid FK → organizations.id,
  name: text NOT NULL,                           // e.g., "Mobile Redesign"
  description: text,
  color: text default "#2E5339",
  status: initiativeStatusEnum default "active",   // enum: active | completed | archived
  createdById: uuid FK → profiles.id,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

### 2.7 `initiative_requests` join table

```typescript
initiativeRequests = pgTable("initiative_requests", {
  id: uuid PK,
  initiativeId: uuid FK → initiatives.id,
  requestId: uuid FK → requests.id,
  addedAt: timestamp,
});
```

### 2.8 `iterations` table (Design phase iterations)

```typescript
iterations = pgTable("iterations", {
  id: uuid PK,
  requestId: uuid FK → requests.id,
  authorId: uuid FK → profiles.id,
  title: text NOT NULL,                          // e.g., "Direction A — Bottom nav"
  description: text,
  figmaUrl: text | null,
  stage: designStageEnum NOT NULL,               // diverge or converge
  sortOrder: integer default 0,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

### 2.9 `iteration_comments` table

```typescript
iterationComments = pgTable("iteration_comments", {
  id: uuid PK,
  iterationId: uuid FK → iterations.id,
  authorId: uuid FK → profiles.id,
  parentId: uuid FK → iteration_comments.id | null,  // threading
  body: text NOT NULL,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

### 2.10 `published_views` table

```typescript
publishedViews = pgTable("published_views", {
  id: uuid PK,
  orgId: uuid FK → organizations.id,
  createdById: uuid FK → profiles.id,
  name: text NOT NULL,
  description: text,
  viewType: text NOT NULL,                       // "betting_board" | "cycle" | "initiative" | "custom"
  filters: jsonb default {},                     // shape: { phase?: string[], priority?: string[], projectId?: string[], initiativeId?: string[], cycleId?: string[] }
  accessMode: text NOT NULL default "authenticated", // "authenticated" | "public"
  publicToken: text | null,                      // random token for public links (unique)
  allowComments: boolean default false,
  allowVoting: boolean default false,
  isActive: boolean default true,
  createdAt: timestamp,
  updatedAt: timestamp,
});
```

### 2.11 Schema changes to existing tables

**`requests` table — add `snoozedUntil`:**
```typescript
snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),  // null = not snoozed
snoozedById: uuid("snoozed_by_id").references(() => profiles.id),
```

---

## 3. Feature Specifications

### 3.1 Intake Split-Pane UI

**Route:** `/dashboard/intake`
**Layout:** 2-column — sidebar list (1/3 width) + detail panel (2/3 width)

**Sidebar list:**
- Shows all requests in `predesign` phase, `intake` stage
- Each row: title, priority badge (if triaged), requester name, time ago
- Active item highlighted
- Tabs: "Pending" (untriaged) | "Reviewed" (triaged)
- Sort by: newest first (default), priority

**Detail panel:**
- Full request info: title, description, business context, success metrics
- AI triage section: classification (problem_framed / solution_specific / hybrid), priority, complexity, type, quality score, reasoning
- Action bar: "Accept" (advance to Context), "Decline" (archive with reason), "Snooze" (pick date), "Mark Duplicate" (search + link)
- Comment thread below

**Navigation:** Arrow keys or `J/K` to move between items in sidebar.

### 3.2 Enhanced Command Palette (Power K)

**Extends existing `cmdk`-based command palette.**

**Keyboard shortcut system:**
```
Navigation (G + key):
  G then R → Go to Requests (dashboard)
  G then I → Go to Intake
  G then D → Go to Dev Board
  G then B → Go to Betting Board
  G then A → Go to Ideas
  G then S → Go to Settings
  G then T → Go to Team
  G then N → Go to Insights

Creation (N + key):
  N then R → New Request
  N then I → New Idea
  N then S → New Sticky

Quick actions:
  ⌘K → Open search palette (existing)
  ⌘J → Toggle detail dock
  Esc → Close any overlay
```

**Implementation:** A `useHotkeys` hook that listens for two-key sequences (first key starts a 500ms timer, second key completes the action). Visual hint in bottom-right corner showing available shortcuts when first key is pressed.

**Palette enhancements:**
- "Actions" group: change phase, assign, snooze (when a request is selected)
- "Navigation" group: all G-shortcuts listed
- Recent items section

### 3.3 Dashboard Polish

**Keep current layout.** Improvements:
- Morning Briefing card: add "Refresh" button, show generation timestamp
- Alerts section: add "Dismiss all" link, group by urgency
- Request list: integrate filter chips (see 3.4)
- Add a "Welcome back, {name}" greeting above the briefing

### 3.4 Applied Filter Chips

**Location:** Below the phase tabs in the request list, above the table.

**Chip types:**
- Phase: `Phase: Design ×`
- Stage: `Stage: Diverge ×`
- Priority: `Priority: P0 ×`
- Assignee: `Assignee: Sarah ×`
- Project: `Project: Mobile App ×`
- Initiative: `Initiative: Mobile Redesign ×`
- Cycle: `Cycle: April 2026 ×`

**Behavior:**
- Clicking `×` removes that filter
- "Clear all" link when 2+ chips active
- Chips are URL-param backed (`?phase=design&priority=p0`) for shareability
- Filter dropdown button opens a popover with all filter options
- Saved views: "Save current filters" → stores as a named view in `published_views` (accessMode = "authenticated", private by default)

### 3.5 Snooze / Defer with Auto-Resurface

**Where it applies:**
- Betting board: "Defer" action on requests in `bet` stage
- Intake: "Snooze" action on pending requests
- Notifications: "Snooze" on individual notifications

**UI:**
- Snooze button → popover with preset options: "Tomorrow", "Next week", "Next cycle", "Pick a date"
- Snoozed items show a small clock icon + date badge
- Snoozed items are hidden from default views, shown in a "Snoozed" tab/filter
- Auto-resurface: a daily cron job checks `snoozed_until < now()` and moves items back to active + creates a notification

**Cron route:** `POST /api/cron/resurface` (secured with `CRON_SECRET`)

### 3.6 Rich Empty States

**Every list/view gets a contextual empty state matching Lane's tone.**

| View | Empty state copy | CTA |
|------|-----------------|-----|
| My Work (designer) | "You're clear. Time to think, learn, or help a teammate." | None — breathing room |
| My Work (PM) | "All clear. Good time to review your impact data." | "View Impact →" |
| Intake (empty) | "No requests waiting. The intake is clear." | "Learn about intake →" |
| Reflections (none) | "When you're ready, share what you're thinking. No rush." | "Write a reflection" |
| Stickies (empty) | "A place for fleeting thoughts. Press N then S to start." | None |
| Cycle (no requests) | "This cycle is empty. Head to the betting board to add requests." | "Betting Board →" |
| Iterations (empty) | "Start exploring directions. There's no wrong answer yet." | "Add Direction" |
| Comments (empty) | "No comments yet. Start the conversation." | "Write a comment" |
| Team analytics | "Not enough data yet. Insights appear after your first completed cycle." | None |

**Component:** `<EmptyState icon={...} title="..." subtitle="..." cta={{ label, href }}? />`

### 3.7 Notification Preferences

**Route:** `/settings/notifications`

**Layout:** Settings page with a table-like grid:

```
Category          In-App    Email
─────────────────────────────────
AI Nudges         [✓]       [ ]
Comments          [✓]       [✓]
Stage Changes     [✓]       [ ]
Mentions          [✓]       [✓]
Weekly Digest      —        [✓]
Morning Briefing  [✓]        —
```

**Behavior:**
- Toggles save immediately (optimistic UI, server action)
- "Reset to defaults" button
- Respects Lane principle: designers control their own notification cadence

**Integration:** All notification-sending code checks preferences before dispatching. The existing notifications system queries `notification_preferences` before creating a notification row or sending an email.

### 3.8 Stickies + Reflections (Unified)

**UI Component:** `<StickyPad />` — a floating button in the bottom-right corner (like a FAB).

**Click → opens a small capture card:**
- Text area (auto-expanding, max 500 chars)
- Color picker (5 colors: cream, green, rose, sky, amber)
- Optional: "Link to request" dropdown (searches your assigned requests)
- Pin toggle
- Save / discard

**Stickies panel:** Accessible from sidebar ("Stickies" under Personal section) or `G then S`.
- Grid of sticky cards, pinned first, then by recency
- Click to edit inline
- Archive button (soft delete)
- Filter: All | Pinned | Linked (reflections)

**In request detail:** When a sticky is linked to a request, it appears in the request's timeline section as "Reflection by {name}" with the sticky content. Only visible to the author unless explicitly shared (future feature).

### 3.9 Appetite-Based Cycles (Project-Level)

**Route:** `/dashboard/cycles` (list) + `/dashboard/cycles/[id]` (detail)

**Cycle list page:**
- Grouped by project
- Each cycle card: name, status badge, appetite (e.g., "6 weeks"), date range, request count, aggregate progress (% of requests completed)
- Only ONE active cycle per project at a time (enforced in API)
- Create cycle: name, project, appetite in weeks, start date

**Cycle detail page:**
- Header: cycle name, status, appetite bar (time elapsed vs budget)
- Request list within the cycle (reuses `<RequestList>` with cycle filter)
- Aggregate stats: requests by phase, throughput (requests completed this cycle)
- NO per-designer breakdown visible to leads
- "Transfer incomplete" action when cycle ends → moves un-completed requests to next cycle or back to betting board

**Appetite bar visualization:**
```
[████████░░░░░░░░] 4 of 6 weeks elapsed — 8 of 12 requests completed
```

### 3.10 Initiatives

**Route:** `/dashboard/initiatives` (list) + `/dashboard/initiatives/[id]` (detail)

**Initiative list:**
- Cards with: name, color dot, description snippet, request count, status
- Create: name, description, color

**Initiative detail:**
- Header: name, description, status
- Request list filtered to this initiative
- Add/remove requests (search + add)
- A request can belong to multiple initiatives

**In request detail:** Show initiative badges (colored pills) in the header area.

### 3.11 Team-Level Analytics

**Route:** `/dashboard/insights` (enhance existing page)

**Metrics (all aggregate, never per-individual to leads):**

1. **Pipeline view:** Request count by phase (predesign | design | dev | track) — horizontal bar chart
2. **Flow rate:** Requests entering vs. exiting each phase per week — line chart
3. **Intake health:** Acceptance rate, avg triage time, quality score distribution
4. **Cycle throughput:** Requests completed per cycle, appetite utilization %
5. **Impact calibration:** PM prediction accuracy (aggregate) — scatter plot of predicted vs actual
6. **Initiative progress:** Per-initiative completion % — progress bars

**Individual view (self only):** A designer can see their own throughput, reflection count, and time-in-stage averages. This is NEVER visible to leads or peers.

**Charts:** Use `recharts` (already implied by the chart.tsx component in UI).

### 3.12 Request Timeline (Activity Log)

**Location:** New tab in the request detail dock — "Timeline" alongside existing panels.

**Shows chronological feed of:**
- Stage/phase transitions: "Moved to Design → Sense" with actor
- Assignments: "Assigned to Sarah by Lead"
- Comments: inline preview
- Reflections: linked stickies (author only sees their own)
- Figma updates: "Figma file updated" with link
- AI actions: "AI triage completed — P1, Medium complexity"
- Cycle/initiative changes: "Added to Cycle 4"

**Each entry:** Avatar, action text, relative timestamp, expandable metadata.

**Implementation:** All mutations (stage changes, assignments, comments, etc.) write to `activity_log` table. The timeline component fetches and renders them.

### 3.13 Inline Commenting (Per-Iteration)

**Location:** Inside the Diverge and Converge stage panels in request detail.

**Iteration card structure:**
```
┌─────────────────────────────────────────┐
│ Direction A — Bottom navigation          │
│ [Figma link]  [description]              │
│                                          │
│ 💬 3 comments                            │
│ ┌─ Sarah: "Love this direction but..."  │
│ ├─ Mike: "Agreed, the tab bar feels..." │
│ └─ Sarah: "@Mike good point, I'll..."   │
│                                          │
│ [Write a comment...]                     │
└─────────────────────────────────────────┘
```

**Threading:** One level of nesting (reply to a comment). Uses `parentId` in `iteration_comments`.

**Mentions:** `@name` syntax in comment body. Triggers a notification (respects preferences).

### 3.14 Published Views

**Creation:** From any filtered view, click "Share" → "Publish this view"
- Name the view
- Toggle: "Authenticated users only" or "Anyone with link"
- Toggle: "Allow comments" / "Allow voting" (future)
- Generates URL: `/views/[id]` (authenticated) or `/views/[id]?token=[publicToken]` (public)

**Public view page:**
- Read-only rendering of the filtered request list
- Shows: title, phase/stage, priority, project — NO assignee names in public mode
- Branded with org name + Lane logo
- Optional comment sidebar (if enabled)

**Route:** `/views/[id]` — a public-facing route outside the `(dashboard)` layout group.

### 3.15 Rich Empty States (Component)

**Shared component used across all features:**

```typescript
interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number }>;
  title: string;
  subtitle?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
}
```

**Styling:** Centered vertically, muted icon (40px), title in text-primary (14px, weight 560), subtitle in text-secondary (13px), CTA as a subtle text link with arrow.

---

## 4. Agent Workstream Decomposition

### Agent 1: Schema & Migrations
- All new tables (sections 2.1–2.11)
- Export types from `db/schema/index.ts`
- Snooze fields on requests table

### Agent 2: Command Palette + Filter Chips
- Enhanced command palette with Power K shortcuts
- `useHotkeys` hook for two-key sequences
- Filter chips component
- URL-param backed filters
- Saved views (create/load)

### Agent 3: Intake Split-Pane + Empty States
- `/dashboard/intake` route and page
- Split-pane layout component
- Triage action bar (accept, decline, snooze, duplicate)
- `<EmptyState>` component
- Empty states across all existing views

### Agent 4: Stickies + Notifications Preferences
- `<StickyPad>` floating capture component
- Stickies panel page/view
- Stickies linked to requests (reflections)
- `/settings/notifications` page
- Notification preferences form with toggles
- Server actions for saving preferences

### Agent 5: Cycles + Initiatives + Analytics
- `/dashboard/cycles` list + `[id]` detail pages
- Cycle CRUD server actions
- Appetite bar component
- `/dashboard/initiatives` list + `[id]` detail pages
- Initiative CRUD server actions
- Enhanced `/dashboard/insights` with aggregate charts
- Pipeline, flow rate, intake health, cycle throughput visualizations

### Agent 6: Timeline + Inline Comments + Published Views
- Activity log component in request detail dock
- Activity log write helpers (called from existing mutations)
- Iterations table UI in Diverge/Converge panels
- Per-iteration comment threads
- `/views/[id]` public route
- Published view creation UI
- Public token generation + access validation

---

## 5. Anti-Surveillance Audit Checklist

Before shipping, verify:

- [ ] No individual utilization % visible to leads anywhere
- [ ] No "last active" timestamps anywhere
- [ ] No per-designer speed comparisons
- [ ] Stickies/reflections are private by default
- [ ] AI nudges route to designer, not lead
- [ ] Team analytics show aggregate only
- [ ] Cycle throughput is team-level, not individual
- [ ] Published views strip assignee names in public mode
- [ ] Notification preferences give designers full control
- [ ] All AI recommendations show reasoning

---

## 6. Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Schema migration on live DB | Run `db:push` in dev first, test thoroughly |
| Multiple agents editing same files | Schema agent runs first; UI agents work on different directories |
| Filter chip URL params conflicting with existing `?project=` | Extend existing param pattern, don't replace |
| Cycles + initiatives adding nav clutter | Add under existing sidebar sections, not new top-level items |
| Published views security (public tokens) | Tokens are random UUIDs, rate-limited, no sensitive data exposed |
| Recharts bundle size | Already have `chart.tsx` component — verify it's sufficient |
