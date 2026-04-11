# Lane Navigation Redesign — Design Spec

**Date:** April 10, 2026
**Status:** Draft — awaiting review
**Scope:** Sidebar restructure, Home page, Requests page with contextual views, Projects as first-class entity, Pinned Views

---

## Problem

The current sidebar has 14 links organized into 3 arbitrary groups (Personal, Workspace, Insights) that don't reflect Lane's core mental model. Phases are invisible in navigation. Stages are buried in the detail dock. Related pages are scattered across unrelated groups (Intake under Workspace, Impact under Insights). The result: users can't build a mental model of where things live, and the density is overwhelming.

## Design Decisions (from brainstorming)

| Question | Decision | Rationale |
|---|---|---|
| Navigation paradigm | Object-first (Linear-style) | One powerful Requests view with grouping/filtering beats separate pages per phase |
| Home page | Same layout all roles, data personalizes | Focus ordering surfaces what matters per user without role-specific UI |
| Dev Board | Contextual view mode inside Requests | Kanban toggle appears only when filtered to Dev phase |
| Design stages | Grouping option inside Requests | Non-linear stages don't suit a kanban — list/board with stage grouping works better |
| Projects | First-class entity, user-configurable | Lightweight containers for requests with name, lead, members, target date, status |
| Role adaptation | Pinned Views + Focus ordering | No role-specific pages — users create saved filtered views, Lane ships role-based defaults |

---

## 1. Sidebar Structure

### New sidebar: 9 core links + Pinned Views section

```
┌──────────────────────────┐
│ [Org Icon] Lane    ⌘K    │  ← Org name + global search shortcut
│                          │
│ ⌂  Home                  │  ← Smart focus ordering
│ 📥 Inbox           [3]   │  ← Notifications with unread count
│                          │
│ ─────────────────────    │
│                          │
│ ⚡ Requests               │  ← THE main work view
│ 📁 Projects               │  ← Org-level project containers
│ 💡 Ideas                  │  ← Idea board + voting
│ 🎯 Cycles                 │  ← Time-boxed planning
│                          │
│ ─────────────────────    │
│                          │
│ 📊 Insights               │  ← Capacity + Impact + Pipeline
│ 👥 Team                   │  ← Members + Health + Radar
│                          │
│ ─────────────────────    │
│                          │
│ PINNED VIEWS             │  ← User-created saved filters
│ ↳ My Design Work         │
│ ↳ Partner App Pipeline   │
│ ↳ Needs Sign-off         │
│                          │
│ ─────────────────────    │
│ [Avatar] Yash   ⚙  🚪   │  ← Profile, settings, logout
└──────────────────────────┘
```

### What was removed and where it went

| Removed from sidebar | New location |
|---|---|
| My Work | Replaced by **Home** |
| Drafts | Tab/filter inside Home ("Drafts" tab alongside Assigned/Created/Activity) |
| Stickies | Floating widget (already exists as `<StickyPad>`) — no sidebar link needed |
| Intake | Requests filtered to `phase:predesign, stage:intake` |
| Journey View | Replaced by Requests grouped by Phase |
| Betting Board | Requests filtered to `stage:bet` (or accessible via Cycles) |
| Dev Board | Requests filtered to `phase:dev` with kanban toggle |
| All Requests | Redundant — IS the Requests page now |
| Initiatives | Folded into Cycles or available as a Project filter |
| Capacity (separate page) | Merged into Insights |
| Impact (separate page) | Merged into Insights |
| Team Health / Radar | Merged into Team |

### Sidebar behavior

- **Customizable:** Users can drag to reorder items, right-click to hide
- **Collapsible:** Sidebar can collapse to icon-only mode (like Linear)
- **Pinned Views section:** Grows as users save views; empty state shows "Save a filtered view from Requests to pin it here"
- **"+ New Request" button:** Stays in sidebar header area, always accessible
- **Notification style:** Configurable — dot vs count badge on Inbox

---

## 2. Home Page

### Purpose
The single entry point after login. Shows your most relevant work, ordered by urgency. Same layout for all roles — the data query personalizes it.

