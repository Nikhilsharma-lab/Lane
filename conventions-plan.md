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
> likewise source-grounded. Layout sections (2, 7, 9) follow observed structure; current sequencing is separate.

**Authority update, 2026-09-28:** Plane supplies interaction patterns, not Lane's permission model or
build scope. Clerk owns users, sessions, organizations, memberships, roles, and invitations. The approved
Request pipeline in `REQUIREMENTS.md` §§4–7 is not implemented by this plan; `lane-roadmap.md` owns sequence
and recorded release status. Existing application behaviour and approved target behaviour are distinguished
below. Historical invitation evidence does not verify the Clerk cutover.

## 1. Roles & permissions — the foundation (grounded in Plane source)

Plane's real model (`packages/constants/src/user.ts`, `packages/utils/src/permission/role.ts`): **three roles
as ordered integers** — `ADMIN = 20`, `MEMBER = 15`, `GUEST = 5` — with permission checks comparing numbers
(`userRole >= requiredLevel`, via `getHighestRole`). There is **no separate "Owner" role**; the workspace
creator is an Admin carrying an owner/creator flag.

**Lane's authority is Clerk, not a local hierarchy:** Lane recognizes **admin | member | guest** from the
active Clerk organization. Do not recreate the retired local `workspace_members` authority, a local Owner
tier, membership/invitation tables, or Plane's integer permission model.

**Keep these concepts separate:**

- Clerk active organization, membership, and role establish tenancy and permission.
- `profiles.role` = **functional label**: `pm | designer | developer`. Never a permission or dashboard tier.
- In the approved target, a Request's named participants, creator, and assignee carry specific
  responsibilities. These do not infer authority from a person's profile label or override Clerk access.

**Permission matrix (by role):**

| Existing Lane action | Admin | Member | Guest |
|---|:---:|:---:|:---:|
| Submit a request (through the gate) | ✓ | ✓ | ✓ |
| See the full board | ✓ | ✓ | ✗ (own only) |
| Pick up / mark done | ✓ | ✓ | ✗ |
| Comment | ✓ | ✓ | own requests only |
| Access Members | ✓ | ✓ | ✗ |
| Manage invitations / memberships / organization roles | Clerk-authorized controls | Clerk restrictions | ✗ |

Admin and Member share the board; functional labels do not gate it. Guest has the restricted experience in
Section 6. Production guest invitations require Clerk Enhanced B2B; until approved, production invitations
remain Admin/Member only. Billing, workspace deletion, and general workspace settings are not current Lane
screens. The target alignment/assignment/closure contract changes specific Request actions only when its
increment is implemented; it is not already enforced by this matrix.

**Server boundary:** actions receive `{orgId}` from the page, but derive identity, active organization,
and role from Clerk `auth()` in shared guards. Never accept a client-passed `userId` as identity, or re-derive
workspace context independently inside actions. Use the guard's returned identity for writes.

## 2. App shell + top bar

**Convention:** persistent left sidebar + a slim top bar. Top bar holds page context on the left and
user/account affordances on the right. Workspace identity lives at the top of the sidebar, not the top bar.

**Lane adaptation:** top bar = current section title left, user menu (avatar → account, log out) right.
Single workspace, so no workspace switcher in the top bar. Keep it quiet — this is chrome, not content.

**Scope note:** this is a layout convention, not a current build instruction. Inspect Lane's existing shell
and the relevant Plane source before any change; release status stays in `lane-roadmap.md`.

---

## 3. Left sidebar / nav IA — two-tier app-switcher

**Convention (Plane, read from its source):** two tiers, not one. Tier 1 is a thin **app-switcher** icon rail
(`apps/web/ce/components/sidebar/app-switcher.tsx`): workspace switcher at the top, top-level apps as icons
(Projects / Wiki / AI), Settings pinned at the bottom. Tier 2 is a **contextual panel** for the selected app
(`extended-sidebar.tsx` / `project-navigation-root.tsx`) holding that app's own nav with collapsible groups.
The rail switches *apps*; the panel navigates *within* one.

**Lane adaptation:** Requests is the only committed application. A two-tier shell is reference terrain for
an explicitly selected future second application, not authority to build a suite now.

Illustrative future structure only; hypothetical app labels below are not roadmap commitments:

```
Tier 1: app-switcher rail     Tier 2: contextual panel (selected app)
┌────┐                         ┌────────────────────────────┐
│ ◈  │ {workspace} ▾           │  Requests              ⚙ ⊟ │
├────┤                         │  + New request             │
│ ▣  │ Requests   ← live       │  Board                     │
│ ◇  │ Ideas      (unselected) │  (filters)                 │
│ ◈  │ Docs       (unselected) │                            │
│ ◷  │ Insights   (unselected) │                            │
├────┤                         └────────────────────────────┘
│ ⚙  │ Settings  (bottom)
│ ◯  │ {user}    (bottom)
└────┘
```

