# Settings Hub — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive `/settings` area where every user can manage their profile, and admins can manage the workspace — all in one central hub.

**Architecture:** New Next.js route segment `app/(settings)/settings/` with its own sidebar layout, completely separate from the dashboard layout. Entry point is a dropdown on the user's name in every existing page header.

**Tech Stack:** Next.js 14 App Router, Supabase Auth, Drizzle ORM, Tailwind + shadcn/ui. No new DB tables required.

---

## Access Model

| Section | Non-admin (PM, Designer, Developer, Lead) | Admin |
|---|---|---|
| Account | Full edit | Full edit |
| Workspace | Read-only, values displayed as text | Full edit |
| Members | Read-only list + role badges | Invite, change roles, remove members |
| Plan | Hidden from sidebar entirely | Full view |
| Danger Zone | "Leave workspace" only | "Leave workspace" + "Delete workspace" |

Non-admins on Workspace see: `"Contact your admin to change workspace settings."`

---

## Route Structure

```
app/
  (settings)/
    settings/
      layout.tsx          ← sidebar + content shell (auth-gated)
      page.tsx            ← server redirect to /settings/account
      account/
        page.tsx          ← profile + password change
      workspace/
        page.tsx          ← org name + slug + plan badge
      members/
        page.tsx          ← member list + invite + pending invites
      plan/
        page.tsx          ← current plan display + upgrade CTA (admin only)
      danger/
        page.tsx          ← leave / delete workspace
```

---

## Entry Point — Header Update

Every existing page header currently shows: `[name] [Sign out]`

Replace with name as a clickable element that opens a dropdown:
```
Yash Kaushal
─────────────
Settings       → /settings/account
Sign out       → logout action
```

Affected headers: `dashboard/page.tsx`, `dashboard/team/page.tsx`, `dashboard/insights/page.tsx`, `dashboard/ideas/page.tsx`, `dashboard/requests/[id]/page.tsx`. Extract into a shared `<UserMenu>` client component.

---

## Settings Layout (`layout.tsx`)

Two-column layout: fixed sidebar (220px) + scrollable content area.

**Sidebar sections:**
```
Settings
─────────────────
Account
Workspace
Members
Plan              ← rendered only if profile.role === 'admin'
─────────────────
Danger Zone       ← visually separated (red tint on hover)
```

Active section is highlighted. Sidebar is fixed on desktop, collapses to a top tab bar on mobile (< 768px).

Auth check: if no session, redirect to `/login`.

---

## Section 1: Account (`/settings/account`)

**Profile form:**
- Full name — text input, maps to `profiles.full_name`
- Email — read-only display (Supabase auth email, changing requires re-verification — deferred)
- Timezone — select dropdown, ~30 major zones, maps to `profiles.timezone`
- Save button → `updateProfile(userId, { fullName, timezone })` server action

**Password form (separate):**
- New password — password input (min 8 chars)
- Confirm new password — password input
- Update button → calls `supabase.auth.updateUser({ password: newPassword })`
- No current password field required — user is already authenticated. Same pattern as GitHub/Vercel.

**Avatar:** Initials-based avatar (first letter of full name) in a colored circle. No file upload in MVP.

**Server actions needed:**
- `updateProfile(userId, data)` — updates `profiles` row

---

## Section 2: Workspace (`/settings/workspace`)

**Admin view:**
- Organization name — text input, maps to `organizations.name`
- Slug — text input, maps to `organizations.slug`
  - Validation: lowercase, alphanumeric + hyphens only, no spaces
  - Warning displayed inline: "⚠ Changing the slug will break any existing shared links."
  - Uniqueness checked on save (query `organizations` for existing slug)
- Plan badge — shows current plan (`free | pro | enterprise`) with link to `/settings/plan`
- Save button → `updateOrganization(orgId, { name, slug })` server action

**Non-admin view:**
- Same fields displayed as static text (no inputs)
- Plan badge shown (static, no link to plan page)
- Note: `"Contact your admin to change workspace settings."`
- No save button

**Server actions needed:**
- `updateOrganization(orgId, data)` — admin-only, validates slug uniqueness

---

## Section 3: Members (`/settings/members`)

**Member list:**
Each row:
- Avatar (initials circle) + Full name + `(you)` tag if current user
- Email
- Role — dropdown (admin) or static badge (non-admin)
  - Roles: PM, Designer, Developer, Lead, Admin
  - Admin cannot change their own role (locked)