### Focus ordering (priority of sections)

1. **Morning Briefing** — Daily AI-generated brief, role-aware content, dismissible card at top
2. **Needs Your Attention** — Sign-offs pending (Prove gate), requests where you're asked for input, blocks
3. **Active Work** — Requests assigned to you currently in progress (designers see design-phase work, PMs see their submitted requests' movement)
4. **Recently Updated** — Requests you're subscribed to or created that had recent activity
5. **Completed** — Recently shipped/completed (collapsed by default)

### Tabs (like Linear's My Issues)

```
[Assigned]  [Created]  [Subscribed]  [Activity]  [Drafts]
```

- **Assigned:** Requests where you are the designer_owner or dev_owner
- **Created:** Requests you submitted (PM view)
- **Subscribed:** Requests you're watching
- **Activity:** Requests with recent comments, stage changes, sign-offs involving you
- **Drafts:** Your draft requests not yet submitted

Each tab maintains the Focus ordering within it.

### What Home replaces
- Current "My Work" page (dashboard/)
- Current "Drafts" page (dashboard/drafts)
- The need for role-specific dashboards

---

## 3. Requests Page

### Purpose
The ONE view for all requests in the workspace. All phases, all stages, all statuses — filterable, groupable, with contextual view modes.

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Requests                                    [+ New Request] │
│                                                             │
│ [All] [Predesign] [Design] [Dev] [Impact]  ← Phase tabs    │
│                                                             │
│ Group: Phase ▾   Filter ▾   Sort ▾    [≡ List] [⊞ Board]  │
│                                           ☆ Save View       │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  (content area — changes based on filters and view mode)    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase quick-filter tabs

Horizontal tabs across the top of the Requests page. Clicking a phase tab:
- Filters to that phase
- May change the available view modes
- Shows count per phase as a badge

| Tab | Filter applied | View modes available |
|---|---|---|
| All | No phase filter | List (with any grouping) |
| Predesign | `phase:predesign` | List (with any grouping) |
| Design | `phase:design` | List, Board (grouped by design stage) |
| Dev | `phase:dev` | List, **Kanban** (drag-drop columns) |
| Impact | `phase:track` | List (with any grouping) |

### Contextual view modes

**Default: List view** — All phases support list view. Rows show: title, phase badge, stage badge, priority, assignee, project, updated date.

**Board view (Design phase):** When filtered to Design, board view groups requests into columns by design stage (Sense / Frame / Diverge / Converge / Prove). Cards are NOT draggable between columns — design stages are non-linear, so the designer moves stages from within the request detail, not by dragging.

**Kanban view (Dev phase only):** When filtered to Dev, a kanban toggle appears. Columns: To Do / In Progress / In Review / Design QA / Done. Cards ARE draggable between columns. Design QA column has a gate — requires designer confirmation before moving to Done.

### Grouping options

The "Group by" dropdown offers:

- **Phase** — Groups: Predesign, Design, Dev, Impact
- **Stage** — Groups by the current substage (intake, sense, frame, todo, etc.)
- **Project** — Groups by project (Consumer App, Partner Portal, etc.)
- **Assignee** — Groups by designer_owner or dev_owner
- **Priority** — Groups: P0, P1, P2, P3, Unset
- **Cycle** — Groups by which cycle the request is in
- **None** — Flat list

Groupings are combinable with filters. Example: Filter to `phase:design` + Group by `project` = design-phase requests organized by product area.

### Filter options

- Phase (predesign, design, dev, track)
- Stage (any substage)
- Project (any project)
- Assignee (any team member)
- Priority (P0–P3)
- Status (draft, submitted, triaged, assigned, in_progress, etc.)
- Cycle
- Created by
- Date range (created, updated)

### Save View

Any combination of filters + grouping + view mode can be saved as a named View. Saved views can be:
- **Pinned to sidebar** — appears in the Pinned Views section
- **Shared with team** — visible to all workspace members
- **Private** — visible only to the creator

Lane ships **default views per role** as starter templates:

| Role | Default pinned view | Filter |
|---|---|---|
| Designer | "My Design Work" | `phase:design + assigned:me` |
| PM | "My Requests Pipeline" | `created:me + group:phase` |
| Lead | "Needs Sign-off" | `stage:prove + pending_signoffs` |
| Lead | "Team Pipeline" | `group:phase` (all requests) |

Users can delete, modify, or add to these defaults.

---

## 4. Projects (First-Class Entity)

### Purpose
Lightweight, user-configurable containers that requests belong to. Not project management — just organizational grouping with enough metadata for smart assignment and accountability.

### Data model

```typescript
{
  id: string,
  org_id: string,
  name: string,                    // "Consumer App", "Partner Portal"
  description: string | null,      // One-liner
  icon: string | null,             // Emoji or icon identifier
  color: string | null,            // Hex color for visual identification
  lead_id: string | null,          // User who owns this area
  target_date: date | null,        // Soft accountability (appetite-style)
  status: 'active' | 'archived',
  created_at: timestamp,
  updated_at: timestamp,
}
```

### Project members (join table)

```typescript
{
  project_id: string,
  user_id: string,
  role: 'member' | 'lead',        // lead is also set on project.lead_id
  joined_at: timestamp,
}
```

### Request ↔ Project relationship

Each request has an optional `project_id` foreign key. A request belongs to zero or one project.

### Where Projects appear

- **Requests page:** Group by Project, filter by Project
- **Project selector on request creation:** Dropdown when creating a new request
- **Request detail dock:** Project badge shown in metadata
- **Smart assignment:** AI considers project membership when recommending designers
- **Insights page:** Filter insights by project
- **Projects page (`/dashboard/projects`):** All active projects with request counts, phase breakdown, target date status, lead
- **Settings → Projects:** Full CRUD for projects (create, edit members, archive)
- **Inline creation:** "+ Create new project" option in project dropdown during request creation

### Target date behavior

- Displayed as: "Target: May 15"
- When exceeded: "Appetite exceeded by 3 days" (NOT "overdue" — per Lane's language guide)
- No automatic escalation, no red warnings to leads
- AI may include in morning briefing: "The Partner Portal target was May 15 — still 2 open requests in Design."
- Purely informational accountability, not a gate or blocker

### Who can create/manage projects

| Role | Create | Edit | Archive | Add members |
|---|---|---|---|---|
| Admin | Yes | All projects | All projects | All projects |
| Lead | Yes | Their projects | Their projects | Their projects |
| PM | Yes (inline during request creation) | Description only | No | No |
| Designer | No | No | No | No |

### What Projects are NOT

- Not a planning/scheduling tool (that's Cycles)
- Not a progress tracker with % complete (the phase model handles flow)
- Not a timeline/roadmap (defer to v2)
- Not teams (a designer can be a member of multiple projects)

---

## 5. Insights Page (Merged)

### Purpose
Single page combining what was previously Capacity, Impact, and Pipeline analytics.

### Sections (tabs or scrollable sections)

1. **Pipeline** — Request counts by phase, stage breakdown, flow rate
2. **Capacity** — Team workload distribution (team-level, never individual utilization %)
3. **Impact** — PM prediction accuracy, impact records, calibration scores
4. **Quality** — Request quality scores, intake gate pass rates

All sections filterable by: Project, Cycle, Date range, Team.

---

## 6. Team Page (Merged)

### Purpose
Single page combining what was previously Team Members, Team Health/Radar.

### Sections (tabs)

1. **Members** — Team roster, invite management, roles
2. **Health** — Team health signals, phase heatmap, risk indicators (lead-only visibility per RBAC)
3. **Radar** — Design radar visualization (existing radar page content)

---

## 7. Inbox

### Purpose
Unified notification center. Replaces scattered notification patterns.

### Content
- Sign-off requests (Prove gate)
- Comments and mentions
- Request stage changes (for subscribed requests)
- AI nudges (private, designer-only)
- Figma update alerts (post-handoff)
- Idea board votes on your ideas

### Behavior
- Unread count shown on sidebar badge
- Mark as read, archive, snooze
- Configurable notification preferences in Settings

---

## 8. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` | Global search (requests, people, projects, views) |
| `⌘N` | New request |
| `G then H` | Go to Home |
| `G then R` | Go to Requests |
| `G then I` | Go to Inbox |

---

## 9. Migration Path (Current → New)

This redesign doesn't require new database tables (except Projects enhancement). It's primarily a UI reorganization:

1. **Sidebar component rewrite** — New link structure, pinned views section, collapsible
2. **Home page rewrite** — Focus ordering query, tabs, morning briefing integration
3. **Requests page enhancement** — Phase tabs, group-by, contextual view modes, save view
4. **Projects enhancement** — Add icon, color, target_date, members join table
5. **Insights page merge** — Combine capacity + impact + pipeline into tabbed page
6. **Team page merge** — Combine members + health + radar into tabbed page
7. **Route cleanup** — Remove old routes, add redirects for bookmarks

### Routes mapping

| Old route | New route | Notes |
|---|---|---|
| `/dashboard` | `/dashboard` | Rewritten as Home with focus ordering |
| `/dashboard/drafts` | `/dashboard` (Drafts tab) | Folded into Home |
| `/dashboard/stickies` | Removed (floating widget) | `<StickyPad>` already exists |
| `/dashboard/intake` | `/dashboard/requests?phase=predesign&stage=intake` | Filter on Requests |
| `/dashboard/journey` | `/dashboard/requests?group=phase` | Grouping on Requests |
| `/dashboard/betting` | `/dashboard/requests?stage=bet` | Filter on Requests |
| `/dashboard/dev` | `/dashboard/requests?phase=dev&view=kanban` | Contextual kanban |
| — | `/dashboard/projects` | New: project overview page |
| `/dashboard/ideas` | `/dashboard/ideas` | Unchanged |
| `/dashboard/cycles` | `/dashboard/cycles` | Unchanged |
| `/dashboard/initiatives` | `/dashboard/cycles` | Merged into Cycles |
| `/dashboard/insights` | `/dashboard/insights` | Merged (capacity + impact + pipeline) |
| `/dashboard/insights/impact` | `/dashboard/insights?tab=impact` | Tab within Insights |
| `/dashboard/radar` | `/dashboard/team?tab=health` | Tab within Team |
| `/dashboard/team` | `/dashboard/team` | Enhanced with health + radar tabs |
| `/dashboard/inbox` | `/dashboard/inbox` | Unchanged |

---

## 10. Anti-Surveillance Compliance Check

All changes verified against CLAUDE.md anti-surveillance principles:

- Home Focus ordering uses assignment and subscription data, NOT activity frequency
- No "last active" timestamps surfaced anywhere in new design
- No individual utilization % — Insights shows team-level capacity only
- Project target dates show "appetite exceeded," not "overdue"
- No automatic escalation when targets are exceeded
- AI morning briefing is private to the individual
- Pinned views respect existing RBAC — leads see team data, designers see own data

---

## Resolved Questions

1. **Design phase board: no drag-drop.** Design stages are non-linear — designers jump freely between Sense/Frame/Diverge/Converge. Drag-drop implies linear progression, which contradicts Lane's design philosophy. Stage changes happen inside the request detail, where the designer adds a reflection on why they're moving. The board view is a read-only spatial visualization, not a workflow tool.

2. **Projects are workspace-level and shared (Figma/Linear style).** Not personal — the whole org sees the same projects. This is required for Group by Project, smart assignment, and org-level Insights to work. Projects are created by Admins, Leads, and PMs (inline during request creation: "This is for: [+ Create new project]"). Full CRUD lives in Settings → Projects, but the primary creation path is inline. Projects also get a dedicated page at `/dashboard/projects` showing all active projects with request counts, phase breakdown, target date status, and lead.

3. **Pinned views: unlimited, fully user-controlled.** No cap on saved views. Lane ships deletable default starter views per role. Users create unlimited additional views, private or shared with the workspace.
