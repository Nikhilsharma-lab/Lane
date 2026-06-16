# App Conventions Plan

Stop reinventing solved plumbing. This maps established conventions (primarily Plane, cross-checked against
Linear / Asana / Jira) onto Lane's scope, so Code follows a known pattern instead of improvising nav, roles,
and settings each time.

**The one filter, applied to every line below: copy the pattern, not the payload.** The *grammar* of how a
thing works transfers; the *contents* stay Lane's (Requests, not Cycles/Modules/Views; one workspace, not
many). Anything that is a *permission or visibility* concept is treated as a decision, not a copy.

---

> **Plumbing sections below (1, 5, 8) are grounded in Plane's actual source** (cloned from `makeplane/plane`,
> file paths cited inline), not its docs — corrected from the earlier doc-based synthesis. Sidebar (3) is
> likewise source-grounded. Layout sections (2, 7, 9) follow observed structure; 10 is later-tier.

## 1. Roles & permissions — the foundation (grounded in Plane source)

Plane's real model (`packages/constants/src/user.ts`, `packages/utils/src/permission/role.ts`): **three roles
as ordered integers** — `ADMIN = 20`, `MEMBER = 15`, `GUEST = 5` — with permission checks comparing numbers
(`userRole >= requiredLevel`, via `getHighestRole`). There is **no separate "Owner" role**; the workspace
creator is an Admin carrying an owner/creator flag used only for irreversible actions (delete workspace,
billing, sole-owner-can't-leave). My earlier draft invented an Owner role — corrected here.

Lane adopts this exactly, keeping the **functional label** (PM/Designer/Developer) on a separate axis that
gates nothing.

**Two independent axes (never consult one for the other's job — recurring bug class):**
- `workspace_members.role` = **permission**, ordered int: `guest(5) | member(15) | admin(20)`, plus an
  `is_owner` boolean on the creator's membership.
- `profiles.role` = **functional label**: `pm | designer | developer`. No permissions, ever.

**Permission matrix (by role):**

| Action | Admin | Member | Guest |
|---|:---:|:---:|:---:|
| Submit a request (through the gate) | ✓ | ✓ | ✓ |
| See the full board | ✓ | ✓ | ✗ (own only) |
| Pick up / mark done | ✓ | ✓ | ✗ |
| Comment | ✓ | ✓ | own requests only |
| See members list | ✓ | ✓ | ✗ |
| Invite / remove / change roles | ✓ | ✗ | ✗ |
| Workspace settings | ✓ | ✗ | ✗ |
| Delete workspace / billing | owner-flag Admin only | ✗ | ✗ |

Admin/Member — your team — see the same board (no functional-role gating). Guest is an outsider who only
touches their own request, which still passes the gate. Ethos intact.

**Schema note:** role column = the three ordered ints (or enum `guest|member|admin`) + `is_owner` flag. Check
permissions by level (`>=`), never string equality, so hierarchy holds.

## 2. App shell + top bar

**Convention:** persistent left sidebar + a slim top bar. Top bar holds page context on the left and
user/account affordances on the right. Workspace identity lives at the top of the sidebar, not the top bar.

**Lane adaptation:** top bar = current section title left, user menu (avatar → account, log out) right.
Single workspace, so no workspace switcher in the top bar. Keep it quiet — this is chrome, not content.

**Build note:** you already have a minimal header ("Lane" + email + Log out). This formalizes it. Week: now
(folds into the sidebar work).

---

## 3. Left sidebar / nav IA — two-tier app-switcher

**Convention (Plane, read from its source):** two tiers, not one. Tier 1 is a thin **app-switcher** icon rail
(`apps/web/ce/components/sidebar/app-switcher.tsx`): workspace switcher at the top, top-level apps as icons
(Projects / Wiki / AI), Settings pinned at the bottom. Tier 2 is a **contextual panel** for the selected app
(`extended-sidebar.tsx` / `project-navigation-root.tsx`) holding that app's own nav with collapsible groups.
The rail switches *apps*; the panel navigates *within* one.

**Lane adaptation:** adopt the two-tier architecture now (Lane is a multi-app suite), populate only Requests.

```
Tier 1: app-switcher rail     Tier 2: contextual panel (selected app)
┌────┐                         ┌────────────────────────────┐
│ ◈  │ {workspace} ▾           │  Requests              ⚙ ⊟ │
├────┤                         │  + New request             │
│ ▣  │ Requests   ← live       │  Board                     │
│ ◇  │ Ideas      (later)      │  (saved filters, later)    │
│ ◈  │ Docs       (later)      │                            │
│ ◷  │ Insights   (later)      │                            │
├────┤                         └────────────────────────────┘
│ ⚙  │ Settings  (bottom)
│ ◯  │ {user}    (bottom)
└────┘
```

**Reveal rule (recommended):** build the rail to hold N apps, but don't *show* a rail with one live icon +
three "coming soon" ghosts — surface the app-switcher only once the second app (Ideas) ships. Until then,
Requests' contextual panel is the sidebar; the architecture is two-tier-ready underneath. (Override to show
the rail now if you want to signal the suite vision early.)

**Payload stays Lane's:** no Cycles / Modules / Views / Pages inside the contextual panel — those are Plane's
project internals. Requests' panel is the board entry plus, later, saved filters. Nothing more.

**Build note:** Week now — foundational, everything renders inside this shell. Reference Plane's
`app-switcher.tsx` + `extended-sidebar.tsx` for the interaction pattern; copy the structure, not the payload.

**Later flag:** "Insights" as an app needs the guest-style definition check when built — anti-surveillance
core means it must be problem/pattern insight, never people-utilization metrics. Decide at build time.

## 4. Members management

**Convention (Plane):** Settings → Members. A list of current members, each with a role dropdown (changes
take effect immediately) and a three-dots → Remove. Removed members lose access immediately. Plane keeps an
audit trail of role changes and removals.

**Lane adaptation:** Settings → Members shows current members (name, functional label, structural role) +
pending invites. Owner/Admin can change a member's role via dropdown and remove via three-dots. Owner can't
be removed; if you're the sole Owner you can't leave. Audit trail = nice-to-have, defer (note it, don't
build week one).

**Data/permission:** role change and remove are Owner/Admin-only server actions, workspace-scoped, receiving
`{userId, orgId}` (never re-derived). Guard: Admin can't change/remove the Owner.

**Build note:** Week: now (part of the Day-4 membership work).

---

## 5. Invites — grounded in Plane source

Plane's invite service (`packages/services/src/workspace/invitation.service.ts`) is **two-sided**:
- **Owner side:** `workspaceInvitations(slug)` (list pending), `invite(slug, bulkData)` (create — **bulk:
  multiple emails, each with a role**), `update(slug, id, …)` (edit a pending invite), `destroy(slug, id)` (revoke).
- **Invitee side:** `userInvitations()` (my pending invites), `join(slug, id, …)` (accept one).
- **Uniqueness:** DB enforces `unique_together (email, workspace)` — one invite row per email per workspace.

This **supersedes parts of `invites-membership-spec.md`.** Keep from the spec: email-bound, copy-link delivery
(no email yet), the one-workspace block. Adopt from Plane's real shape:
- **Bulk invite with a per-email role** (mirror the `invite()` bulk form) — dialog takes multiple emails, each a role.
- **Two-sided actions:** owner manages the workspace's pending invites (list / update / revoke); invitee sees
  their own pending invites and joins one. Model your server actions on these two sides.
- **`(email, workspace)` uniqueness** as the DB constraint (this is the spec's one-per-email, confirmed).

Plane *sends* invite emails (`workspace_invitation_task` + templates); Lane defers email and uses copy-link —
but the action/service **shape** is identical, so the deferral costs nothing structurally.

## 6. Guests (external requester)

**Convention (Plane):** Guest = limited. Can submit intake; can view/edit/delete only their own intake
submissions; cannot see the broader board.

**Lane adaptation:** a Guest is an external stakeholder. They can submit a request (through the gate, same as
anyone) and see a minimal "my requests" view — their own submissions and statuses only. No team board, no
pick-up, no members list. Comments only on their own requests.

**Data/permission:** RLS must scope guests to `created_by = self` for reads — this is a real isolation
boundary, verify it the same way as cross-workspace isolation. A guest's "board" is just their own requests.

**Build note:** Week: **next** (immediately after the team membership ships). It's on-thesis and
differentiating — external asks getting problem-reframed is a great story — but it's a distinct RLS + UI
surface, so it's its own increment, not tangled into the member flow. Invite dropdown can offer Guest from
day one even if the guest *experience* lands a week later (they just can't accept until it's live, or hold
Guest out of the dropdown until then — your call).

---

## 7. Settings IA

**Convention:** two distinct settings homes — **Workspace settings** (shared, admin-gated) and **Account /
Profile** (personal). Don't merge them.

**Lane adaptation:**
- **Workspace settings** (Owner/Admin): Members (Section 4), Workspace (name, later: delete/billing).
- **Account / Profile** (everyone): your name, your functional label (PM/Designer/Developer dropdown),
  email, log out.

The "change your role" dropdown you deferred lives here, in Account → Profile. Trivial, one control.

**Build note:** Week: now (Profile) + now (Workspace→Members). Billing/delete = pre-launch.

---

## 8. Onboarding + empty states — grounded in Plane source

Plane's onboarding (`core/components/onboarding/`) is a **multi-step** flow with a step indicator (profile →
role → workspace), plus a `switch-account` path for the wrong-account case. The crucial piece —
`create-or-join-workspaces.tsx` — **branches on the user's pending invitations**, it does not decide from scratch:

```
if (invitations.length > 0)  → JOIN view   (accept an invite; with a "create instead" escape)
else                          → CREATE view (name + create a workspace)
```

That is the exact wiring that was breaking. Drive create-vs-join off whether `userInvitations()` returns
anything — don't reinvent the decision.

**Lane adaptation:** multi-step onboarding = functional-label (role) → workspace (create-or-join, branched on
pending invites). A user who followed an invite link lands in JOIN with that invite ready; a fresh signup with
no invites lands in CREATE. Keep purposeful empty states on every list (you have this on the board; extend to
Members and the guest's "my requests").

**Build note:** onboarding = now (in flight) — rewire the create-or-join branch to the `invitations.length`
pattern. Empty-state polish = Day-5 (→ DEFERRED.md).

## 9. Request-detail layout

**Convention (Plane/Linear issue detail):** main column = title + body + activity/comments; right rail =
properties (status, assignee, dates, etc.). Stable, scannable, two-column.

**Lane adaptation:** main column = the reframed problem (lead with it — ties to the card-hierarchy decision),
original request shown secondary, then comments. Right rail = status, classification, submitter, assignee,
pick-up/done actions. Keep the rail short — Lane has few properties by design, and that sparseness is fine.

**Build note:** you have a working detail page; this is a layout convention to align it to. Week: Day-5
polish (folds in with the card-hierarchy decision already in DEFERRED.md).

---

## 10. Later-tier (named now, built later)

- **Command palette / keyboard nav** (⌘K). Table-stakes for this category; real polish lever. → a later week.
- **Notifications / Inbox.** Convention exists (a unified inbox); Lane has no notification events worth it
  yet. → defer until there's something to notify about (assignment, comment on your request).
- **Global search.** → later week, once there's enough volume to search.

These are in the plan so they're not "forgotten," but none is week-one.

---

## Build sequence

**This week (current Day-4/5 work):**
1. App shell + sidebar (Section 2–3) — foundational, do first.
2. Roles enum + permission matrix wiring (Section 1).
3. Members management (Section 4) + Invites updated to Plane (Section 5).
4. Settings IA: Workspace→Members + Account→Profile (Section 7).
5. Onboarding (Section 8, in flight).

**Next increment:**
6. Guest / external requester (Section 6) — its own RLS + UI surface.

**Day-5 polish pass (→ DEFERRED.md):**
7. Request-detail layout + card hierarchy (Section 9). Empty-state polish (Section 8).

**Later weeks:** command palette, notifications, search (Section 10).

---

## Open decisions

1. **Guest in the invite dropdown from day one, or hold it until the guest experience ships next increment?**
   (Default: hold it out of the dropdown until the experience is live, so no one accepts into a half-built role.)
2. **Owner + Admin both, or Owner + Member only for the MVP UI?** Schema carries all four regardless; this is
   only about which the invite dropdown offers now. (Default: offer Member + Admin; Owner is the creator.)
3. **Audit trail for role changes/removals — build now or defer?** (Default: defer to pre-launch.)
