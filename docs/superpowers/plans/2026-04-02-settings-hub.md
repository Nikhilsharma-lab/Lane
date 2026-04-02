# Settings Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive `/settings` area with Account, Workspace, Members, Plan, and Danger Zone sections — all behind a new `UserMenu` dropdown that replaces the raw name+sign-out in every page header.

**Architecture:** New `app/(settings)/settings/` route group with its own sidebar layout (separate from dashboard). All server actions in `app/actions/settings.ts`. Ten focused components in `components/settings/`. Four existing dashboard page headers updated to use the shared `UserMenu` component.

**Tech Stack:** Next.js 14 App Router, Supabase Auth (`@supabase/ssr`), Drizzle ORM, Tailwind CSS + shadcn/ui. No DB schema changes.

---

## File Map

**Create:**
- `app/actions/settings.ts` — 7 server actions (updateProfile, updateOrganization, updateMemberRole, removeMember, revokeInvite, leaveOrg, deleteOrg)
- `components/settings/user-menu.tsx` — avatar dropdown: Settings + Sign out
- `components/settings/settings-sidebar.tsx` — sidebar nav with active state, role-aware Plan link
- `app/(settings)/settings/layout.tsx` — auth-gated sidebar+content shell
- `app/(settings)/settings/page.tsx` — redirect to /settings/account
- `app/(settings)/settings/account/page.tsx` — server page: loads profile, renders AccountForm + PasswordForm
- `components/settings/account-form.tsx` — profile edit form (client)
- `components/settings/password-form.tsx` — password change form (client, calls Supabase directly)
- `app/(settings)/settings/workspace/page.tsx` — server page: loads org + profile, renders WorkspaceForm
- `components/settings/workspace-form.tsx` — org name+slug form (client, admin edits / non-admin reads)
- `app/(settings)/settings/members/page.tsx` — server page: loads members + invites
- `components/settings/members-list.tsx` — member rows with role dropdowns + remove (client)
- `components/settings/pending-invites.tsx` — pending invite rows with revoke (client)
- `app/(settings)/settings/plan/page.tsx` — server page: admin-only, shows plan card
- `components/settings/plan-display.tsx` — plan card + features table (server component, no interactivity)
- `app/(settings)/settings/danger/page.tsx` — server page: loads org slug, renders DangerZone
- `components/settings/danger-zone.tsx` — leave + delete flows with confirmation (client)

**Modify:**
- `app/(dashboard)/dashboard/page.tsx` — replace `{profile.fullName}` + logout form with `<UserMenu>`
- `app/(dashboard)/dashboard/team/page.tsx` — same
- `app/(dashboard)/dashboard/insights/page.tsx` — same
- `app/(dashboard)/dashboard/ideas/page.tsx` — same

---

## Task 1: Server Actions

**Files:**
- Create: `app/actions/settings.ts`

- [ ] **Step 1: Create the file**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, organizations, invites } from "@/db/schema";
import { eq, and, ne, count } from "drizzle-orm";

// ─── Profile ────────────────────────────────────────────────────────────────

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const fullName = (formData.get("fullName") as string)?.trim();
  const timezone = formData.get("timezone") as string;

  if (!fullName) return { error: "Name is required" };

  await db
    .update(profiles)
    .set({ fullName, timezone, updatedAt: new Date() })
    .where(eq(profiles.id, user.id));

  revalidatePath("/settings/account");
  return { success: true };
}

// ─── Organization ────────────────────────────────────────────────────────────