- Remove button (admin only, hidden for current user's own row)

Role change: immediate on select, calls `updateMemberRole(profileId, role)` server action.

Remove member: clicking "Remove" opens a confirmation dialog:
> "Remove [Name] from the workspace? They'll lose access immediately."
> [Cancel] [Remove]
Calls `removeMember(profileId)` — deletes the `profiles` row. Supabase cascade handles requests/assignments cleanup. The user's `auth.users` entry is NOT deleted (requires Supabase admin API) — but without a profile row they have zero access to any org. Fine for MVP.

**Invite form (admin only):**
Inline form below the header (not a modal):
- Email address input
- Role select (default: Designer)
- "Send invite" button → reuses existing invite logic (creates `invites` row, returns shareable link)
- On success: shows the invite link with a copy button, adds row to Pending Invites

**Pending invites:**
Table below member list:
- Email, Role, Expiry date, Status (Pending / Expired)
- Admin sees [Revoke] button — deletes invite row
- Non-admin sees list read-only (no revoke)

**Server actions needed:**
- `updateMemberRole(profileId, newRole)` — admin only
- `removeMember(profileId)` — admin only, cannot remove self
- `revokeInvite(inviteId)` — admin only

---

## Section 4: Plan (`/settings/plan`) — Admin only

Hidden from sidebar for non-admins. Redirect to `/settings/account` if non-admin navigates directly.

**Current plan card:**
```
● Pro   $299/month   Annual prepay
```

**Features list** (static, based on `organizations.plan` value):

| Feature | Free | Pro | Enterprise |
|---|---|---|---|
| Team members | Up to 3 | Up to 10 | Unlimited |
| Requests | 10/month | Unlimited | Unlimited |
| AI triage | ✓ | ✓ | ✓ |
| Figma sync | — | ✓ | ✓ |
| AI weekly digest | — | ✓ | ✓ |
| Email notifications | — | ✓ | ✓ |
| Linear integration | — | — | ✓ |
| SLA | — | — | ✓ |

**Upgrade CTA:**
```
Need more?
Enterprise — custom seats, Linear integration, dedicated SLA
[Contact us →]    ← mailto: link (e.g. mailto:yash@lane.io?subject=Enterprise inquiry)
```
No Stripe integration in this spec — that is Sub-project 2.

---

## Section 5: Danger Zone (`/settings/danger`)

**Leave workspace (all users):**
```
Leave workspace
You'll lose access to all requests, designs, and team data.
If you are the only admin, assign another admin first.
[Leave workspace]
```
Confirmation dialog: "Are you sure you want to leave? This cannot be undone." → [Cancel] [Leave]
Server action: `leaveOrg(userId)` → deletes `profiles` row for user → `supabase.auth.signOut()` → redirect to `/login`
Guard: if user is the only admin in the org, block the action with error: "You're the only admin. Assign another admin before leaving."

**Delete workspace (admin only, hidden for non-admins):**
```
Delete workspace
Permanently deletes the org, all members, all requests, and all data.
This cannot be undone.
[Delete workspace]
```
Confirmation dialog requires typing the org slug exactly:
> "Type `airtel-payments` to confirm deletion."
Input must match `organizations.slug` exactly before confirm button activates.
Server action: `deleteOrg(orgId)` → deletes `organizations` row → cascade deletes everything → `supabase.auth.signOut()` → redirect to `/login`

**Server actions needed:**
- `leaveOrg(userId)` — with admin guard
- `deleteOrg(orgId)` — admin only, requires slug confirmation (validated server-side too)

---

## Server Actions Summary

All actions live in `app/actions/settings.ts`:

| Action | Who | What it does |
|---|---|---|
| `updateProfile` | Self | Updates `profiles.full_name`, `profiles.timezone` |
| `updateOrganization` | Admin | Updates `organizations.name`, `organizations.slug` (unique check) |
| `updateMemberRole` | Admin | Updates `profiles.role` for another member |
| `removeMember` | Admin | Deletes `profiles` row (not self) |
| `revokeInvite` | Admin | Deletes `invites` row |
| `leaveOrg` | Self | Deletes own `profiles` row + signs out (admin guard) |
| `deleteOrg` | Admin | Deletes `organizations` row + signs out |

Password change does NOT go through a server action — it calls `supabase.auth.updateUser()` directly from a client component (requires active auth session).

---

## Components

```
components/
  settings/
    user-menu.tsx            ← dropdown (name → Settings / Sign out) — replaces raw name+signout in all headers
    settings-sidebar.tsx     ← sidebar nav with active state, role-aware Plan visibility
    account-form.tsx         ← profile fields + save (client component)
    password-form.tsx        ← password change (client component, calls Supabase directly)
    workspace-form.tsx       ← org name + slug (admin: inputs; non-admin: static text)
    members-list.tsx         ← member rows with role dropdowns + remove buttons
    invite-section.tsx       ← reuses/wraps existing InviteForm
    pending-invites.tsx      ← pending + expired invites with revoke
    plan-display.tsx         ← plan card + features table + upgrade CTA
    danger-zone.tsx          ← leave + delete actions with confirmation dialogs
```

---

## What Is NOT in This Spec

- Stripe / payment processing → Sub-project 2
- Email preference toggles → deferred post-MVP
- Avatar file upload → deferred, initials only for now
- Figma OAuth connection → separate spec
- SSO / SAML → enterprise feature, deferred
- Audit log → deferred

---

## Out of Scope Clarification: "Projects"

The user mentioned "projects" as a future concept (e.g. an org has a website, a driver app, a consumer app). This is a meaningful data model addition — requests would be scoped to a project within an org. This is Sub-project 3 and will be specced separately. It is NOT part of the Settings Hub.
