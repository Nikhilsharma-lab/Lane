# DesignQ — Left Navigation Spec

Authoritative spec for the left navigation. Claude Code reads this at the start of every session. If this file and a prompt disagree, this file wins. If you want to change behavior, change this file first.

**Philosophy anchors:** Flat and searchable (no infinite nesting). Role-based visibility enforced at the database level. Support produces truth — the admin sees what's happening, does not gate it.

---

## 1. Structure — three zones

The sidebar has exactly three zones, in this top-to-bottom order.

### Zone 1: Workspace header
- Workspace name with dropdown (opens switcher popover)
- Global search input (`⌘K`)

### Zone 2: Personal
Always first after the header. Never changes regardless of which team context the user is in.
- Inbox
- My streams
- My drafts
- Saved
- Idea board

For admins and Design Heads (5+ teams), a **Cross-team views** subsection appears below Personal with saved filters:
- All in validation
- Stalled > 2 weeks
- PM accuracy < 60%
- Handoff quality flags

Cross-team views are stored in a `saved_views` table as JSONB filters. The four defaults are seeded on workspace creation.

### Zone 3: Teams
One collapsible section per team the user belongs to. Each section has **exactly five fixed items** — no more, no folders, no sub-projects, no trees:
- Active streams
- Intake queue
- Commitments
- Validation gate
- Archive

### Footer
Pinned to the bottom of the sidebar.
- Invite
- Settings

---

## 2. Role model

### Workspace roles (four tiers, fixed — no custom roles in v1)

| Role | Purpose | Key permissions |
|---|---|---|
| **Owner** | Signup user, transferable | Billing, SSO, delete workspace, promote admins |
| **Admin** | Design Head / DesignOps | Everything except billing and deletion. Creates teams, manages integrations, sees all streams |
| **Member** | Default — most designers and PMs | Creates streams in teams they belong to, comments, participates in commit cycles |
| **Guest** | External reviewers (free seat) | Scoped to specific streams only. Can view and comment. No team visibility |

### Team roles (per team, separate from workspace role)
`lead`, `designer`, `pm`, `contributor` — plus an `is_team_admin` boolean flag.

A user can be workspace `member` and team `lead` with `is_team_admin = true` — that's a Design Head for one product area. This combination is supported and common.

### Per-stream permissions (flags, not roles)
- **Stream Owner** — single accountable designer. Edits appetite, phase, closes stream
- **Validation Gate Approver** — derived from (Stream Owner, team PM, team lead). Three sign-offs required to pass the gate. Do **not** create a separate table for approvers — derive them

### Who decides roles
- Workspace Owner and Admins assign workspace roles
- Team Admins (the `is_team_admin` flag) manage their team's membership
- Members cannot self-promote or invite outside their streams
- This is non-negotiable for enterprise security review

---

## 3. Role-aware default ordering

Same sidebar structure for everyone. Different default expand/collapse, different landing screen, different badge emphasis.

### Designer (Member)
- **Lands on:** My streams
- Team sections: expanded by default
- Top of each team section: Active streams (pre-selected)
- Validation gate: red badge if approvals pending
- Commitments: present but below the fold

### PM (Member)
- **Lands on:** Intake queue of their primary team
- **Intake queue is promoted** to the top of each team section (above Active streams)
- Personal zone gains **Impact tracking** — streams they predicted outcomes for, with badge when actuals due

### Design Head (Admin)
- **Lands on:** Weekly AI report
- Personal zone: Cross-team views surfaced prominently
- Team sections collapse by default (they manage many)
- Commitments promoted in each team section

### Workspace Owner
- Same as Admin
- Settings surfaced in Personal zone, not just footer
- Billing badge when invoices due

### Guest
- Personal zone only, containing "Shared with me"
- **No team sections render at all**
- Landing screen: most recently updated stream they have access to

**Implementation:** role lives on `team_memberships.role`, not `users.role`. Sidebar reflects per-team role. A user who is a lead in Team B and a designer in Team A gets both treatments correctly.