export async function updateOrganization(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile || profile.role !== "admin") return { error: "Admin only" };

  const name = (formData.get("name") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim().toLowerCase();

  if (!name) return { error: "Name is required" };
  if (!slug) return { error: "Slug is required" };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { error: "Slug must be lowercase letters, numbers, and hyphens only" };
  }

  // Uniqueness check — exclude current org
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.slug, slug), ne(organizations.id, profile.orgId)));
  if (existing) return { error: "That slug is already taken" };

  await db
    .update(organizations)
    .set({ name, slug, updatedAt: new Date() })
    .where(eq(organizations.id, profile.orgId));

  revalidatePath("/settings/workspace");
  return { success: true };
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function updateMemberRole(profileId: string, role: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [me] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!me || me.role !== "admin") return { error: "Admin only" };
  if (profileId === user.id) return { error: "Cannot change your own role" };

  const valid = ["pm", "designer", "developer", "lead", "admin"];
  if (!valid.includes(role)) return { error: "Invalid role" };

  await db
    .update(profiles)
    .set({ role: role as "pm" | "designer" | "developer" | "lead" | "admin", updatedAt: new Date() })
    .where(and(eq(profiles.id, profileId), eq(profiles.orgId, me.orgId)));

  revalidatePath("/settings/members");
  return { success: true };
}

export async function removeMember(profileId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [me] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!me || me.role !== "admin") return { error: "Admin only" };
  if (profileId === user.id) return { error: "Cannot remove yourself" };

  await db
    .delete(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.orgId, me.orgId)));

  revalidatePath("/settings/members");
  return { success: true };
}

export async function revokeInvite(inviteId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [me] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!me || me.role !== "admin") return { error: "Admin only" };

  await db
    .delete(invites)
    .where(and(eq(invites.id, inviteId), eq(invites.orgId, me.orgId)));

  revalidatePath("/settings/members");
  return { success: true };
}

// ─── Danger Zone ─────────────────────────────────────────────────────────────

export async function leaveOrg() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [me] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!me) return { error: "Profile not found" };

  if (me.role === "admin") {
    const [row] = await db
      .select({ count: count() })
      .from(profiles)
      .where(and(eq(profiles.orgId, me.orgId), eq(profiles.role, "admin")));
    if (Number(row.count) <= 1) {
      return { error: "You're the only admin. Assign another admin before leaving." };
    }
  }

  await db.delete(profiles).where(eq(profiles.id, user.id));
  await supabase.auth.signOut();
  redirect("/login");
}

export async function deleteOrg(confirmedSlug: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [me] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!me || me.role !== "admin") return { error: "Admin only" };

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, me.orgId));
  if (!org) return { error: "Organization not found" };
  if (confirmedSlug !== org.slug) return { error: "Slug does not match. Try again." };

  await db.delete(organizations).where(eq(organizations.id, me.orgId));
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors related to `settings.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/actions/settings.ts
git commit -m "feat: settings server actions"
```

---

## Task 2: UserMenu Component + Header Updates

**Files:**
- Create: `components/settings/user-menu.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/dashboard/team/page.tsx`
- Modify: `app/(dashboard)/dashboard/insights/page.tsx`
- Modify: `app/(dashboard)/dashboard/ideas/page.tsx`

- [ ] **Step 1: Create `components/settings/user-menu.tsx`**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";

interface UserMenuProps {
  fullName: string;
}

