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
creator is an Admin carrying an owner/creator flag.

**Lane diverges intentionally:** owner is a **distinct top-level role**, not a flag on an admin. This is
cleaner — no special-case flag logic, the role column alone determines authority. Invited Guest is shipped
as the limited external-requester role described in Section 6.

Lane's implemented hierarchy: **`owner(30) | admin(20) | member(10) | guest(0)`** — permission checks compare
levels (`ROLE_LEVEL[callerRole] >= ROLE_LEVEL[targetRole]`). The **functional label**
(PM/Designer/Developer) remains on a separate axis that gates nothing.

**Two independent axes (never consult one for the other's job — recurring bug class):**
- `workspace_members.role` = **permission**, ordered int: `owner(30) | admin(20) | member(10) | guest(0)`.
  Enum: `workspaceRoleEnum = ["owner", "admin", "member", "guest"]`. No `is_owner` flag — owner is a full role.
- `profiles.role` = **functional label**: `pm | designer | developer`. No permissions, ever.

**Permission matrix (by role):**

| Action | Owner | Admin | Member | Guest |
|---|:---:|:---:|:---:|:---:|
| Submit a request (through the gate) | ✓ | ✓ | ✓ | ✓ |
| See the full board | ✓ | ✓ | ✓ | ✗ (own only) |
| Pick up / mark done | ✓ | ✓ | ✓ | ✗ |
| Comment | ✓ | ✓ | ✓ | own requests only |
| See members list | ✓ | ✓ | ✓ | ✗ |
| Invite / remove / change roles | ✓ | ✓ | ✗ | ✗ |
| Workspace settings | ✓ | ✓ | ✗ | ✗ |
| Delete workspace / billing | ✓ | ✗ | ✗ | ✗ |

Owner/Admin/Member — your team — see the same board (no functional-role gating). Guest is an outsider who
only touches their own request, which still passes the gate. Ethos intact.

**Schema note:** role column = enum `owner|admin|member|guest`. Check permissions by level (`>=`), never
functional label, so the two axes stay separate.

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

**Data/permission:** role change and remove are Owner/Admin-only server actions receiving `{orgId}` from the
page render. Identity is derived from the session inside the shared guard; `userId` is never client-passed.
Guard: Admin can't change/remove the Owner.

**Build note:** Week: now (part of the Day-4 membership work).

---

## 5. Invites — grounded in Plane source

Plane's invite service (`packages/services/src/workspace/invitation.service.ts`) is **two-sided**:
- **Owner side:** `workspaceInvitations(slug)` (list pending), `invite(slug, bulkData)` (create — **bulk:
  multiple emails, each with a role**), `update(slug, id, …)` (edit a pending invite), `destroy(slug, id)` (revoke).
- **Invitee side:** `userInvitations()` (my pending invites), `join(slug, id, …)` (accept one).
- **Uniqueness:** DB enforces `unique_together (email, workspace)` — one invite row per email per workspace.

This **supersedes parts of `invites-membership-spec.md`.** Keep from the spec: email-bound invitations,
copy-link fallback, and the one-workspace block. Adopt from Plane's real shape:
- **Single-recipient invite with a role** for the current MVP. Plane's bulk form is reference terrain, not current
  build authority.
- **Two-sided actions:** owner manages the workspace's pending invites (list / update / revoke); invitee sees
  their own pending invites and joins one. Model your server actions on these two sides.
- **`(email, workspace)` uniqueness** as the DB constraint (this is the spec's one-per-email, confirmed).

Plane *sends* invite emails (`workspace_invitation_task` + templates). Lane independently implements the same
delivery expectation through Resend: create/refresh/resend attempts email, while the persisted invitation and
copyable link remain usable if delivery fails. HTML and plain-text versions include inviter, workspace, expiry,
and the production invite URL. Staging and production were live-verified on 2026-07-14, including inbox delivery,
wrong-account recovery, invited-account creation, acceptance, and membership creation.

**Paper visual specification:** [Workspace invitations](https://app.paper.design/file/01KXFHK7TT3KA6F64NRFH7QHMS/2-0)
contains desktop and mobile states for creation, delivery outcomes, pending-invite lifecycle, onboarding,
transactional email, acceptance, expiry/revocation, wrong-account recovery, and workspace-limit handling.

## 6. Guests (external requester)

**Convention (Plane):** Guest = limited. Can submit intake; can view/edit/delete only their own intake
submissions; cannot see the broader board.

**Lane adaptation:** a Guest is an external stakeholder. They can submit a request (through the gate, same as
anyone) and see a minimal "my requests" view — their own submissions and statuses only. No team board, no
pick-up, no members list. Comments only on their own requests.

**Data/permission:** application queries and actions scope guests to `created_by = self`; the disabled Data
API means app-layer guards are the active boundary. Verify it the same way as cross-workspace isolation. A
guest's "board" is just their own requests.

**Status:** SHIPPED for invited guests. Guest invitations, own-only Requests, Intake, detail, and comments are
implemented; guests cannot see the team board, pick up work, or access Members. Public / anonymous Intake is
a separate deferred decision.

---

## 7. Settings IA

**Convention:** two distinct settings homes — **Workspace settings** (shared, admin-gated) and **Account /
Profile** (personal). Don't merge them.

**Lane adaptation:**
- **Workspace settings** (Owner/Admin): Members (Section 4), Workspace (name, later: delete/billing).
- **Account / Profile** (everyone): your name, your functional label (PM/Designer/Developer dropdown),
  email, log out.

The "change your role" dropdown you deferred lives here, in Account → Profile. Trivial, one control.

**Status:** Workspace → Members is shipped. Account → Profile is required MVP scope but remains unimplemented.
Billing/delete remain outside this screen set.

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
- **Notifications / Inbox.** A lightweight popover is shipped for pick-up, comments, completion, and invite
  acceptance. Archive, snooze, preferences, filters, pagination, email, and a dedicated inbox remain
  trigger-gated in `DEFERRED.md`.
- **Global search.** → later week, once there's enough volume to search.

These are in the plan so they're not "forgotten," but none is week-one.

---

## Current implementation status

App shell, permission roles, members, emailed invitations with copy-link fallback, onboarding, Requests,
invited Guest, lightweight notifications, and Account → Profile are shipped. Request-detail layout, command
palette, search, and saved filters stay sequenced by `lane-roadmap.md` and `DEFERRED.md`.

---

## Resolved decisions

1. Guest is offered only with its shipped limited experience; public / anonymous Intake is separate.
2. Owner is the creator; the membership UI supports Admin, Member, and Guest within hierarchy constraints.
3. An audit-trail product surface is not part of the MVP and requires a future explicit decision.
