# Lane — Left Navigation Spec

Authoritative spec for the left navigation. Claude Code reads this at the start of every session touching nav. If this file and a prompt disagree, this file wins. If this file and `CLAUDE.md` disagree on vocabulary, `CLAUDE.md` wins — this spec is aligned to match.

**One line to remember:** Workspace → Team → Request is the only hierarchy. Everything else is a filter, a foreign key, or a phase.

**Philosophy anchors (from CLAUDE.md):** Support produces truth, surveillance produces performance. Flat and searchable over nested and hidden. Role-based visibility enforced at the database level. The sidebar should feel Linear-crisp — ruthlessly flat, never nested, never surprising.

---

## 1. Canonical vocabulary (aligned to CLAUDE.md)

These are the only terms used in Lane's UI. The sidebar code must match this table. If code and table disagree, change the code.

| Concept | Name | Notes |
|---|---|---|
| The product | **Lane** | Proper noun |
| The primary unit of design work | **Request** | Capitalized when referring to the concept |
| The 4 top-level phases | **Predesign, Design, Build, Track** | From CLAUDE.md Part 1 |
| The 5 design stages (non-linear) | **Sense, Frame, Diverge, Converge, Prove** | From CLAUDE.md Part 3 |
| The intake gate | **Intake** | Sidebar item, no "Queue" suffix |
| The AI pre-check on submissions | **intake check** | Lowercase in running text |
| The three-sign-off quality gate | **Prove** | Sidebar item name. Also the 5th design stage. Shared name is intentional |
| What the team committed to this cycle | **Commitments** | Sidebar item |
| The time window for committing | **cycle** | Lowercase in prose |
| The upstream pool of thoughts | **Ideas** | Sidebar item, no "Board" suffix |
| An item in Ideas | **idea** | Lowercase |
| The designer's own written thinking | **Reflection** | First-class concept per CLAUDE.md. *Feature deferred to post-v1 per April 15 S1 outcome; vocabulary preserved for future reconsideration.* |
| The weekly AI digest | **weekly digest** | Matches CLAUDE.md Part 9.7 |
| Functional units (Consumer app, Payments) | **Team** | |
| Designer accountable for a Request | **designer owner** | Matches `designer_owner_id` column |
| PM who submitted the Request | **requester** | |
| External members invited to specific Requests | **Guest** | |

### Banned words anywhere in UI or copy

ticket, issue, task, project (as a noun for the work unit — still fine in other contexts), epic, sprint, board, backlog, kanban, bet, betting, gate (as a suffix, e.g. "Validation gate"), queue (as a suffix), stream (we do not use "Stream" — the primary unit is a Request), overdue, due date, status update, velocity, utilization (as visible data), performance (as visible data), journey, adventure, magic, "let's" (as in "let's get started"), exclamation marks in body copy.

### Sentence case always

Never Title Case. "Active requests," not "Active Requests." Headings, buttons, nav items, labels — all sentence case.

---

## 2. Structure — three zones

The sidebar has three zones, top to bottom.

### Zone 1: Workspace header
- Workspace name with dropdown (opens a menu with Settings, Invite, user profile, theme toggle, log out — matching current shipped code)
- Plan badge (FREE / PRO / etc.)
- Active count ("N active") — number of Requests currently in progress across the workspace
- Global search input with `⌘K` shortcut hint

### Zone 2: Personal zone

Always first after the header. Never changes regardless of which team context the user is in. Exact items in exact order:

1. **Home**
2. **Inbox**
3. **My requests** — Requests where the current user is the designer owner (`requests.designer_owner_id = auth.uid()`)
4. **Submitted by me** — Requests where the current user was the requester (PM / submitter)
5. **My drafts**
6. **Saved**
7. **Ideas**

**Note:** The `/dashboard/reflections` route still exists as a placeholder page, but is intentionally not surfaced in the sidebar as of April 15, 2026. The Reflections feature is deferred to post-v1 per S1 outcome. The placeholder route is preserved so any pre-existing links don't 404.