---

## 4. Database schema

Five tables. Do not add columns not listed here without updating this spec first.

```sql
-- Workspaces
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid not null references auth.users(id),
  created_at timestamptz default now()
);

create type workspace_role as enum ('owner', 'admin', 'member', 'guest');

create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role workspace_role not null default 'member',
  invited_by uuid references auth.users(id),
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz default now(),
  unique (workspace_id, slug)
);

create type team_role as enum ('lead', 'designer', 'pm', 'contributor');

create table team_memberships (
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role team_role not null default 'designer',
  is_team_admin boolean default false,
  created_at timestamptz default now(),
  primary key (team_id, user_id)
);

create table streams (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  phase text not null default 'sense',
  owner_id uuid references auth.users(id),
  appetite_weeks int,
  created_at timestamptz default now()
);

create table stream_guests (
  stream_id uuid references streams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) not null,
  can_comment boolean default true,
  created_at timestamptz default now(),
  primary key (stream_id, user_id)
);
```

### Required indexes
- `team_memberships(user_id)`
- `workspace_members(user_id, workspace_id)`
- `stream_guests(user_id)`

Without these, RLS subqueries run full scans on every row load. A Design Head at 200 streams will feel sluggish.

### RLS policies (on `streams`)
Three policies, OR'd together by Postgres:

```sql
alter table streams enable row level security;

create policy "members_see_team_streams" on streams for select using (
  team_id in (select team_id from team_memberships where user_id = auth.uid())
);

create policy "admins_see_all" on streams for select using (
  workspace_id in (
    select workspace_id from workspace_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  )
);

create policy "guests_see_invited_streams" on streams for select using (
  id in (select stream_id from stream_guests where user_id = auth.uid())
);
```

Apply the same pattern to any other table guests will read (comments, artifacts) when those exist.

### Required RLS tests (Vitest)
Seed three users — admin, team member, guest — and assert each sees the right rows. This test suite is non-negotiable. A failing RLS test blocks the session until fixed.

---

## 5. Badge hierarchy

Three tiers. Nothing exists outside them. All badges route through a single `<Badge tier={1|2|3} value={number}>` component.

### Tier 1 — Action required from you (red, numeric)
Things where *your* inaction blocks progress. Examples:
- Validation Gate approvals waiting on you
- @mentions in active streams
- Intake requests assigned to you for shaping

Red is reserved for "waiting on you." Not "overdue," not "important," not "stalled." Only personal action items.

### Tier 2 — New activity in your world (neutral text-tertiary, numeric)
Things you'll probably want to know about but nothing breaks if you don't look today.
- New comments on streams you own
- New streams in your team's Intake queue
- Inbox items that aren't mentions

Most badges in the product live here.

### Tier 3 — Ambient signal (single dot, no number)
"Something happened somewhere you're not currently looking."
- Collapsed team sections
- Workspace switcher for other workspaces
- Team section headers when you're inside a different team

### Rules
- One tier per location. A Tier 1 number and a Tier 3 dot cannot coexist on the same item
- Counts cap at `99+`, with one exception: the **Validation gate count never caps**. If it hits 99, show the raw number in red. That's a crisis signal and rounding hides severity
- Counts reset on *view*, not on *click*. Opening the Inbox marks items as seen
- Dots never appear on items the user is currently viewing
- The Friday AI report gets a Tier 1 red dot exception — red, but a dot not a number. Fades to Tier 2 on Monday. Gone by Wednesday

---

## 6. Active state and canonical location

### The rule
Highlight the **canonical location** of the current thing, not the entry point.

- A stream's canonical location is always `{team} → Active streams`
- Validation gate is a **filter**, not a location. Entering it highlights "Validation gate" while you're on the list. Click into a specific stream — highlight moves to Active streams
- Cross-team views work the same. "All in validation" highlights on the list. Click a stream — highlight jumps to the stream's team → Active streams, and the team section auto-expands if collapsed
- Cross-team view stays visible in the sidebar (not highlighted) so the user knows how to get back