export function UserMenu({ fullName }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        {fullName}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
          <p className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-800 truncate">
            {fullName}
          </p>
          <Link
            href="/settings/account"
            onClick={() => setOpen(false)}
            className="flex items-center px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            Settings
          </Link>
          <form action={logout}>
            <button
              type="submit"
              className="w-full text-left flex items-center px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `app/(dashboard)/dashboard/page.tsx`**

Find and replace the name+logout block. The existing code looks like:
```tsx
<span className="text-sm text-zinc-400">{profile.fullName}</span>
<form action={logout}>
  <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
    Sign out
  </button>
</form>
```

Replace with:
```tsx
<UserMenu fullName={profile.fullName} />
```

Also add the import at the top of the file:
```tsx
import { UserMenu } from "@/components/settings/user-menu";
```

Remove the now-unused `logout` import from `@/app/actions/auth` if it's no longer used elsewhere in the file.

- [ ] **Step 3: Update `app/(dashboard)/dashboard/team/page.tsx`**

Same replacement — find:
```tsx
<span className="text-sm text-zinc-400">{profile.fullName}</span>
<form action={logout}>
  <button type="submit" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
    Sign out
  </button>
</form>
```

Replace with:
```tsx
<UserMenu fullName={profile.fullName} />
```

Add import: `import { UserMenu } from "@/components/settings/user-menu";`
Remove unused `logout` import.

- [ ] **Step 4: Update `app/(dashboard)/dashboard/insights/page.tsx`**

Same replacement pattern as Steps 2–3. Add `UserMenu` import, remove `logout` import.

- [ ] **Step 5: Update `app/(dashboard)/dashboard/ideas/page.tsx`**

Same replacement pattern as Steps 2–3. Add `UserMenu` import, remove `logout` import.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Smoke test**

```bash
npm run dev
```
Open `http://localhost:3000/dashboard`. Click your name — dropdown should appear with "Settings" and "Sign out".

- [ ] **Step 8: Commit**

```bash
git add components/settings/user-menu.tsx \
  app/\(dashboard\)/dashboard/page.tsx \
  app/\(dashboard\)/dashboard/team/page.tsx \
  app/\(dashboard\)/dashboard/insights/page.tsx \
  app/\(dashboard\)/dashboard/ideas/page.tsx
git commit -m "feat: UserMenu dropdown replaces raw name+signout in all headers"
```

---

## Task 3: Settings Layout, Sidebar, and Index Redirect

**Files:**
- Create: `components/settings/settings-sidebar.tsx`
- Create: `app/(settings)/settings/layout.tsx`
- Create: `app/(settings)/settings/page.tsx`

- [ ] **Step 1: Create `components/settings/settings-sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  isAdmin: boolean;
}

const BASE_NAV = [
  { href: "/settings/account", label: "Account" },
  { href: "/settings/workspace", label: "Workspace" },
  { href: "/settings/members", label: "Members" },
];

export function SettingsSidebar({ isAdmin }: Props) {
  const pathname = usePathname();

  function linkClass(href: string, danger = false) {
    const active = pathname === href;
    if (danger) {
      return `block px-3 py-2 rounded-lg text-sm transition-colors ${
        active ? "bg-zinc-800 text-red-400" : "text-zinc-500 hover:text-red-400 hover:bg-zinc-900"
      }`;
    }
    return `block px-3 py-2 rounded-lg text-sm transition-colors ${
      active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900"
    }`;
  }

  return (
    <aside className="w-[200px] shrink-0">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4 px-3">
        Settings
      </p>
      <nav className="space-y-0.5">
        {BASE_NAV.map((item) => (
          <Link key={item.href} href={item.href} className={linkClass(item.href)}>
            {item.label}
          </Link>
        ))}
        {isAdmin && (
          <Link href="/settings/plan" className={linkClass("/settings/plan")}>
            Plan
          </Link>
        )}
        <div className="my-3 border-t border-zinc-800/60" />
        <Link href="/settings/danger" className={linkClass("/settings/danger", true)}>
          Danger Zone
        </Link>
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Create `app/(settings)/settings/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-6 py-10 flex gap-12">
        <SettingsSidebar isAdmin={profile.role === "admin"} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(settings)/settings/page.tsx`**

```tsx
import { redirect } from "next/navigation";

export default function SettingsPage() {
  redirect("/settings/account");
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```
Navigate to `http://localhost:3000/settings` — should redirect to `/settings/account`. Sidebar should render with Account, Workspace, Members (Plan only if admin).

- [ ] **Step 6: Commit**

```bash
git add components/settings/settings-sidebar.tsx \
  app/\(settings\)/settings/layout.tsx \
  app/\(settings\)/settings/page.tsx
git commit -m "feat: settings layout, sidebar, and index redirect"
```

---

## Task 4: Account Page

**Files:**
- Create: `app/(settings)/settings/account/page.tsx`
- Create: `components/settings/account-form.tsx`
- Create: `components/settings/password-form.tsx`

- [ ] **Step 1: Create `components/settings/account-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/actions/settings";

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Lagos",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

interface Props {
  profile: { fullName: string; email: string; timezone: string };
}

export function AccountForm({ profile }: Props) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Full name</label>
        <input
          name="fullName"
          type="text"
          required
          defaultValue={profile.fullName}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Email</label>
        <input
          type="email"
          value={profile.email}
          disabled
          className="w-full bg-zinc-900/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-600 cursor-not-allowed"
        />
        <p className="text-xs text-zinc-700 mt-1">Email cannot be changed here.</p>
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Timezone</label>
        <select
          name="timezone"
          defaultValue={profile.timezone}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Saved.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="bg-white text-zinc-900 rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-40"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `components/settings/password-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";

export function PasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const form = e.currentTarget;
    const newPassword = (
      form.elements.namedItem("newPassword") as HTMLInputElement
    ).value;
    const confirmPassword = (
      form.elements.namedItem("confirmPassword") as HTMLInputElement
    ).value;

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) setError(error.message);
      else {
        setSuccess(true);
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">New password</label>
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Confirm new password</label>
        <input
          name="confirmPassword"
          type="password"
          required
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Password updated.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="bg-white text-zinc-900 rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-40"
      >
        {isPending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `app/(settings)/settings/account/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AccountForm } from "@/components/settings/account-form";
import { PasswordForm } from "@/components/settings/password-form";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Account</h1>
        <p className="text-sm text-zinc-500">
          Manage your personal profile settings.
        </p>
      </div>

      {/* Avatar + identity */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center text-xl font-semibold text-zinc-300">
          {profile.fullName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{profile.fullName}</p>
          <p className="text-xs text-zinc-500">{profile.email}</p>
        </div>
      </div>

      <AccountForm
        profile={{
          fullName: profile.fullName,
          email: profile.email,
          timezone: profile.timezone ?? "UTC",
        }}
      />

      <div className="border-t border-zinc-800 pt-8">
        <h2 className="text-sm font-medium text-white mb-1">Change password</h2>
        <p className="text-xs text-zinc-500 mb-5">
          You are already signed in, so no current password is required.
        </p>
        <PasswordForm />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```
Visit `http://localhost:3000/settings/account`. Verify profile form pre-fills with your name + timezone. Edit name, save — should show "Saved." Reload — name should persist.

- [ ] **Step 6: Commit**

```bash
git add components/settings/account-form.tsx \
  components/settings/password-form.tsx \
  app/\(settings\)/settings/account/page.tsx
git commit -m "feat: settings account page — profile and password forms"
```

---

## Task 5: Workspace Page

**Files:**
- Create: `app/(settings)/settings/workspace/page.tsx`
- Create: `components/settings/workspace-form.tsx`

- [ ] **Step 1: Create `components/settings/workspace-form.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateOrganization } from "@/app/actions/settings";

interface Props {
  org: { name: string; slug: string; plan: string };
  isAdmin: boolean;
}

export function WorkspaceForm({ org, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateOrganization(formData);
      if (result?.error) setError(result.error);
      else setSuccess(true);
    });
  }

  const planLabel: Record<string, string> = {
    free: "Free",
    pro: "Pro",
    enterprise: "Enterprise",
  };

  if (!isAdmin) {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Organization name</p>
          <p className="text-sm text-zinc-300">{org.name}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Slug</p>
          <p className="text-sm text-zinc-300 font-mono">{org.slug}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1.5">Plan</p>
          <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-0.5">
            {planLabel[org.plan] ?? org.plan}
          </span>
        </div>
        <p className="text-xs text-zinc-600">
          Contact your admin to change workspace settings.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">
          Organization name
        </label>
        <input
          name="name"
          type="text"
          required
          defaultValue={org.name}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Slug</label>
        <input
          name="slug"
          type="text"
          required
          defaultValue={org.slug}
          pattern="[a-z0-9-]+"
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-zinc-600 transition-colors"
        />
        <p className="text-xs text-yellow-600/80 mt-1">
          ⚠ Changing the slug will break any existing shared links.
        </p>
      </div>
      <div>
        <label className="block text-xs text-zinc-500 mb-1.5">Plan</label>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-0.5">
            {planLabel[org.plan] ?? org.plan}
          </span>
          <Link
            href="/settings/plan"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            View plan →
          </Link>
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {success && <p className="text-sm text-green-400">Saved.</p>}
      <button
        type="submit"
        disabled={isPending}
        className="bg-white text-zinc-900 rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 transition-colors disabled:opacity-40"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `app/(settings)/settings/workspace/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { WorkspaceForm } from "@/components/settings/workspace-form";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, profile.orgId));
  if (!org) redirect("/login");

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Workspace</h1>
        <p className="text-sm text-zinc-500">
          Your organization name, slug, and plan.
        </p>
      </div>
      <WorkspaceForm
        org={{ name: org.name, slug: org.slug, plan: org.plan }}
        isAdmin={profile.role === "admin"}
      />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```
Visit `http://localhost:3000/settings/workspace`. Admin: edit org name, save — should show "Saved." Non-admin: fields show as static text with "Contact your admin" note.

- [ ] **Step 5: Commit**

```bash
git add components/settings/workspace-form.tsx \
  app/\(settings\)/settings/workspace/page.tsx
git commit -m "feat: settings workspace page"
```

---

## Task 6: Members Page

**Files:**
- Create: `app/(settings)/settings/members/page.tsx`
- Create: `components/settings/members-list.tsx`
- Create: `components/settings/pending-invites.tsx`

- [ ] **Step 1: Create `components/settings/members-list.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { updateMemberRole, removeMember } from "@/app/actions/settings";
import { InviteForm } from "@/components/team/invite-form";

const ROLE_LABELS: Record<string, string> = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
  lead: "Lead",
  admin: "Admin",
};

const ROLES = ["pm", "designer", "developer", "lead", "admin"];

interface Member {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

interface Props {
  members: Member[];
  currentUserId: string;
  isAdmin: boolean;
}

export function MembersList({ members, currentUserId, isAdmin }: Props) {
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(profileId: string, role: string) {
    startTransition(async () => {
      const result = await updateMemberRole(profileId, role);
      if (result?.error) setError(result.error);
    });
  }

  function handleRemove(profileId: string) {
    startTransition(async () => {
      const result = await removeMember(profileId);
      if (result?.error) setError(result.error);
      else setConfirmRemoveId(null);
    });
  }

  return (
    <div className="space-y-8">
      {isAdmin && (
        <div>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
            Invite member
          </h2>
          <InviteForm />
        </div>
      )}

      <div>
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
          Team ({members.length})
        </h2>
        {error && (
          <p className="text-sm text-red-400 mb-3">{error}</p>
        )}
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between border border-zinc-800 rounded-xl px-5 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-medium text-zinc-400 shrink-0">
                  {m.fullName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm text-white">
                    {m.fullName}
                    {m.id === currentUserId && (
                      <span className="text-xs text-zinc-600 ml-1.5">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-600">{m.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {isAdmin && m.id !== currentUserId ? (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    disabled={isPending}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors disabled:opacity-40"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                )}

                {isAdmin && m.id !== currentUserId && (
                  <>
                    {confirmRemoveId === m.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-400">Remove?</span>
                        <button
                          onClick={() => handleRemove(m.id)}
                          disabled={isPending}
                          className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-40"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmRemoveId(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRemoveId(m.id)}
                        className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/settings/pending-invites.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { revokeInvite } from "@/app/actions/settings";

interface Invite {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

interface Props {
  invites: Invite[];
  isAdmin: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  pm: "PM",
  designer: "Designer",
  developer: "Developer",
  lead: "Lead",
  admin: "Admin",
};

function isExpired(date: Date) {
  return new Date() > new Date(date);
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function PendingInvites({ invites, isAdmin }: Props) {
  const [isPending, startTransition] = useTransition();

  const active = invites.filter((i) => !i.acceptedAt && !isExpired(i.expiresAt));
  const expired = invites.filter((i) => !i.acceptedAt && isExpired(i.expiresAt));

  if (active.length === 0 && expired.length === 0) return null;

  function handleRevoke(inviteId: string) {
    startTransition(async () => {
      await revokeInvite(inviteId);
    });
  }

  return (
    <div className="space-y-6">
      {active.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
            Pending invites ({active.length})
          </h2>
          <div className="space-y-2">
            {active.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between border border-zinc-800 rounded-xl px-5 py-3"
              >
                <div>
                  <p className="text-sm text-zinc-300">{inv.email}</p>
                  <p className="text-xs text-zinc-600">
                    {ROLE_LABELS[inv.role] ?? inv.role} · Expires{" "}
                    {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-yellow-500/70">Pending</span>
                  {isAdmin && (
                    <button
                      onClick={() => handleRevoke(inv.id)}
                      disabled={isPending}
                      className="text-xs text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-40"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {expired.length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
            Expired invites ({expired.length})
          </h2>
          <div className="space-y-2 opacity-50">
            {expired.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between border border-zinc-800/50 rounded-xl px-5 py-3"
              >
                <div>
                  <p className="text-sm text-zinc-400">{inv.email}</p>
                  <p className="text-xs text-zinc-600">
                    {ROLE_LABELS[inv.role] ?? inv.role} · Expired{" "}
                    {formatDate(inv.expiresAt)}
                  </p>
                </div>
                <span className="text-xs text-zinc-600">Expired</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `app/(settings)/settings/members/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, invites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MembersList } from "@/components/settings/members-list";