**Role-aware ordering:** the structure is the same for everyone, but the role-aware logic (see section 3) can promote one item above others inside the Personal zone. For example, a designer sees My requests at position 3 (after Home and Inbox); a PM sees Submitted by me promoted above My requests.

**Insights and Radar** — these are workspace-level analytics destinations that exist in the shipped code (`app/(dashboard)/insights/`, `app/(dashboard)/radar/`). They are role-gated (admin and Design Head only) and appear in the Personal zone only for those roles, below Ideas. For members, they do not render.

### Zone 3: Team sections

After the Personal zone, render a collapsible section for each team the user belongs to. Each team section contains **exactly five items in this exact order, and nothing else:**

1. **Active requests** — all Requests currently in the Design phase for this team
2. **Intake** — Requests in Predesign (intake, context, shape, bet stages)
3. **Commitments** — Requests the team has committed to this cycle
4. **Prove** — Requests awaiting the three-signoff gate
5. **Archive** — killed, shipped, and otherwise closed Requests

No sub-folders. No nested requests. No phase indicators in the sidebar. These five items are fixed.

### Sidebar footer — "What's new"

**Status as of April 15, 2026:** Spec'd in S2, build deferred to Week 4 per roadmap. The footer is NOT in shipped code — earlier nav-spec assertion that it was already built was inaccurate.

**Purpose:** Small footnote-style expandable section at the bottom of the sidebar that surfaces recent shipped changes. Provides a quiet signal that the product is alive and evolving without dominating primary nav.

**Data source:** `CHANGELOG.md` at repo root. Already exists (132 lines as of S2 spec date). The footer reads from this file at build time or render time — implementation choice deferred to build session.

**Entry format:**

```markdown
## YYYY-MM-DD

- **Title** — one-line description in plain English. Optional (link to a request, page, or doc).
```

Date as H2, entries as bullets under it. Multiple entries on the same date stack as bullets under the same H2. If existing CHANGELOG.md uses a different format, either the parser handles backward compatibility or the file gets migrated to this format before the footer ships.

**UI behavior:**
- Default state: collapsed, single line at the bottom of the sidebar showing "What's new" with a chevron indicator
- Click: expands inline to show the most recent 5 entries, dates as section headers, bullets underneath
- Click again: collapses
- No state persistence across sessions (keeps implementation trivial)
- Muted text color, smaller font than primary nav items

**Discipline rule for what counts as a changelog entry:**

A changelog entry exists when shipping a change that affects user experience.

Add an entry for: new features, bug fixes the user would notice, UX changes, performance improvements users would feel, removed features.

Skip an entry for: internal refactors, dependency updates, infrastructure changes, documentation, deprecations of unused/never-shipped features, test additions, code cleanups.

When in doubt, ask: "would a user reading this entry think 'oh, that's interesting'?" If no, skip.

**Out of scope for v1 build:**
- No notification/dot/badge for "new since last visit"
- No filtering, search, or categorization
- No backlinks from entries to specific commits, PRs, or roadmap items

These exclusions are intentional — adding any of them expands build cost meaningfully. If demand emerges post-launch, revisit.

**Estimated build effort:** ~1.5 hours when executed (markdown parser, expandable footer component, sidebar wiring, styling).

---

## 3. Role model

Four workspace-level roles (fixed, no custom roles in v1):

| Role | Purpose | Key permissions |
|---|---|---|
| **Owner** | Signup user, transferable | Billing, SSO, delete workspace, promote admins |
| **Admin / Design Head** | Head of design ops | Creates teams, manages integrations, sees all Requests, sees Insights and Radar |
| **Member** | Default — designers and PMs | Creates Requests, works on assigned Requests, participates in Ideas |
| **Guest** | External reviewers (free seat) | Scoped to specific Requests only |

### Team roles (per team)

`lead`, `designer`, `pm`, `contributor` — plus an `is_team_admin` boolean flag.

### Per-Request permissions (flags, derived — do not create separate tables)