### Breadcrumb
Inside a stream, show a breadcrumb at the top of the main pane: `Consumer app · Active streams · KYC friction audit`. Each segment clickable. Sidebar tells you where the thing *lives*; breadcrumb tells you where you came *from*.

### Inbox exception
Clicking an inbox item keeps Inbox highlighted during triage flow. Highlight moves only when the user navigates somewhere explicit.

### Implementation
Pure function: `getActiveNavItem(pathname, streamContext)` returns the nav item key to highlight. Unit test for each case (stream, cross-team, inbox, team-scoped filter).

---

## 7. Keyboard navigation

### Global shortcuts (always work, never conflict)
- `⌘K` — command palette
- `⌘⇧O` — workspace switcher
- `⌘/` or `?` — keyboard shortcut cheatsheet
- `Esc` — close modal / clear selection / exit focused state

### Jump shortcuts (`G then letter`)
Two-keystroke jumps to canonical Personal zone locations:
- `G I` — Inbox
- `G M` — My streams
- `G D` — Drafts
- `G B` — Idea board
- `G R` — Weekly report (Admin only; no-op for others)
- `G V` — Cross-team: all in validation

**No per-team jump shortcuts.** Use `⌘K` for team navigation — scales cleanly.

### Sidebar-focused navigation
- `⌘⇧E` or `Esc` from main pane — focus the sidebar
- `↑ ↓` — move between visible rows
- `← →` — collapse/expand team sections
- `Enter` — activate
- `Tab` — move focus to main content

### Command palette (`⌘K`)
Use `cmdk`. Searches: streams by title, teams by name, people, saved cross-team views, settings screens, and **actions** ("create stream", "invite guest"). Wire to same data source as sidebar.

### Libraries
- `react-hotkeys-hook` for global and jump shortcuts
- `cmdk` for the palette

---

## 8. Empty and overflow states

### Brand-new workspace, zero teams
- Personal zone renders fully, with legitimately empty destinations behind each item
- Below Personal: a **"Create your first team" card inline in the sidebar** — not a modal, not full-screen onboarding
- Card has: one-line description, name input, primary button
- Creating the team replaces the card with the first team section

**Do not seed sample content.** Design leaders delete it in 30 seconds and resent the cleanup.

### Team with zero streams
- Section renders normally with all five fixed items
- Clicking Active streams lands on an empty state with "New stream" primary and "Submit to intake" secondary
- Do not progressively disclose the five items. Fixed structure, empty destinations

### User with 5+ teams
- Default-collapse teams past the top 4 most recently interacted with
- Auto-surface Cross-team views in Personal zone (even for non-admins at this scale)
- Teams 5+ collapse into a "More teams (N)" expandable group
- **No search inside the sidebar.** Use `⌘K` for team navigation — one search mechanism, used everywhere

### Counts
- Cap at `99+` for Inbox, My streams, Intake queue, comments
- Validation gate **never caps** — raw number in red past 99

---

## 9. Guest invitation flow

Six steps. Scoped to a single stream by construction.

### Steps
1. **Trigger**: Member clicks "Share" on a stream detail page. Single entry point — no workspace-wide invite-guest button anywhere
2. **Modal**: email input, optional message, one toggle ("Can comment" default on). No role picker, no expiry, no permission matrix
3. **Server**: create or fetch `workspace_members` row with `role = 'guest'`. Create `stream_guests` row. Idempotent. Existing members: no workspace role change
4. **Email**: Resend. Subject like "Priya invited you to review 'Onboarding redesign' on DesignQ." One button: "Open stream" (magic link, creates session, lands directly on stream)
5. **First session**: guest mode sidebar (Personal zone only, "Shared with me"). One-time inline tooltip: "You're a guest on this stream. You can view and comment." No tour, no empty states, no marketing
6. **Admin visibility**: invite event logged to `audit_events`, surfaced in admin's weekly digest. Not a notification, not approval — just visible