import { PendingInvites } from "@/components/settings/pending-invites";

export default async function MembersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const members = await db
    .select()
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  const allInvites = await db
    .select()
    .from(invites)
    .where(eq(invites.orgId, profile.orgId));

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Members</h1>
        <p className="text-sm text-zinc-500">
          Manage your team members and pending invites.
        </p>
      </div>

      <MembersList
        members={members.map((m) => ({
          id: m.id,
          fullName: m.fullName,
          email: m.email,
          role: m.role,
        }))}
        currentUserId={user.id}
        isAdmin={profile.role === "admin"}
      />

      <PendingInvites
        invites={allInvites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          expiresAt: i.expiresAt,
          acceptedAt: i.acceptedAt,
        }))}
        isAdmin={profile.role === "admin"}
      />
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Smoke test**

```bash
npm run dev
```
Visit `http://localhost:3000/settings/members`. Verify member list renders. Admin: change a role in the dropdown — should update immediately. Click "Remove" on a member — inline "Remove? Yes / No" should appear.

- [ ] **Step 6: Commit**

```bash
git add components/settings/members-list.tsx \
  components/settings/pending-invites.tsx \
  app/\(settings\)/settings/members/page.tsx
git commit -m "feat: settings members page — member list, roles, invites"
```

---

## Task 7: Plan Page