- **Designer owner** — accountable for the Request through the Design phase. Stored as `requests.designer_owner_id`. Set at design assignment.
- **Requester** — the PM or member who submitted the Request. Stored on the Request's creation record.
- **Prove approvers** — derived at runtime: the designer owner, the Request's PM, and the team's design lead. No separate approver table.

### Role-aware default ordering

Same sidebar structure for everyone. Different default landing screen and different emphasis within the Personal zone.

**Designer (Member):**
- Lands on: Home (which shows their assigned Requests and Inbox signals)
- Personal zone: My requests promoted to position 3 (right after Inbox)
- Team sections: expanded by default
- Top of each team section: Active requests (pre-selected)
- Prove: Tier 1 red badge if they have approvals pending
- No Insights / Radar visible

**PM (Member):**
- Lands on: Home (which shows submitted Requests and Inbox signals)
- Personal zone: Submitted by me promoted to position 3
- Team sections: expanded by default
- Intake promoted to the top of each team section (above Active requests)
- No Insights / Radar visible

**Design Head (Admin):**
- Lands on: Home (which shows team health and the weekly digest)
- Personal zone: all items, plus Insights and Radar visible at the bottom
- Team sections: collapse by default for users with 5+ teams
- Commitments promoted in each team section
- Workspace-wide cross-team badges visible

**Workspace Owner:**
- Same as Admin
- Billing notifications surfaced in Home when invoices due

**Guest:**
- Personal zone only, containing "Shared with me"
- No team sections render at all
- No Insights / Radar
- Lands on: the most recently updated Request they have access to

**Implementation:** role lives on `team_memberships.role` per team, not `users.role`. A Design Head for one team and a designer for another gets both treatments correctly.

---

## 4. Database schema

The existing Lane schema (per CLAUDE.md Part 6) already has the core tables — `requests`, `validations`, and the standard auth tables. For multi-team nav to work, these additions are needed:

```sql
-- Workspaces (one per billing entity)
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  owner_id uuid not null references auth.users(id),
  plan text not null default 'free',
  created_at timestamptz default now()
);

-- Workspace-level membership
create type workspace_role as enum ('owner', 'admin', 'member', 'guest');

create table workspace_members (
  workspace_id uuid references workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role workspace_role not null default 'member',
  invited_by uuid references auth.users(id),
  onboarded_at timestamptz,
  created_at timestamptz default now(),
  primary key (workspace_id, user_id)
);

-- Teams (functional units inside a workspace)
create table teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  unique (workspace_id, slug)
);

-- Team membership — where per-team role lives
create type team_role as enum ('lead', 'designer', 'pm', 'contributor');

create table team_memberships (
  team_id uuid references teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role team_role not null default 'designer',
  is_team_admin boolean default false,
  created_at timestamptz default now(),
  primary key (team_id, user_id)
);

-- Requests gets team scoping
alter table requests add column team_id uuid references teams(id);
alter table requests add column workspace_id uuid references workspaces(id);

-- Per-request guest access
create table request_guests (
  request_id uuid references requests(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) not null,
  can_comment boolean default true,
  created_at timestamptz default now(),
  primary key (request_id, user_id)
);
```

### Required indexes

- `team_memberships(user_id)`
- `workspace_members(user_id, workspace_id)`
- `request_guests(user_id)`
- `requests(team_id, phase)` — for sidebar count queries
- `requests(designer_owner_id)` — for My requests
- `requests(workspace_id)` — for workspace-wide queries

### RLS policies (on `requests`)

Three policies, OR'd together by Postgres:

```sql
alter table requests enable row level security;

create policy "members_see_team_requests" on requests for select using (
  team_id in (select team_id from team_memberships where user_id = auth.uid())
);

create policy "admins_see_all" on requests for select using (
  workspace_id in (
    select workspace_id from workspace_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  )
);

create policy "guests_see_invited_requests" on requests for select using (
  id in (select request_id from request_guests where user_id = auth.uid())
);
```