### Edge cases
- **Guest → Member upgrade**: admin promotes, `workspace_members.role` flips to `member`, added to a team. Existing `stream_guests` rows stay intact. No access loss
- **Member → Guest downgrade**: remove from all teams, flip role. Default: clear `stream_guests`. Admin can opt to preserve specific streams
- **Guest removed from stream**: delete `stream_guests` row. If it was their only stream, leave the `workspace_members` row orphaned — don't auto-delete. They might get re-invited next week

### Guests are free
Always. Do not count toward seat billing. This matters for deal closure.

---

## 10. Workspace switcher

### Behavior
- Clicking workspace name opens a **popover**, not a dropdown
- Popover contents: workspace list with name, role badge, unread count
- "Create workspace" and "Join workspace" at the bottom
- Shortcut: `⌘⇧O`

### What persists across switch
- Auth session
- User-level UI preferences (dark mode, sidebar collapsed state)
- Last visited screen **per workspace**

### What does NOT persist
- Search queries, active filters
- Draft comments and streams
- Unread state
- Selected team / active cross-team view
- Inbox (each workspace has its own)

### Unread signal
- Numeric per-workspace badges in the popover
- Single aggregated dot on the workspace icon in collapsed state
- Never merge inboxes or aggregate counts across workspaces

### Weekly AI report
**Per-workspace, never aggregated.** A Design Head at two companies gets two separate Friday emails. The report is a team artifact, not a personal digest.

### Edge case
User removed from workspace while viewing it: show modal ("You've been removed from X. Switch to another workspace?") with remaining workspace list. Never boot silently.

---

## 11. Mobile / narrow viewport

DesignQ is not mobile-first. Design ops work happens on laptops. Optimize for two mobile cases only:
1. Design Head checking the weekly report on Saturday morning
2. Stakeholder clicking a guest invite link from a phone

### Breakpoints
- **Desktop (≥1024px)**: full sidebar
- **Tablet (768–1023px)**: sidebar narrows to ~220px, no structural changes
- **Mobile (<768px)**: sidebar becomes a drawer, hamburger toggle, no bottom tab bar

### What works on mobile
- Workspace switcher (from drawer header)
- Personal zone (fully functional)
- Team sections (collapsible as on desktop)
- Cross-team views
- **Weekly AI report** — fully readable, proper responsive typography. This is the most important mobile destination
- Cross-team action surfaces reflow to single column

### What degrades acceptably
- Figma Sync activity feed delegates to the Figma mobile app
- Commitments renders read-only
- Intake forms work but are clunky (intake is a desk activity)
- Keyboard shortcuts disabled entirely

### The one polished mobile flow
Guest invite landing: clean mobile-rendered stream view, readable context, comment works. This is the flow that converts external reviewers into repeat users — repeat guests drive seat expansion.

---

## 12. Build order — do not deviate

Build in this order. Do not build UI before the data layer exists. Do not build the Stream detail screen during nav work — only the nav.

1. Supabase migrations for the five tables, with indexes and RLS policies
2. Vitest RLS tests (admin / member / guest access to streams). Must pass before step 3
3. Seed script: one workspace, two teams, three users (one per role), streams
4. Typed query functions in `lib/queries/nav.ts`. Use `group by` for team counts — no N+1
5. `useSidebarData` hook in `hooks/use-sidebar-data.ts` using SWR
6. Sidebar presentation components with **static mock data** matching the `SidebarData` type
7. Wire `useSidebarData` into `<Sidebar>`, replacing mocks
8. `orderSidebarItems(data, role)` pure function + unit tests per role
9. `getActiveNavItem(pathname, streamContext)` pure function + unit tests
10. Keyboard shortcuts: `cmdk` command palette, `react-hotkeys-hook` jumps, `?` cheatsheet

### Non-negotiables
- RLS tests must pass before proceeding past step 2
- Do not add columns or tables not in section 4
- Do not build the Stream detail screen
- Single `<Badge>` component for every badge in the app — no one-off badges anywhere