**Files:**
- Create: `app/(settings)/settings/plan/page.tsx`
- Create: `components/settings/plan-display.tsx`

- [ ] **Step 1: Create `components/settings/plan-display.tsx`**

```tsx
interface Props {
  plan: "free" | "pro" | "enterprise";
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_PRICE: Record<string, string> = {
  free: "$0/month",
  pro: "$299/month",
  enterprise: "Custom",
};

type Feature = { label: string; free: boolean; pro: boolean; enterprise: boolean };

const FEATURES: Feature[] = [
  { label: "Team members", free: false, pro: false, enterprise: false }, // overridden below
  { label: "Unlimited requests", free: false, pro: true, enterprise: true },
  { label: "AI triage", free: true, pro: true, enterprise: true },
  { label: "Figma sync", free: false, pro: true, enterprise: true },
  { label: "AI weekly digest", free: false, pro: true, enterprise: true },
  { label: "Email notifications", free: false, pro: true, enterprise: true },
  { label: "Linear integration", free: false, pro: false, enterprise: true },
  { label: "SLA", free: false, pro: false, enterprise: true },
];

const MEMBER_LIMITS: Record<string, string> = {
  free: "Up to 3 members",
  pro: "Up to 10 members",
  enterprise: "Unlimited members",
};

function Check() {
  return <span className="text-green-400">✓</span>;
}

function Dash() {
  return <span className="text-zinc-700">—</span>;
}

export function PlanDisplay({ plan }: Props) {
  return (
    <div className="space-y-8">
      {/* Current plan card */}
      <div className="border border-zinc-800 rounded-xl px-6 py-5">
        <div className="flex items-center gap-3 mb-1">
          <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
          <span className="text-lg font-semibold text-white">
            {PLAN_LABELS[plan]}
          </span>
          <span className="text-sm text-zinc-500">{PLAN_PRICE[plan]}</span>
        </div>
        <p className="text-xs text-zinc-600 ml-5">Annual prepay</p>
      </div>

      {/* Features table */}
      <div>
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
          Features included
        </h2>
        <div className="space-y-2">
          {/* Members row */}
          <div className="flex items-center justify-between py-2 border-b border-zinc-900">
            <span className="text-sm text-zinc-400">Team members</span>
            <span className="text-sm text-zinc-300">{MEMBER_LIMITS[plan]}</span>
          </div>
          {FEATURES.slice(1).map((f) => {
            const included =
              plan === "free" ? f.free : plan === "pro" ? f.pro : f.enterprise;
            return (
              <div
                key={f.label}
                className="flex items-center justify-between py-2 border-b border-zinc-900"
              >
                <span
                  className={`text-sm ${included ? "text-zinc-400" : "text-zinc-700"}`}
                >
                  {f.label}
                </span>
                {included ? <Check /> : <Dash />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upgrade CTA */}
      {plan !== "enterprise" && (
        <div className="border border-zinc-800 rounded-xl px-6 py-5">
          <p className="text-sm font-medium text-white mb-1">Need more?</p>
          <p className="text-xs text-zinc-500 mb-4">
            Enterprise — custom seats, Linear integration, dedicated SLA.
          </p>
          <a
            href="mailto:hello@designq.io?subject=Enterprise%20inquiry"
            className="inline-flex items-center text-sm text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2 transition-colors"
          >
            Contact us →
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(settings)/settings/plan/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PlanDisplay } from "@/components/settings/plan-display";

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  // Non-admins cannot access this page
  if (profile.role !== "admin") redirect("/settings/account");

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, profile.orgId));
  if (!org) redirect("/login");

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Plan</h1>
        <p className="text-sm text-zinc-500">
          Your current plan and included features.
        </p>
      </div>
      <PlanDisplay plan={org.plan} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```