### RLS tests (Vitest) — non-negotiable

Seed three users (admin, team member, guest) and assert each sees the right rows. A failing RLS test blocks the session until fixed. This is the one place to be strict: silent RLS bugs ship until a customer notices.

---

## 5. Badge hierarchy

Three tiers. All badges in the sidebar route through a single `<NavBadge tier={1|2|3} value={number}>` component (already exists in shipped code at `components/nav/badge.tsx`). Do not create one-off badges.

### Tier 1 — action required from you (red, filled pill)

Things where *your* inaction blocks progress:
- Prove approvals waiting on you
- @mentions in Inbox
- Intake items assigned to you for shaping (if you're a team admin)

Red is reserved. Not "overdue," not "stalled," not "important." Only personal action items.

### Tier 2 — new activity in your world (neutral text-tertiary, numeric)

Things you'll probably want to know about:
- New comments on Requests you own
- Active requests count in a team section
- Intake count in a team section
- My requests count
- Inbox unread (non-mention)

Most badges live here.

### Tier 3 — ambient signal (single dot, no number)

"Something happened somewhere you're not currently looking":
- Collapsed team sections with new activity
- Workspace switcher for other workspaces the user belongs to

### Rules

- One tier per location. Never combine Tier 1 and Tier 3 on the same item.
- Tier 2 counts cap at `99+`, with one exception: **Prove never caps**. If it hits 99, show the raw number. That's a crisis signal and rounding hides severity.
- Counts reset on *view*, not on *click*. Opening Inbox marks items seen.
- Dots never appear on items the user is currently viewing.
- The Friday weekly digest gets a Tier 1 red dot exception — red, but a dot not a number. Fades to Tier 2 on Monday. Gone by Wednesday.

---

## 6. Active state and canonical location

### The rule

Highlight the **canonical location** of the current thing, not the entry point.

- A Request's canonical location is always `{team} → Active requests`
- Prove is a filter, not a location. Entering it highlights "Prove" while on the filtered list. Click into a specific Request — highlight moves to Active requests (canonical home) and Prove goes unhighlighted.
- Insights and Radar highlight themselves while viewed. No canonical location override.

### Breadcrumb

Inside a Request, show a breadcrumb at the top of the main pane: `Consumer app · Active requests · {request title}`. Each segment clickable. Sidebar shows where the thing *lives*; breadcrumb shows where you came *from*.

### Inbox exception

Clicking an inbox item keeps Inbox highlighted during triage. The highlight moves only when the user navigates explicitly elsewhere.

### Implementation

Pure function: `getActiveNavItem(pathname, requestContext)` returns the nav item key to highlight. Unit test each case.

---

## 7. Keyboard navigation

### Global shortcuts

- `⌘K` — command palette
- `⌘⇧O` — workspace switcher
- `⌘/` or `?` — keyboard cheatsheet
- `Esc` — close modal / clear selection

### Jump shortcuts (`G then letter`)

Canonical Personal zone jumps:
- `G H` — Home
- `G I` — Inbox
- `G M` — My requests
- `G S` — Submitted by me
- `G D` — Drafts
- `G B` — Ideas (B for "board," avoiding collision with `I` for Inbox)
- `G W` — Weekly digest (Admin / Design Head only; no-op otherwise)

**No per-team jump shortcuts.** Use `⌘K` for team navigation — scales to any number of teams.

### Command palette (`⌘K`)

Use `cmdk`. Searches: Requests by title, teams by name, people, settings screens, and **actions** ("create request," "invite guest," "promote idea"). Wired to the same data source as the sidebar so results are consistent.

### Libraries

- `react-hotkeys-hook` for global and jump shortcuts
- `cmdk` for the palette

---

## 8. Empty and overflow states

### Brand-new workspace, zero teams

- Personal zone renders fully with legitimately empty destinations behind each item
- Below Personal, a "Create your first team" card inline in the sidebar — not a modal, not a full-screen onboarding
- Card: one-line description, name input, primary button
- Creating the team replaces the card with the first team section

**Do not seed sample content** except through the explicit sample-team flow in `onboarding-spec.md` section 4. Design leaders delete unrequested sample data in 30 seconds.

### Team with zero Requests

- Section renders normally with all five fixed items
- Clicking Active requests lands on an empty state with "New request" primary and "Submit to intake" secondary
- Do not progressively disclose the five items. Fixed structure, empty destinations.

### User with 5+ teams

- Default-collapse teams past the top 4 most recently interacted with (matches existing shipped code: `defaultOpen={i < 4}`)
- Teams 5+ collapse into a "More teams (N)" expandable group
- **No search inside the sidebar.** Use `⌘K` for team navigation.

### Counts

- Cap at `99+` for Inbox, My requests, Intake, Active requests
- Prove **never caps** — raw number in red past 99

---

## 9. Guest invitation flow

Six steps. Scoped to a single Request by construction.

1. **Trigger**: Member clicks "Share" on a Request detail page. Single entry point.
2. **Modal**: email input, optional message, one toggle ("Can comment" default on). No role picker, no expiry.
3. **Server**: create or fetch `workspace_members` row with `role = 'guest'`. Create `request_guests` row. Idempotent.
4. **Email**: Resend. Subject like "Priya invited you to review 'Onboarding redesign' on Lane." One button: "Open request" (magic link, creates session, lands directly on the Request).
5. **First session**: guest mode sidebar (Personal zone only, "Shared with me"). One-time inline tooltip: "You're a guest on this Request. You can view and comment."
6. **Admin visibility**: invite event logged, surfaced in admin's weekly digest. Not a notification — just visible.

### Edge cases

- **Guest → Member upgrade**: `workspace_members.role` flips to `member`, user is added to a team. Existing `request_guests` rows stay intact.
- **Member → Guest downgrade**: remove from all teams, flip role. Default: clear `request_guests`. Admin can opt to preserve specific ones.
- **Guest removed from a Request**: delete the `request_guests` row. If it was their only Request, leave the `workspace_members` row orphaned.

### Guests are free

Always. Do not count toward seat billing.

---

## 10. Workspace switcher

### Behavior

- Clicking workspace name opens a dropdown menu (matches shipped code using shadcn `DropdownMenu`)
- Menu contents: Settings, Invite and manage members, user profile, theme toggle, log out — as currently shipped
- For multi-workspace users (post-v1), add workspace list above the current menu items
- Shortcut: `⌘⇧O`

### What persists across switch

- Auth session, user UI preferences (theme, sidebar state), last-visited-screen per workspace

### What does NOT persist

- Search queries, active filters, draft Requests, unread state, selected team, Inbox

### Weekly digest

Per-workspace, never aggregated. A Design Head in two workspaces gets two separate Friday emails.

---

## 11. Mobile / narrow viewport

Lane is not mobile-first. Optimize for two cases only:
1. Design Head checking the weekly digest on Saturday morning
2. Stakeholder clicking a guest invite link from a phone

### Breakpoints

- **Desktop (≥1024px):** full sidebar
- **Tablet (768–1023px):** sidebar narrows, no structural changes
- **Mobile (<768px):** sidebar becomes a drawer, hamburger toggle, no bottom tab bar

### What works on mobile

Workspace menu, Personal zone, team sections (collapsible), the weekly digest (fully readable), Request detail (read + comment).

### What degrades acceptably

Figma sync activity delegates to Figma's mobile app. Commitments view renders read-only. Intake form works but is clunky. Keyboard shortcuts disabled.

### The one polished mobile flow

Guest invite landing. A stakeholder tapping "Open request" from an email on their phone should land on a clean, readable Request view and be able to leave a comment. This is the flow that converts external reviewers into repeat users.

---

## 12. Build order

Follow this order when building new nav functionality. Do not build UI before the data layer exists.

1. Schema migrations for `workspaces`, `workspace_members`, `teams`, `team_memberships`, `request_guests`, indexes, RLS policies on `requests`
2. Vitest RLS tests (admin / member / guest access to requests). Must pass before step 3.
3. Seed script: one workspace, two teams, three users (one per role), Requests per team
4. Typed query functions in `lib/queries/nav.ts` — `getCurrentUserWorkspaceRole`, `getUserTeamsForSidebar`, `getPersonalZoneCounts`. Use `group by` for team counts — no N+1.
5. Update `hooks/use-sidebar-data.ts` to fetch from the queries above
6. Update `components/shell/sidebar.tsx` personalNav array to match section 2 exactly (rename "My streams" → "My requests," add "Submitted by me"). *Reflections was previously listed here but removed April 15 per S1 outcome — do not re-add.*
7. `components/nav/team-section.tsx` renders the five fixed items per team (already partially exists)
8. Wire `<NavBadge>` counts per badge hierarchy in section 5
9. `orderSidebarItems(data, role)` pure function + unit tests per role
10. `getActiveNavItem(pathname, requestContext)` pure function + unit tests
11. Keyboard shortcuts: `cmdk` command palette, `react-hotkeys-hook` jumps, `?` cheatsheet
12. Empty state for zero-teams workspace: inline "Create your first team" card
13. Insights and Radar: role-gate visibility in Personal zone to owner / admin only

### Non-negotiables

- RLS tests must pass before proceeding past step 2
- Do not add columns or tables not in section 4
- Do not build Request detail, Intake form, Commitments page, or Prove page as part of nav work — those can be placeholder empty states behind the five team items
- Single `<NavBadge>` component for every badge — no one-off badges anywhere
- Vocabulary must match section 1 exactly. No "Stream," no "Sign-off," no "Validation gate" anywhere

---

## 13. Items explicitly forbidden in the sidebar

If any of these appear in the sidebar, it has drifted from the spec and must be corrected:

- Stream, Streams (as a primary unit — Lane uses Request)
- Projects (at any level — the word is reserved and unused)
- Cycles as a top-level item (cycle lives inside Commitments)
- Requests as a top-level item (requests live inside a team's Intake, and assigned ones in "My requests" in Personal zone — there is no top-level "Requests" destination)
- Issues, Tickets, Tasks
- Team as a top-level item (team context lives in Zone 3 sections)
- Members as a top-level item (lives under Settings)
- "Sign-off," "Validation gate," "Betting table," "Bet cycle" — all superseded by Prove, Commitments, cycle
- Any item with the word "bet," "betting," "stream," or "queue" (as a suffix) in its label

---

## 14. When to create a Team vs. when to use a Tag

Create a new **Team** only when there's a permanent functional unit with its own dedicated design headcount, its own roadmap, and its own planning cycle. Teams are organizational structures, not topical groupings. Creating a team for a temporary initiative is a mistake — teams are expensive to deprecate.

Use **tags + saved views** for cross-cutting initiatives (KYC, accessibility), time-bounded pushes (Q1 launch), or topical concerns. Tags are cheap, removable, and multi-assignable. A Request can carry many tags; it can only belong to one team.

The test: *"Is there a person whose job title says 'Head of X Design,' and do people report exclusively into X?"* Yes → Team. No → Tag.

---

## 15. Team creation flow

**Permission:** Workspace Owners and Admins only.

**Entry points:** Settings → Teams → New team, or `⌘K` → "create team."

**Modal fields:** name (required), description (optional), initial members with per-team roles and optional Team Admin flag. No other fields. No wizard.

**On submit (one transaction):** insert team row, insert team_memberships for initial members, log audit event. The creator is NOT auto-added unless they included themselves in the member picker.

**Post-creation:** modal closes, new team section appears in the sidebar expanded by default with all five items at zero, creator lands on the team's Active requests empty state, added members see a toast.

**Deletion:** blocked if active Requests exist — admin must archive or move first. Soft delete for 30 days, then hard delete. Archived Requests retain team reference with deleted-badge rendering.