**Reveal rule:** no app-switcher or "coming soon" ghosts for hypothetical applications. Requests' contextual
panel remains the sidebar. If a second application is later approved, revisit the reference then; Ideas is
not automatically next.

**Payload stays Lane's:** no Cycles / Modules / Views / Pages inside the contextual panel — those are Plane's
project internals. Requests' panel contains Requests navigation and approved filters; follow the roadmap
for feature status rather than treating this sketch as an implementation inventory.

**Reference note:** Plane's `app-switcher.tsx` + `extended-sidebar.tsx` explain the pattern, not a current
implementation task. Do not add navigation destinations outside the current screen whitelist.

**Later flag:** "Insights" as an app needs the guest-style definition check when built — anti-surveillance
core means it must be problem/pattern insight, never people-utilization metrics. Decide at build time.

## 4. Members management

**Convention (Plane):** Settings → Members. A list of current members, each with a role dropdown (changes
take effect immediately) and a three-dots → Remove. Removed members lose access immediately. Plane keeps an
audit trail of role changes and removals.

**Lane adaptation:** Settings → Members embeds Clerk Organization Profile. Clerk handles member lists,
invitations, organization role changes, removal, and leave-organization restrictions. Lane gates access to
the page; it does not rebuild the membership management interface or a local Owner hierarchy. Functional
labels remain Lane profile data and must not be confused with Clerk organization roles.

**Data/permission:** Clerk is the membership authority. Lane uses its shared session-derived guards at
application boundaries, including guest exclusion from Members. A new audit-log product screen is not
authorized; attributable Request decisions in the approved pipeline are a separate concern.

---

## 5. Invites — grounded in Plane source

Plane's invite service (`packages/services/src/workspace/invitation.service.ts`) is **two-sided**:

- **Owner side:** `workspaceInvitations(slug)` (list pending), `invite(slug, bulkData)` (create — **bulk:
  multiple emails, each with a role**), `update(slug, id, …)` (edit a pending invite), `destroy(slug, id)` (revoke).
- **Invitee side:** `userInvitations()` (my pending invites), `join(slug, id, …)` (accept one).
- **Uniqueness:** DB enforces `unique_together (email, workspace)` — one invite row per email per workspace.

**Lane adaptation:** use Clerk's invitation lifecycle through Organization Profile and its authentication
flows. Clerk creates, emails, tracks, resends, revokes, and accepts invitations and establishes organization
membership. Lane validates its own return routing and authorization after acceptance. Do not implement local
invitation records, a second acceptance service, or a Resend invitation sender from Plane's reference shape.

Plane *sends* invite emails (`workspace_invitation_task` + templates). Lane's retired local/Resend flow was
live-verified on staging and production on 2026-07-14, including delivery and acceptance. That is historical
evidence only, not verification of Clerk invitations or authority to restore the retired flow. The current
Clerk cutover plan records the hosted-return and production checks still required.

**Paper visual specification:** [Workspace invitations](https://app.paper.design/file/01KXFHK7TT3KA6F64NRFH7QHMS/2-0)
contains desktop and mobile states for creation, delivery outcomes, pending-invite lifecycle, onboarding,
transactional email, acceptance, expiry/revocation, wrong-account recovery, and workspace-limit handling.
It describes the historical local-invitation design; audit it against Clerk ownership before reuse.

## 6. Guests (external requester)

**Convention (Plane):** Guest = limited. Can submit intake; can view/edit/delete only their own intake
submissions; cannot see the broader board.

**Lane adaptation:** a Guest is an external stakeholder. They can submit a request (through the gate, same as
anyone) and see a minimal "my requests" view — their own submissions and statuses only. No team board, no
pick-up, no members list. Comments only on their own requests.

**Data/permission:** application queries and actions scope guests to `created_by = self`; the disabled Data
API means app-layer guards are the active boundary. Verify it the same way as cross-workspace isolation. A
guest's "board" is just their own requests.

**Status:** the restricted Clerk `org:guest` experience is implemented; production invitation availability
depends on the approved Clerk plan. Guests cannot see the team board, pick up work, or access Members.
Public / anonymous Intake is separate and deferred. The approved target pipeline must preserve guest
isolation; it does not silently grant a guest permission to browse or assign workspace members.

---

## 7. Settings IA

**Convention:** two distinct settings homes — **Workspace settings** (shared, admin-gated) and **Account /
Profile** (personal). Don't merge them.

**Lane adaptation — current screen whitelist:**

- **Settings → Members:** Clerk Organization Profile, with Lane's access guard (Section 4).
- **Settings → Profile:** functional label and browser-local theme preference. The label never changes access.

Both surfaces exist in the source-level MVP. There is no separately authorized general Workspace settings,
billing, deletion, or account-administration screen. Clerk owns identity/account management; do not expand
the settings whitelist by following the reference convention. Deployment status remains in the roadmap.

---

## 8. Onboarding + empty states — grounded in Plane source

Plane's onboarding (`core/components/onboarding/`) is a **multi-step** flow with a step indicator (profile →
role → workspace), plus a `switch-account` path for the wrong-account case. The crucial piece —
`create-or-join-workspaces.tsx` — **branches on the user's pending invitations**, it does not decide from scratch:

```
if (invitations.length > 0)  → JOIN view   (accept an invite; with a "create instead" escape)
else                          → CREATE view (name + create a workspace)
```

This is reference terrain for create-versus-join intent, not a requirement to reproduce Plane's invitation
lookup or account flow in Lane.

**Lane adaptation — approved 2026-09-24:** sign up → create/join a Clerk workspace → functional label
(PM/Designer/Developer) → Requests. Clerk Organizations stays **Membership required**. Clerk owns the pending
`choose-organization` task, invitation acceptance, and organization activation; Lane does not maintain an
invitation list or recreate that branching logic. Interrupted organization setup resumes at the existing
`/login` route. The active organization is required before Lane offers or saves the label; pending or
organization-less sessions cannot enter Requests. The label is not a permission and remains editable later.

**Build boundary:** `/onboarding` is Lane's functional-label step after Clerk organization setup. No new
organization-setup route or parallel membership logic. Keep purposeful empty states on every list, including
Members and the guest's own Requests.

## 9. Request-detail layout

**Convention (Plane/Linear issue detail):** main column = title + body + activity/comments; right rail =
properties (status, assignee, dates, etc.). Stable, scannable, two-column.

**Lane adaptation:** main column = the reframed problem (lead with it — ties to the card-hierarchy decision),
original request shown secondary, then comments. Right rail = status, classification, submitter, assignee,
pick-up/done actions. Keep the rail short — Lane has few properties by design, and that sparseness is fine.

**Target boundary:** the approved alignment/readiness/outcome/follow-up contract will add Request context
through separately selected increments. Do not mistake information sections for mandatory design stages,
or add new routes based on this layout reference. Inspect current source before changing its composition.

---

## 10. Search, keyboard navigation, and notifications

- **Command palette / keyboard navigation, search, and saved filters:** consult `lane-roadmap.md` for
  recorded implementation and sequencing. Earlier "later week" notes are not a current status report.
- **Notifications / Inbox.** A lightweight popover belongs to the current Requests scope. Historical
  invitation notifications must not imply a new local invitation lifecycle after Clerk cutover.
  Archive, snooze, preferences, filters, pagination, email, and a dedicated inbox remain
  trigger-gated in `DEFERRED.md`.

No old "week one" schedule in this reference plan overrides the roadmap or authorizes another application.

## 11. Approved Request responsibilities — target, not current enforcement

The confirmed 2026-09-28 contract is in `REQUIREMENTS.md` §§4–7: a named PM–Designer–Developer trio aligns
before prioritization/execution; a short recorded disagreement blocks progress without administrator or
timeout override. Replacement cannot erase a concern. The creator/admin can assign a Designer, or a
Designer can self-pick up unassigned work; assignment does not start work or supply alignment.

Bounded discovery and delivery commitments are distinct. Complete build/release readiness is required
for the agreed release, while exploration remains nonlinear and artifact-led. Active-work Done is not
outcome Closed. Creator-owned outcome closure accepts measured results and truthful exceptions; closed
Requests do not reopen. Further post-release work uses linked follow-up Requests with fresh agreement,
not merges or an epic hierarchy. Factual corrections are append-only.

These are named responsibilities inside one shared Requests experience, not `profiles.role` permissions,
new workspace membership logic, or separate dashboards. The first increment needs its own design/state
review and implementation approval; no new route, table, integration, or AI call follows from this plan alone.

---

## Current implementation status

The source-level MVP includes the app shell, Clerk-boundary membership/invitations, onboarding, Requests,
restricted guest experience, lightweight notifications, and Profile. Do not describe the retired local
email/copy-link service as current Clerk behaviour. `lane-roadmap.md`, `DEFERRED.md`, and the Clerk cutover
plan own the recorded implementation/release evidence; this document does not certify production readiness.
The confirmed full Request pipeline is approved direction, not shipped behaviour.

---

## Resolved decisions

1. Guest is offered only with its shipped limited experience; public / anonymous Intake is separate.
2. Clerk is the membership/invitation authority. No local Owner tier or duplicated membership hierarchy.
3. An audit-trail product surface is not part of the MVP and requires a future explicit decision.
4. Named Request responsibilities never become global functional-label permissions; the shared view remains.