Visit `http://localhost:3000/settings/plan` as admin. Verify plan card shows. Navigate there as non-admin — should redirect to `/settings/account`.

- [ ] **Step 5: Commit**

```bash
git add components/settings/plan-display.tsx \
  app/\(settings\)/settings/plan/page.tsx
git commit -m "feat: settings plan page — current plan + features table"
```

---

## Task 8: Danger Zone Page

**Files:**
- Create: `app/(settings)/settings/danger/page.tsx`
- Create: `components/settings/danger-zone.tsx`

- [ ] **Step 1: Create `components/settings/danger-zone.tsx`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { leaveOrg, deleteOrg } from "@/app/actions/settings";

interface Props {
  isAdmin: boolean;
  orgSlug: string;
}

export function DangerZone({ isAdmin, orgSlug }: Props) {
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleLeave() {
    startTransition(async () => {
      const result = await leaveOrg();
      if (result?.error) {
        setError(result.error);
        setShowLeaveConfirm(false);
      }
    });
  }

  function handleDelete() {
    if (deleteInput !== orgSlug) return;
    startTransition(async () => {
      const result = await deleteOrg(deleteInput);
      if (result?.error) {
        setError(result.error);
        setShowDeleteConfirm(false);
        setDeleteInput("");
      }
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/30 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

      {/* Leave workspace */}
      <div className="border border-zinc-800 rounded-xl px-6 py-5">
        <h3 className="text-sm font-medium text-white mb-1">Leave workspace</h3>
        <p className="text-xs text-zinc-500 mb-4">
          You'll lose access to all requests, designs, and team data.
          {isAdmin && " If you are the only admin, assign another admin first."}
        </p>

        {showLeaveConfirm ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-300">
              Are you sure? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleLeave}
                disabled={isPending}
                className="text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 transition-colors disabled:opacity-40"
              >
                {isPending ? "Leaving…" : "Yes, leave"}
              </button>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg px-4 py-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setError(null); setShowLeaveConfirm(true); }}
            className="text-sm text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-700/50 rounded-lg px-4 py-2 transition-colors"
          >
            Leave workspace
          </button>
        )}
      </div>

      {/* Delete workspace — admin only */}
      {isAdmin && (
        <div className="border border-red-900/30 rounded-xl px-6 py-5">
          <h3 className="text-sm font-medium text-red-400 mb-1">
            Delete workspace
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            Permanently deletes the org, all members, all requests, and all
            data. This cannot be undone.
          </p>

          {showDeleteConfirm ? (
            <div className="space-y-3">
              <p className="text-sm text-zinc-300">
                Type{" "}
                <span className="font-mono text-white bg-zinc-800 px-1.5 py-0.5 rounded">
                  {orgSlug}
                </span>{" "}
                to confirm.
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                placeholder={orgSlug}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-zinc-700 focus:outline-none focus:border-red-700 transition-colors"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleteInput !== orgSlug || isPending}
                  className="text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg px-4 py-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPending ? "Deleting…" : "Delete workspace"}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteInput("");
                  }}
                  className="text-sm text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg px-4 py-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { setError(null); setShowDeleteConfirm(true); }}
              className="text-sm text-red-400 hover:text-red-300 border border-red-900/40 hover:border-red-700/50 rounded-lg px-4 py-2 transition-colors"
            >
              Delete workspace
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `app/(settings)/settings/danger/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DangerZone } from "@/components/settings/danger-zone";

export default async function DangerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, profile.orgId));
  if (!org) redirect("/login");

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-white mb-1">Danger Zone</h1>
        <p className="text-sm text-zinc-500">
          Irreversible actions. Take care.
        </p>
      </div>
      <DangerZone isAdmin={profile.role === "admin"} orgSlug={org.slug} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```
Visit `http://localhost:3000/settings/danger`. Click "Leave workspace" — confirm prompt appears. Click Cancel — prompt disappears. Admin: click "Delete workspace" — input box appears, confirm button disabled until slug matches exactly.

- [ ] **Step 5: Final full type-check + build check**

```bash
npx tsc --noEmit && npm run build
```
Expected: no TypeScript errors, build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add components/settings/danger-zone.tsx \
  app/\(settings\)/settings/danger/page.tsx
git commit -m "feat: settings danger zone — leave and delete workspace"
```

---

## Self-Review Checklist

**Spec coverage:**
- Account (profile + password) → Task 4 ✓
- Workspace (org name + slug, admin vs non-admin) → Task 5 ✓
- Members (list, role change, remove, invite, pending invites, revoke) → Task 6 ✓
- Plan (card, features table, upgrade CTA, admin guard) → Task 7 ✓
- Danger Zone (leave with admin guard, delete with slug confirm) → Task 8 ✓
- UserMenu dropdown entry point in all 4 headers → Task 2 ✓
- Settings layout + sidebar with role-aware Plan link → Task 3 ✓
- All 7 server actions → Task 1 ✓

**No placeholders found.**

**Type consistency:**
- `updateProfile`, `updateOrganization`, `updateMemberRole`, `removeMember`, `revokeInvite`, `leaveOrg`, `deleteOrg` — used consistently across actions file and client components ✓
- `MembersList` receives `{ id, fullName, email, role }[]` — server page maps profiles to this shape ✓
- `PendingInvites` receives `{ id, email, role, expiresAt, acceptedAt }[]` — server page maps invites correctly ✓
- `WorkspaceForm` receives `{ name, slug, plan }` + `isAdmin` — server page passes org fields ✓
- `DangerZone` receives `isAdmin` + `orgSlug` — server page passes both ✓
