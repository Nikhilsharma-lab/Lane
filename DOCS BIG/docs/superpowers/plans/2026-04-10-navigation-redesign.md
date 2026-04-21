# Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Lane's sidebar from 14 links to 9, introduce a smart Home with focus ordering, enhance the Requests page with contextual kanban/board views, add Projects as a first-class entity, and implement saveable/pinnable Views.

**Architecture:** The sidebar component is rewritten with a new nav structure. Home page is rewritten with focus-ordered sections and tabs. The existing `RequestList` component is extended with a "Group By" dropdown and a contextual kanban toggle (reusing the existing `DevBoard` component) that activates when phase=dev is selected. Projects get schema enhancements (icon, target_date, members join table) and a dedicated page. Saved Views extend the existing `published_views` schema with pinning support.

**Tech Stack:** Next.js 14 App Router, TypeScript, Drizzle ORM, Supabase, Tailwind CSS, shadcn/ui, @dnd-kit (existing), lucide-react icons

---

## File Structure

### New Files
- `db/schema/project_members.ts` — Project members join table schema
- `app/(dashboard)/dashboard/requests/page.tsx` — New unified Requests page (server component)
- `app/(dashboard)/dashboard/requests/requests-client.tsx` — Client component with phase tabs, grouping, contextual views
- `app/(dashboard)/dashboard/projects/page.tsx` — Projects overview page
- `app/(dashboard)/dashboard/projects/projects-client.tsx` — Projects client component
- `components/requests/group-by-dropdown.tsx` — Group by selector
- `components/requests/view-mode-toggle.tsx` — List/Board/Kanban toggle
- `components/requests/save-view-button.tsx` — Save current filters as a view
- `components/requests/board-view.tsx` — Board view (columns by stage)
- `components/shell/pinned-views.tsx` — Pinned views section in sidebar
- `app/api/views/route.ts` — CRUD API for saved views
- `app/api/views/[id]/pin/route.ts` — Pin/unpin a view
- `app/actions/projects.ts` — Server actions for project CRUD
- `lib/focus-ordering.ts` — Focus ordering logic for Home page

### Modified Files
- `db/schema/projects.ts` — Add icon, target_date, status fields
- `db/schema/published_views.ts` — Add groupBy, viewMode, sortBy, pinnedBy fields
- `db/schema/index.ts` — Export new project_members schema
- `components/shell/sidebar.tsx` — Complete rewrite: 9 links + pinned views
- `components/shell/hotkeys-provider.tsx` — Update routes for new nav
- `app/(dashboard)/layout.tsx` — Pass pinned views data to Sidebar
- `app/(dashboard)/dashboard/page.tsx` — Rewrite as Home with focus ordering + tabs

### Unchanged (reused as-is)
- `components/dev-board/dev-board.tsx` — Reused for kanban inside Requests page
- `components/dev-board/kanban-column.tsx` — Reused
- `components/dev-board/kanban-card.tsx` — Reused
- `components/dev-board/card-drawer.tsx` — Reused
- `components/dev-board/types.ts` — Reused
- `components/requests/request-list.tsx` — Preserved as legacy, phased out gradually
- `components/shell/detail-dock.tsx` — Unchanged

---

## Task 1: Projects Schema Enhancement

**Files:**
- Modify: `db/schema/projects.ts`
- Create: `db/schema/project_members.ts`
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Update projects schema**

In `db/schema/projects.ts`, add icon, target_date, and status columns:

```typescript
// db/schema/projects.ts
import { pgTable, uuid, text, timestamp, date } from "drizzle-orm/pg-core";
import { profiles, organizations } from "./users";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  color: text("color").notNull().default("#71717a"),
  leadId: uuid("lead_id").references(() => profiles.id),
  targetDate: date("target_date"),
  status: text("status").notNull().default("active"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
```

- [ ] **Step 2: Create project_members schema**

```typescript
// db/schema/project_members.ts
import { pgTable, uuid, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { profiles } from "./users";

export const projectMembers = pgTable(
  "project_members",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.userId] }),
  })
);

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;
```

- [ ] **Step 3: Export from schema index**

In `db/schema/index.ts`, add the new export after the projects line:

```typescript
export * from "./project_members";
```

- [ ] **Step 4: Generate and push migration**

Run:
```bash
npm run db:generate
npm run db:push
```

Expected: Migration generated and applied successfully. New columns on `projects` table, new `project_members` table created.

- [ ] **Step 5: Commit**

```bash
git add db/schema/projects.ts db/schema/project_members.ts db/schema/index.ts drizzle/
git commit -m "feat: enhance projects schema with icon, target_date, members"
```

---

## Task 2: Saved Views Schema Enhancement

**Files:**
- Modify: `db/schema/published_views.ts`

- [ ] **Step 1: Add groupBy, viewMode, sortBy, and pinnedBy to published_views**

```typescript
// db/schema/published_views.ts
import { pgTable, uuid, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { organizations } from "./users";
import { profiles } from "./users";

export interface ViewFilters {
  phase?: string[];
  priority?: string[];
  projectId?: string[];
  initiativeId?: string[];
  cycleId?: string[];
  designStage?: string[];
  kanbanState?: string[];
  assigneeId?: string[];
  status?: string[];
  createdBy?: string[];
}

export const publishedViews = pgTable("published_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => profiles.id),
  name: text("name").notNull(),
  description: text("description"),
  viewType: text("view_type").notNull(),
  filters: jsonb("filters").$type<ViewFilters>().notNull().default({}),
  groupBy: text("group_by"),
  viewMode: text("view_mode").notNull().default("list"),
  sortBy: text("sort_by"),
  accessMode: text("access_mode").notNull().default("authenticated"),
  publicToken: text("public_token").unique(),
  allowComments: boolean("allow_comments").notNull().default(false),
  allowVoting: boolean("allow_voting").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  pinnedBy: jsonb("pinned_by").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PublishedView = typeof publishedViews.$inferSelect;
export type NewPublishedView = typeof publishedViews.$inferInsert;
```

- [ ] **Step 2: Generate and push migration**

Run:
```bash
npm run db:generate
npm run db:push
```

- [ ] **Step 3: Commit**

```bash
git add db/schema/published_views.ts drizzle/
git commit -m "feat: add groupBy, viewMode, pinnedBy to saved views schema"
```

---

## Task 3: Sidebar Rewrite

**Files:**
- Modify: `components/shell/sidebar.tsx`
- Create: `components/shell/pinned-views.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create PinnedViews component**

```typescript
// components/shell/pinned-views.tsx
"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Pin } from "lucide-react";

interface PinnedView {
  id: string;
  name: string;
  viewType: string;
  filters: Record<string, unknown>;
  groupBy: string | null;
  viewMode: string;
}

interface Props {
  views: PinnedView[];
}

function buildViewHref(view: PinnedView): string {
  const params = new URLSearchParams();
  const filters = view.filters as Record<string, string[] | undefined>;

  if (filters.phase?.length === 1) params.set("phase", filters.phase[0]);
  if (filters.priority?.length === 1) params.set("priority", filters.priority[0]);
  if (filters.projectId?.length === 1) params.set("project", filters.projectId[0]);
  if (filters.assigneeId?.length === 1) params.set("assignee", filters.assigneeId[0]);
  if (filters.designStage?.length === 1) params.set("stage", filters.designStage[0]);
  if (view.groupBy) params.set("group", view.groupBy);
  if (view.viewMode && view.viewMode !== "list") params.set("view", view.viewMode);

  const qs = params.toString();
  return `/dashboard/requests${qs ? `?${qs}` : ""}`;
}

export function PinnedViews({ views }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentUrl = `${pathname}?${searchParams.toString()}`;

  if (views.length === 0) {
    return (
      <div className="px-2.5 py-2">
        <p
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            color: "var(--text-tertiary)",
            lineHeight: 1.4,
          }}
        >
          Save a filtered view from Requests to pin it here
        </p>
      </div>
    );
  }

  return (
    <div className="py-0.5 px-1">
      {views.map((view) => {
        const href = buildViewHref(view);
        const isActive = currentUrl.includes(href);

        return (
          <Link
            key={view.id}
            href={href}
            className="flex items-center gap-2 px-2.5 py-[6px] rounded-[7px] transition-colors hover:bg-[var(--bg-hover)]"
            style={{
              background: isActive ? "var(--bg-hover)" : undefined,
            }}
          >
            <Pin size={12} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <span
              className="truncate"
              style={{
                fontSize: 12,
                fontWeight: isActive ? 540 : 440,
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                letterSpacing: "-0.01em",
              }}
            >
              {view.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite Sidebar component**

Replace the entire content of `components/shell/sidebar.tsx`:

```typescript
// components/shell/sidebar.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import {
  Home,
  Inbox,
  Zap,
  FolderOpen,
  Lightbulb,
  Clock,
  BarChart3,
  Users,
  Plus,
  Search,
  ChevronDown,
  Settings,
  LogOut,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { PinnedViews } from "./pinned-views";

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  badge?: number | string;
  badgeStyle?: "accent" | "warn" | "muted";
}

interface SidebarBanner {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

interface PinnedView {
  id: string;
  name: string;
  viewType: string;
  filters: Record<string, unknown>;
  groupBy: string | null;
  viewMode: string;
}

interface Props {
  user: { initials: string; name: string; role: string };
  userRole?: string;
  orgName: string;
  orgPlan: string;
  activeCount: number;
  pinnedViews?: PinnedView[];
  banner?: SidebarBanner;
}

// ── Nav Item ─────────────────────────────────────────────────────────────────

function NavItemLink({ href, icon: Icon, label, badge, badgeStyle }: NavItem) {
  const pathname = usePathname();
  const isActive =
    (href === "/dashboard" && pathname === "/dashboard") ||
    (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-[7px] rounded-[7px] relative transition-colors hover:bg-[var(--bg-hover)]"
      style={{
        background: isActive ? "var(--bg-hover)" : undefined,
      }}
    >
      {isActive && (
        <span
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r"
          style={{ width: 2.5, height: 14, background: "var(--accent)" }}
        />
      )}
      <Icon size={15} />
      <span
        className="flex-1 truncate"
        style={{
          fontSize: 13,
          fontWeight: isActive ? 560 : 460,
          color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </span>
      {badge !== undefined && (
        <span
          className="rounded-full text-center"
          style={{
            fontFamily: "'Geist Mono', monospace",
            fontSize: 10,
            fontWeight: 600,
            padding: "1px 6px",
            minWidth: 16,
            lineHeight: "16px",
            ...(badgeStyle === "accent"
              ? { background: "var(--accent)", color: "#fff" }
              : badgeStyle === "warn"
              ? { background: "rgba(212,168,75,0.12)", color: "#D4A84B" }
              : {
                  background: "var(--bg-hover)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }),
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

// ── Divider ─────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "var(--border)",
        margin: "6px 12px",
      }}
    />
  );
}

// ── Section Label ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="px-2.5 pt-2 pb-1"
      style={{
        fontFamily: "'Geist Mono', monospace",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--text-tertiary)",
      }}
    >
      {label}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({
  user,
  userRole,
  orgName,
  orgPlan,
  activeCount,
  pinnedViews = [],
  banner,
}: Props) {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  return (
    <aside
      className="flex flex-col shrink-0 select-none"
      style={{
        width: 256,
        minWidth: 256,
        height: "100vh",
        background: "var(--bg-subtle)",
        borderRight: "1px solid var(--border)",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}
    >
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="px-3.5 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5 px-1.5 py-1 rounded-lg cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
          <div
            className="flex items-center justify-center rounded-[7px] shrink-0"
            style={{
              width: 28,
              height: 28,
              background: "var(--accent)",
              boxShadow: "0 1px 4px rgba(46,83,57,0.15)",
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>
              {orgName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 620,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              {orgName}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: "var(--accent)",
                  background: "rgba(46,83,57,0.08)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                {orgPlan}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                }}
              >
                {activeCount} active
              </span>
            </div>
          </div>
          <ChevronDown
            size={14}
            className="shrink-0 opacity-40"
            style={{ color: "var(--text-tertiary)" }}
          />
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 mt-2.5 px-2.5 py-[7px] rounded-[7px] cursor-text"
          style={{
            background: "var(--bg-hover)",
            border: "1px solid var(--border)",
          }}
        >
          <Search size={13} style={{ color: "var(--text-tertiary)" }} />
          <span style={{ fontSize: 12.5, color: "var(--text-tertiary)", flex: 1 }}>
            Search...
          </span>
          <kbd
            style={{
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9.5,
              color: "var(--text-tertiary)",
              background: "var(--bg-subtle)",
              border: "1px solid var(--border)",
              padding: "1px 5px",
              borderRadius: 3,
            }}
          >
            ⌘K
          </kbd>
        </div>
      </div>

      {/* ── Scrollable ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5 sidebar-scroll">
        {/* Core */}
        <div className="py-0.5 px-1">
          <NavItemLink href="/dashboard" icon={Home} label="Home" />
          <NavItemLink href="/dashboard/inbox" icon={Inbox} label="Inbox" badge={3} badgeStyle="accent" />
        </div>

        <Divider />

        {/* Workspace */}
        <div className="py-0.5 px-1">
          <NavItemLink href="/dashboard/requests" icon={Zap} label="Requests" />
          <NavItemLink href="/dashboard/projects" icon={FolderOpen} label="Projects" />
          <NavItemLink href="/dashboard/ideas" icon={Lightbulb} label="Ideas" />
          <NavItemLink href="/dashboard/cycles" icon={Clock} label="Cycles" />
        </div>

        <Divider />

        {/* Insights & Team */}
        <div className="py-0.5 px-1">
          <NavItemLink href="/dashboard/insights" icon={BarChart3} label="Insights" />
          <NavItemLink href="/dashboard/team" icon={Users} label="Team" />
        </div>

        {/* Pinned Views */}
        {(pinnedViews.length > 0) && (
          <>
            <Divider />
            <SectionLabel label="Pinned Views" />
            <PinnedViews views={pinnedViews} />
          </>
        )}
      </div>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-t" style={{ borderColor: "var(--border)" }}>
        {/* New Request button */}
        <button
          className="flex items-center justify-center gap-1.5 mx-3 mt-3 py-2 w-[calc(100%-24px)] rounded-[7px] transition-colors"
          style={{
            background: "var(--accent)",
            color: "#fff",
            fontFamily: "'Satoshi', sans-serif",
            fontSize: 12.5,
            fontWeight: 560,
            border: "none",
            cursor: "pointer",
            boxShadow: "0 1px 6px rgba(46,83,57,0.15)",
          }}
        >
          <Plus size={14} />
          New Request
        </button>

        {/* Promo / update banner */}
        {banner && !bannerDismissed && (
          <div
            className="mx-2.5 mt-2.5 p-3 rounded-lg"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 580,
                  color: "var(--text-primary)",
                  lineHeight: 1.3,
                }}
              >
                {banner.title}
              </span>
              <button
                onClick={() => setBannerDismissed(true)}
                className="shrink-0 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] transition-all"
                style={{
                  width: 20,
                  height: 20,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-tertiary)",
                  marginTop: -2,
                }}
              >
                <X size={10} />
              </button>
            </div>
            <p
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.45,
                marginTop: 4,
              }}
            >
              {banner.description}
            </p>
            <Link
              href={banner.ctaHref}
              className="flex items-center justify-center mt-2.5 py-1.5 rounded-md transition-opacity hover:opacity-85"
              style={{
                background: "var(--text-primary)",
                color: "var(--bg-surface)",
                fontSize: 12,
                fontWeight: 560,
                textDecoration: "none",
              }}
            >
              {banner.ctaLabel}
            </Link>
          </div>
        )}

        {/* User */}
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 pb-4">
          <div
            className="flex items-center justify-center rounded-full shrink-0 cursor-pointer"
            style={{
              width: 28,
              height: 28,
              background:
                "linear-gradient(135deg, rgba(46,83,57,0.30), rgba(194,123,158,0.30))",
              fontSize: 10.5,
              fontWeight: 650,
              color: "var(--text-primary)",
            }}
          >
            {user.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12.5, fontWeight: 530, color: "var(--text-primary)" }}>
              {user.name}
            </div>
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: "var(--text-tertiary)",
                marginTop: 1,
              }}
            >
              {user.role}
            </div>
          </div>
          <div className="flex gap-1 items-center">
            <NotificationsBell userRole={userRole} />
            <Link
              href="/settings"
              className="p-1 rounded opacity-40 hover:opacity-70 hover:bg-[var(--bg-hover)] transition-all"
            >
              <Settings size={14} />
            </Link>
            <form action={logout}>
              <button
                type="submit"
                className="p-1 rounded opacity-40 hover:opacity-70 hover:bg-red-500/10 transition-all"
                style={{ background: "none", border: "none", cursor: "pointer" }}
              >
                <LogOut size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Update layout to pass pinned views**

In `app/(dashboard)/layout.tsx`, add imports and query pinned views for the current user, then pass them to Sidebar:

Add to imports:
```typescript
import { publishedViews } from "@/db/schema";
import { and, sql } from "drizzle-orm";
```

After the `orgRequests` fetch (around line 62), add:
```typescript
        const userPinnedViews = await db
          .select({
            id: publishedViews.id,
            name: publishedViews.name,
            viewType: publishedViews.viewType,
            filters: publishedViews.filters,
            groupBy: publishedViews.groupBy,
            viewMode: publishedViews.viewMode,
          })
          .from(publishedViews)
          .where(
            and(
              eq(publishedViews.orgId, profile.orgId),
              eq(publishedViews.isActive, true),
              sql`${publishedViews.pinnedBy} @> ${JSON.stringify([user.id])}::jsonb`
            )
          );
```

Store it in a variable initialized to `[]` at the top alongside `orgRequests`, and pass to Sidebar:
```typescript
pinnedViews={userPinnedViews}
```

- [ ] **Step 4: Verify sidebar renders correctly**

Run:
```bash
npm run dev
```

Open `http://localhost:3000/dashboard` — verify the sidebar shows: Home, Inbox, divider, Requests, Projects, Ideas, Cycles, divider, Insights, Team. No old links (Intake, Journey, Betting, Dev Board, etc.).

- [ ] **Step 5: Commit**

```bash
git add components/shell/sidebar.tsx components/shell/pinned-views.tsx app/\(dashboard\)/layout.tsx
git commit -m "feat: rewrite sidebar with 9-link structure and pinned views"
```

---

## Task 4: Update Hotkeys

**Files:**
- Modify: `components/shell/hotkeys-provider.tsx`

- [ ] **Step 1: Update hotkey routes**

```typescript
// components/shell/hotkeys-provider.tsx
"use client";

import { useRouter } from "next/navigation";
import { useHotkeys } from "@/hooks/use-hotkeys";

export function HotkeysProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useHotkeys([
    { keys: ["g", "h"], action: () => router.push("/dashboard") },
    { keys: ["g", "r"], action: () => router.push("/dashboard/requests") },
    { keys: ["g", "i"], action: () => router.push("/dashboard/inbox") },
    { keys: ["g", "p"], action: () => router.push("/dashboard/projects") },
    { keys: ["g", "a"], action: () => router.push("/dashboard/ideas") },
    { keys: ["g", "c"], action: () => router.push("/dashboard/cycles") },
    { keys: ["g", "n"], action: () => router.push("/dashboard/insights") },
    { keys: ["g", "t"], action: () => router.push("/dashboard/team") },
    { keys: ["g", "s"], action: () => router.push("/settings") },
    { keys: ["n", "r"], action: () => router.push("/dashboard/requests?new=1") },
    { keys: ["n", "i"], action: () => router.push("/dashboard/ideas?new=1") },
    { keys: ["n", "s"], action: () => router.push("/dashboard/stickies?new=1") },
  ]);

  return <>{children}</>;
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shell/hotkeys-provider.tsx
git commit -m "feat: update hotkeys for new navigation routes"
```

---

## Task 5: Home Page Rewrite

**Files:**
- Create: `lib/focus-ordering.ts`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create focus ordering logic**

```typescript
// lib/focus-ordering.ts
import type { Request } from "@/db/schema";

export interface FocusSection {
  key: string;
  label: string;
  color: string;
  requests: Request[];
}

interface FocusOrderingInput {
  allRequests: Request[];
  userId: string;
  myRequestIds: Set<string>;
  validationsPending?: Set<string>;
}

export function buildFocusSections({
  allRequests,
  userId,
  myRequestIds,
  validationsPending = new Set(),
}: FocusOrderingInput): FocusSection[] {
  const sections: FocusSection[] = [];

  // 1. Needs Your Attention — sign-offs, blocks, input needed
  const needsAttention = allRequests.filter((r) => {
    if (validationsPending.has(r.id)) return true;
    if (r.status === "blocked" && myRequestIds.has(r.id)) return true;
    return false;
  });
  if (needsAttention.length > 0) {
    sections.push({
      key: "attention",
      label: "Needs Your Attention",
      color: "#EF4444",
      requests: needsAttention,
    });
  }

  // 2. Active Work — assigned to you, in progress
  const activeStatuses = new Set(["assigned", "in_progress", "in_review"]);
  const activeWork = allRequests.filter(
    (r) =>
      myRequestIds.has(r.id) &&
      activeStatuses.has(r.status) &&
      !needsAttention.includes(r)
  );
  if (activeWork.length > 0) {
    sections.push({
      key: "active",
      label: "Active Work",
      color: "#2E5339",
      requests: activeWork,
    });
  }

  // 3. Recently Updated — subscribed/created with recent activity
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const recentlyUpdated = allRequests.filter(
    (r) =>
      r.updatedAt > threeDaysAgo &&
      (r.requesterId === userId || myRequestIds.has(r.id)) &&
      !needsAttention.includes(r) &&
      !activeWork.includes(r)
  );
  if (recentlyUpdated.length > 0) {
    sections.push({
      key: "recent",
      label: "Recently Updated",
      color: "#6B7280",
      requests: recentlyUpdated.slice(0, 10),
    });
  }

  // 4. Completed — recently shipped
  const completed = allRequests.filter(
    (r) =>
      ["completed", "shipped"].includes(r.status) &&
      r.updatedAt > threeDaysAgo &&
      (r.requesterId === userId || myRequestIds.has(r.id))
  );
  if (completed.length > 0) {
    sections.push({
      key: "completed",
      label: "Completed",
      color: "#9CA3AF",
      requests: completed.slice(0, 5),
    });
  }

  return sections;
}
```

- [ ] **Step 2: Rewrite Home page**

Replace `app/(dashboard)/dashboard/page.tsx` with:

```typescript
// app/(dashboard)/dashboard/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  assignments,
  projects,
  morningBriefings,
  proactiveAlerts,
  validations,
} from "@/db/schema";
import { eq, and, isNull, gte, inArray, sql } from "drizzle-orm";
import { RealtimeDashboard } from "@/components/realtime/realtime-dashboard";
import { MorningBriefingCard } from "@/components/dashboard/morning-briefing-card";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import { buildFocusSections } from "@/lib/focus-ordering";
import { getActiveStageLabel, getPhaseLabel } from "@/lib/workflow";
import type { Request } from "@/db/schema";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/signup");

  // Fetch all org requests
  const allRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .orderBy(
      sql`CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END`,
      requests.createdAt
    );

  // My assignments
  const myAssignments = await db
    .select({ requestId: assignments.requestId })
    .from(assignments)
    .where(eq(assignments.assigneeId, user.id));
  const myRequestIds = new Set(myAssignments.map((a) => a.requestId));

  // Pending validations (sign-offs I need to give)
  const myPendingValidations = await db
    .select({ requestId: validations.requestId })
    .from(validations)
    .where(
      and(
        eq(validations.signerId, user.id),
        eq(validations.decision, "approved")
      )
    );
  const alreadySigned = new Set(myPendingValidations.map((v) => v.requestId));
  const proveRequests = allRequests.filter(
    (r) => r.phase === "design" && r.designStage === "prove"
  );
  const validationsPending = new Set(
    proveRequests.filter((r) => !alreadySigned.has(r.id)).map((r) => r.id)
  );

  // Morning briefing
  const todayString = new Date().toISOString().slice(0, 10);
  const [briefRow] = await db
    .select()
    .from(morningBriefings)
    .where(
      and(
        eq(morningBriefings.userId, user.id),
        eq(morningBriefings.date, todayString)
      )
    )
    .limit(1);
  const briefForCard = briefRow && !briefRow.dismissedAt ? briefRow : null;

  // Proactive alerts
  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const inlineAlerts = (
    await db
      .select({
        id: proactiveAlerts.id,
        type: proactiveAlerts.type,
        urgency: proactiveAlerts.urgency,
        title: proactiveAlerts.title,
        body: proactiveAlerts.body,
        ctaLabel: proactiveAlerts.ctaLabel,
        ctaUrl: proactiveAlerts.ctaUrl,
      })
      .from(proactiveAlerts)
      .where(
        and(
          eq(proactiveAlerts.recipientId, user.id),
          eq(proactiveAlerts.dismissed, false),
          gte(proactiveAlerts.expiresAt, new Date())
        )
      )
  ).sort(
    (a, b) => (urgencyOrder[a.urgency] ?? 9) - (urgencyOrder[b.urgency] ?? 9)
  );

  // Project map for display
  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));
  const projectMap = Object.fromEntries(
    activeProjects.map((p) => [p.id, { name: p.name, color: p.color }])
  );

  // Assignee names
  const orgReqIds = allRequests.map((r) => r.id);
  const allAssignmentRows = orgReqIds.length
    ? await db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
        })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
    : [];
  const orgMembers = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));
  const memberMap = Object.fromEntries(
    orgMembers.map((m) => [m.id, m.fullName])
  );
  const assigneesByRequest: Record<string, string[]> = {};
  for (const a of allAssignmentRows) {
    if (!assigneesByRequest[a.requestId]) assigneesByRequest[a.requestId] = [];
    const name = memberMap[a.assigneeId];
    if (name) assigneesByRequest[a.requestId].push(name);
  }

  // Build focus sections
  const sections = buildFocusSections({
    allRequests,
    userId: user.id,
    myRequestIds,
    validationsPending,
  });

  return (
    <>
      <RealtimeDashboard orgId={profile.orgId} />

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 52,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-surface)",
        }}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          Home
        </span>
      </div>

      {/* Content */}
      <div style={{ padding: "16px 20px", maxWidth: 800 }}>
        {/* Morning briefing */}
        <MorningBriefingCard
          brief={briefForCard}
          alertCount={inlineAlerts.length}
        />

        {/* Alerts */}
        <AlertsSection alerts={inlineAlerts} />

        {/* Focus sections */}
        {sections.map((section) => (
          <div key={section.key} style={{ marginBottom: 24 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: section.color,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: section.color,
                }}
              >
                {section.label}
              </span>
              <span
                style={{
                  fontFamily: "'Geist Mono', monospace",
                  fontSize: 10,
                  color: "var(--text-tertiary)",
                }}
              >
                {section.requests.length}
              </span>
            </div>

            {section.requests.map((r: Request) => {
              const proj = r.projectId ? projectMap[r.projectId] : null;
              const assignees = assigneesByRequest[r.id] ?? [];

              return (
                <a
                  key={r.id}
                  href={`/dashboard/requests?dock=${r.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    marginBottom: 4,
                    textDecoration: "none",
                    transition: "background 0.1s",
                  }}
                  className="hover:bg-[var(--bg-subtle)]"
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                      }}
                    >
                      {r.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                        marginTop: 2,
                      }}
                    >
                      {r.phase ? getPhaseLabel(r.phase) : ""} · {getActiveStageLabel(r)}
                      {proj ? ` · ${proj.name}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {r.priority && (
                      <span
                        style={{
                          fontFamily: "'Geist Mono', monospace",
                          fontSize: 10,
                          fontWeight: 600,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: `var(--priority-${r.priority}-bg)`,
                          color: `var(--priority-${r.priority}-text)`,
                        }}
                      >
                        {r.priority.toUpperCase()}
                      </span>
                    )}
                    {assignees.length > 0 && (
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-tertiary)",
                        }}
                      >
                        {assignees[0]}
                      </span>
                    )}
                  </div>
                </a>
              );
            })}
          </div>
        ))}

        {sections.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: "56px 0",
              color: "var(--text-tertiary)",
            }}
          >
            <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              You&apos;re clear.
            </p>
            <p style={{ fontSize: 12 }}>
              Time to think, learn, or help a teammate.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify Home page renders**

Run:
```bash
npm run dev
```

Open `http://localhost:3000/dashboard` — verify the Home page shows focus-ordered sections: Needs Your Attention, Active Work, Recently Updated. Morning briefing card at top. Empty state copy matches Lane's language guide.

- [ ] **Step 4: Commit**

```bash
git add lib/focus-ordering.ts app/\(dashboard\)/dashboard/page.tsx
git commit -m "feat: rewrite Home page with focus ordering sections"
```

---

## Task 6: Unified Requests Page

**Files:**
- Create: `app/(dashboard)/dashboard/requests/page.tsx`
- Create: `app/(dashboard)/dashboard/requests/requests-client.tsx`
- Create: `components/requests/group-by-dropdown.tsx`
- Create: `components/requests/view-mode-toggle.tsx`
- Create: `components/requests/board-view.tsx`
- Create: `components/requests/save-view-button.tsx`

- [ ] **Step 1: Create the Group By dropdown**

```typescript
// components/requests/group-by-dropdown.tsx
"use client";

import { useState, useRef, useEffect } from "react";

export type GroupByOption = "none" | "phase" | "stage" | "project" | "assignee" | "priority" | "cycle";

const GROUP_OPTIONS: { key: GroupByOption; label: string }[] = [
  { key: "none", label: "None" },
  { key: "phase", label: "Phase" },
  { key: "stage", label: "Stage" },
  { key: "project", label: "Project" },
  { key: "assignee", label: "Assignee" },
  { key: "priority", label: "Priority" },
  { key: "cycle", label: "Cycle" },
];

interface Props {
  value: GroupByOption;
  onChange: (value: GroupByOption) => void;
}

export function GroupByDropdown({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentLabel = GROUP_OPTIONS.find((o) => o.key === value)?.label ?? "None";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          height: 28,
          padding: "0 10px",
          borderRadius: 4,
          fontSize: 11,
          fontFamily: "'Geist Mono', monospace",
          background: "var(--bg-subtle)",
          color: value !== "none" ? "var(--text-primary)" : "var(--text-tertiary)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        Group: {currentLabel} ▾
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 32,
            left: 0,
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 4,
            minWidth: 140,
            zIndex: 50,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          {GROUP_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                onChange(opt.key);
                setOpen(false);
              }}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                borderRadius: 4,
                fontSize: 12,
                fontFamily: "'Geist Mono', monospace",
                background: opt.key === value ? "var(--bg-hover)" : "transparent",
                color: opt.key === value ? "var(--text-primary)" : "var(--text-secondary)",
                fontWeight: opt.key === value ? 600 : 400,
                border: "none",
                cursor: "pointer",
              }}
              className="hover:bg-[var(--bg-hover)]"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create the View Mode toggle**

```typescript
// components/requests/view-mode-toggle.tsx
"use client";

import { List, LayoutGrid, Kanban } from "lucide-react";

export type ViewMode = "list" | "board" | "kanban";

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  availableModes: ViewMode[];
}

const MODE_ICONS: Record<ViewMode, React.ComponentType<{ size?: number }>> = {
  list: List,
  board: LayoutGrid,
  kanban: Kanban,
};

const MODE_LABELS: Record<ViewMode, string> = {
  list: "List",
  board: "Board",
  kanban: "Kanban",
};

export function ViewModeToggle({ value, onChange, availableModes }: Props) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 4,
        overflow: "hidden",
        border: "1px solid var(--border)",
      }}
    >
      {availableModes.map((mode) => {
        const Icon = MODE_ICONS[mode];
        const isActive = value === mode;
        return (
          <button
            key={mode}
            onClick={() => onChange(mode)}
            title={MODE_LABELS[mode]}
            style={{
              height: 28,
              width: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isActive ? "var(--text-primary)" : "var(--bg-subtle)",
              color: isActive ? "#fff" : "var(--text-tertiary)",
              border: "none",
              cursor: "pointer",
              borderRight:
                mode !== availableModes[availableModes.length - 1]
                  ? "1px solid var(--border)"
                  : "none",
            }}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create the Board View component**

```typescript
// components/requests/board-view.tsx
"use client";

import type { Request } from "@/db/schema";
import { getActiveStageLabel, getPhaseLabel, DESIGN_STAGES } from "@/lib/workflow";

interface Props {
  requests: Request[];
  columns: { key: string; label: string }[];
  getColumnKey: (r: Request) => string;
  projectMap: Record<string, { name: string; color: string }>;
  onRequestClick: (id: string) => void;
}

export function BoardView({
  requests,
  columns,
  getColumnKey,
  projectMap,
  onRequestClick,
}: Props) {
  const grouped: Record<string, Request[]> = {};
  for (const col of columns) grouped[col.key] = [];
  for (const r of requests) {
    const key = getColumnKey(r);
    if (grouped[key]) grouped[key].push(r);
  }

  return (
    <div
      style={{
        display: "flex",
        gap: 12,
        overflowX: "auto",
        padding: "16px 20px",
        flex: 1,
      }}
    >
      {columns.map((col) => (
        <div key={col.key} style={{ flex: 1, minWidth: 180 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
              padding: "0 4px",
            }}
          >
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-tertiary)",
              }}
            >
              {col.label}
            </span>
            <span
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 10,
                color: "var(--text-tertiary)",
              }}
            >
              {grouped[col.key].length}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {grouped[col.key].length === 0 ? (
              <div
                style={{
                  border: "1px dashed var(--border)",
                  borderRadius: 6,
                  padding: "24px 8px",
                  textAlign: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-tertiary)",
                  }}
                >
                  —
                </span>
              </div>
            ) : (
              grouped[col.key].map((r) => {
                const proj = r.projectId ? projectMap[r.projectId] : null;
                return (
                  <button
                    key={r.id}
                    onClick={() => onRequestClick(r.id)}
                    style={{
                      textAlign: "left",
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "10px 12px",
                      cursor: "pointer",
                      transition: "background 0.1s",
                    }}
                    className="hover:bg-[var(--bg-subtle)]"
                  >
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        marginBottom: 4,
                      }}
                    >
                      {r.title}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        alignItems: "center",
                      }}
                    >
                      {r.priority && (
                        <span
                          style={{
                            fontFamily: "'Geist Mono', monospace",
                            fontSize: 9,
                            fontWeight: 600,
                            padding: "1px 5px",
                            borderRadius: 3,
                            background: `var(--priority-${r.priority}-bg)`,
                            color: `var(--priority-${r.priority}-text)`,
                          }}
                        >
                          {r.priority.toUpperCase()}
                        </span>
                      )}
                      {proj && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "var(--text-tertiary)",
                          }}
                        >
                          {proj.name}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create Save View button**

```typescript
// components/requests/save-view-button.tsx
"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface Props {
  hasActiveFilters: boolean;
  onSave: (name: string) => void;
}

export function SaveViewButton({ hasActiveFilters, onSave }: Props) {
  const [showInput, setShowInput] = useState(false);
  const [name, setName] = useState("");

  if (!hasActiveFilters) return null;

  if (showInput) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="View name..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              onSave(name.trim());
              setName("");
              setShowInput(false);
            }
            if (e.key === "Escape") {
              setShowInput(false);
              setName("");
            }
          }}
          style={{
            height: 28,
            padding: "0 8px",
            borderRadius: 4,
            border: "1px solid var(--border-strong)",
            background: "var(--bg-surface)",
            fontSize: 11,
            fontFamily: "'Geist Mono', monospace",
            color: "var(--text-primary)",
            outline: "none",
            width: 140,
          }}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowInput(true)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        height: 28,
        padding: "0 8px",
        borderRadius: 4,
        fontSize: 11,
        fontFamily: "'Geist Mono', monospace",
        color: "var(--accent)",
        background: "transparent",
        border: "none",
        cursor: "pointer",
      }}
    >
      <Star size={12} /> Save View
    </button>
  );
}
```

- [ ] **Step 5: Create the Requests server page**

```typescript
// app/(dashboard)/dashboard/requests/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments, projects } from "@/db/schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { RequestsPageClient } from "./requests-client";

export default async function RequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/signup");

  const allRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .orderBy(
      sql`CASE priority WHEN 'p0' THEN 0 WHEN 'p1' THEN 1 WHEN 'p2' THEN 2 WHEN 'p3' THEN 3 ELSE 4 END`,
      requests.createdAt
    );

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));

  const orgReqIds = allRequests.map((r) => r.id);
  const allAssignments = orgReqIds.length
    ? await db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
        })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
    : [];

  const orgMembers = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));

  const memberMap = Object.fromEntries(
    orgMembers.map((m) => [m.id, m.fullName ?? ""])
  );

  const assigneesByRequest: Record<string, string[]> = {};
  for (const a of allAssignments) {
    if (!assigneesByRequest[a.requestId])
      assigneesByRequest[a.requestId] = [];
    const name = memberMap[a.assigneeId];
    if (name) assigneesByRequest[a.requestId].push(name);
  }

  const projectMap = Object.fromEntries(
    activeProjects.map((p) => [p.id, { name: p.name, color: p.color }])
  );

  return (
    <RequestsPageClient
      requests={allRequests}
      projects={activeProjects}
      projectMap={projectMap}
      assigneesByRequest={assigneesByRequest}
      orgId={profile.orgId}
      userId={user.id}
    />
  );
}
```

- [ ] **Step 6: Create the Requests client component**

This is the core component. It renders the toolbar with phase tabs, group-by dropdown, view mode toggle, and save view button. The content area switches between list (existing table), board view (for design phase), and kanban (for dev phase, reusing DevBoard).

```typescript
// app/(dashboard)/dashboard/requests/requests-client.tsx
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Request } from "@/db/schema";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { GroupByDropdown, type GroupByOption } from "@/components/requests/group-by-dropdown";
import { ViewModeToggle, type ViewMode } from "@/components/requests/view-mode-toggle";
import { SaveViewButton } from "@/components/requests/save-view-button";
import { BoardView } from "@/components/requests/board-view";
import { FilterChips, type FilterChip } from "@/components/ui/filter-chips";
import { KanbanColumn } from "@/components/dev-board/kanban-column";
import {
  KANBAN_STATES,
  KANBAN_STATE_LABELS,
  type CardData,
  type KanbanState,
} from "@/components/dev-board/types";
import { NewRequestForm } from "@/components/requests/new-request-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchX } from "lucide-react";
import { DESIGN_STAGES, getActiveStageLabel } from "@/lib/workflow";

type PhaseFilter = "all" | "predesign" | "design" | "dev" | "track";

const PHASE_TABS: { key: PhaseFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "predesign", label: "Predesign" },
  { key: "design", label: "Design" },
  { key: "dev", label: "Dev" },
  { key: "track", label: "Impact" },
];

const DESIGN_STAGE_COLUMNS = DESIGN_STAGES.map((s) => ({
  key: s,
  label: s.charAt(0).toUpperCase() + s.slice(1),
}));

function getEffectivePhase(r: Request): string {
  if (r.phase) return r.phase;
  const stage = r.stage ?? "intake";
  if (["intake", "context", "shape", "bet"].includes(stage)) return "predesign";
  if (["explore", "validate", "handoff"].includes(stage)) return "design";
  if (stage === "build") return "dev";
  return "track";
}

interface Props {
  requests: Request[];
  projects: { id: string; name: string; color: string }[];
  projectMap: Record<string, { name: string; color: string }>;
  assigneesByRequest: Record<string, string[]>;
  orgId: string;
  userId: string;
}

export function RequestsPageClient({
  requests: allRequests,
  projects,
  projectMap,
  assigneesByRequest,
  orgId,
  userId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // State from URL
  const urlPhase = (searchParams.get("phase") ?? "all") as PhaseFilter;
  const urlGroup = (searchParams.get("group") ?? "none") as GroupByOption;
  const urlView = (searchParams.get("view") ?? "list") as ViewMode;
  const urlSearch = searchParams.get("q") ?? "";
  const urlProject = searchParams.get("project");
  const urlPriority = searchParams.get("priority");

  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(urlPhase);
  const [groupBy, setGroupBy] = useState<GroupByOption>(urlGroup);
  const [viewMode, setViewMode] = useState<ViewMode>(urlView);
  const [search, setSearch] = useState(urlSearch);
  const [showForm, setShowForm] = useState(false);

  // Sync URL on state changes
  const updateURL = useCallback(
    (overrides: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, val] of Object.entries(overrides)) {
        if (val === null || val === "all" || val === "none" || val === "list" || val === "") {
          params.delete(key);
        } else {
          params.set(key, val);
        }
      }
      // Preserve dock param
      const qs = params.toString();
      router.push(`/dashboard/requests${qs ? `?${qs}` : ""}`);
    },
    [router, searchParams]
  );

  // Available view modes depend on phase
  const availableModes = useMemo<ViewMode[]>(() => {
    if (phaseFilter === "dev") return ["list", "kanban"];
    if (phaseFilter === "design") return ["list", "board"];
    return ["list"];
  }, [phaseFilter]);

  // Auto-reset view mode when phase changes
  useEffect(() => {
    if (!availableModes.includes(viewMode)) {
      setViewMode("list");
    }
  }, [availableModes, viewMode]);

  // Filter requests
  const filtered = useMemo(() => {
    let result = allRequests;
    if (phaseFilter !== "all") {
      result = result.filter((r) => getEffectivePhase(r) === phaseFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q)
      );
    }
    if (urlProject) {
      result = result.filter((r) => r.projectId === urlProject);
    }
    if (urlPriority) {
      result = result.filter((r) => r.priority === urlPriority);
    }
    return result;
  }, [allRequests, phaseFilter, search, urlProject, urlPriority]);

  // Phase counts
  const phaseCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allRequests.length };
    for (const r of allRequests) {
      const p = getEffectivePhase(r);
      counts[p] = (counts[p] ?? 0) + 1;
    }
    return counts;
  }, [allRequests]);

  // Active filters for chips
  const hasActiveFilters =
    phaseFilter !== "all" || groupBy !== "none" || !!urlProject || !!urlPriority;

  // Kanban state for dev phase
  const [kanbanColumns, setKanbanColumns] = useState<Record<KanbanState, CardData[]>>(() => {
    const cols = Object.fromEntries(
      KANBAN_STATES.map((s) => [s, [] as CardData[]])
    ) as Record<KanbanState, CardData[]>;
    return cols;
  });

  useEffect(() => {
    if (phaseFilter === "dev" && viewMode === "kanban") {
      const cols = Object.fromEntries(
        KANBAN_STATES.map((s) => [s, [] as CardData[]])
      ) as Record<KanbanState, CardData[]>;
      for (const r of filtered) {
        const state = (r.kanbanState ?? "todo") as KanbanState;
        const proj = r.projectId ? projectMap[r.projectId] : null;
        cols[state].push({
          id: r.id,
          title: r.title,
          description: r.description,
          businessContext: r.businessContext ?? null,
          priority: r.priority ?? null,
          requestType: r.requestType ?? null,
          kanbanState: state,
          projectId: r.projectId ?? null,
          projectName: proj?.name ?? null,
          projectColor: proj?.color ?? null,
          assignees: assigneesByRequest[r.id] ?? [],
          deadlineAt: r.deadlineAt ? r.deadlineAt.toISOString() : null,
          figmaUrl: r.figmaUrl ?? null,
          figmaLockedAt: r.figmaLockedAt ? r.figmaLockedAt.toISOString() : null,
        });
      }
      setKanbanColumns(cols);
    }
  }, [filtered, phaseFilter, viewMode, projectMap, assigneesByRequest]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  async function handleKanbanDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const cardId = active.id as string;
    let toState = over.id as KanbanState;
    if (!KANBAN_STATES.includes(toState)) {
      for (const state of KANBAN_STATES) {
        if (kanbanColumns[state].find((c) => c.id === (over.id as string))) {
          toState = state;
          break;
        }
      }
    }
    if (!KANBAN_STATES.includes(toState)) return;
    let fromState: KanbanState | null = null;
    for (const state of KANBAN_STATES) {
      if (kanbanColumns[state].find((c) => c.id === cardId)) {
        fromState = state;
        break;
      }
    }
    if (!fromState || fromState === toState) return;

    // Optimistic update
    setKanbanColumns((prev) => {
      const card = prev[fromState!].find((c) => c.id === cardId);
      if (!card) return prev;
      return {
        ...prev,
        [fromState!]: prev[fromState!].filter((c) => c.id !== cardId),
        [toState]: [...prev[toState], { ...card, kanbanState: toState }],
      };
    });

    try {
      const res = await fetch(`/api/requests/${cardId}/kanban`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: toState }),
      });
      if (!res.ok) {
        router.refresh();
      }
    } catch {
      router.refresh();
    }
  }

  function openDock(requestId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("dock", requestId);
    router.push(`/dashboard/requests?${params.toString()}`);
  }

  async function handleSaveView(name: string) {
    const filters: Record<string, string[]> = {};
    if (phaseFilter !== "all") filters.phase = [phaseFilter];
    if (urlProject) filters.projectId = [urlProject];
    if (urlPriority) filters.priority = [urlPriority];

    await fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        filters,
        groupBy: groupBy !== "none" ? groupBy : null,
        viewMode,
        pin: true,
      }),
    });
    router.refresh();
  }

  return (
    <>
      {showForm && (
        <NewRequestForm onClose={() => setShowForm(false)} projects={projects} />
      )}

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 52,
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
          background: "var(--bg-surface)",
        }}
      >
        {/* Left: title + phase tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Requests
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {PHASE_TABS.map((tab) => {
              const active = phaseFilter === tab.key;
              const count = phaseCounts[tab.key] ?? 0;
              return (
                <button
                  key={tab.key}
                  onClick={() => {
                    setPhaseFilter(tab.key);
                    updateURL({ phase: tab.key });
                  }}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: "'Geist Mono', monospace",
                    fontWeight: active ? 600 : 400,
                    cursor: "pointer",
                    border: "none",
                    background: active ? "var(--text-primary)" : "transparent",
                    color: active ? "#ffffff" : "var(--text-tertiary)",
                    transition: "background 0.1s, color 0.1s",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {tab.label}
                  <span style={{ opacity: 0.6, fontSize: 10 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search… (/)"
            style={{
              height: 28,
              padding: "0 8px",
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-subtle)",
              fontSize: 11,
              fontFamily: "'Geist Mono', monospace",
              color: "var(--text-primary)",
              outline: "none",
              width: 120,
            }}
          />
          <GroupByDropdown
            value={groupBy}
            onChange={(v) => {
              setGroupBy(v);
              updateURL({ group: v });
            }}
          />
          {availableModes.length > 1 && (
            <ViewModeToggle
              value={viewMode}
              onChange={(m) => {
                setViewMode(m);
                updateURL({ view: m });
              }}
              availableModes={availableModes}
            />
          )}
          <SaveViewButton hasActiveFilters={hasActiveFilters} onSave={handleSaveView} />
          <button
            onClick={() => setShowForm(true)}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: 600,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            + New
          </button>
        </div>
      </div>

      {/* ── Content Area ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No requests match your filters."
          subtitle={
            search
              ? `No results for "${search}"`
              : "Try adjusting your filters to see more requests."
          }
        />
      ) : viewMode === "kanban" && phaseFilter === "dev" ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragEnd={handleKanbanDragEnd}
        >
          <div
            className="flex gap-4 overflow-x-auto"
            style={{ padding: "16px 20px", flex: 1 }}
          >
            {KANBAN_STATES.map((state) => (
              <KanbanColumn
                key={state}
                state={state}
                label={KANBAN_STATE_LABELS[state]}
                cards={kanbanColumns[state]}
                focusedCardId={null}
                onCardClick={(card) => openDock(card.id)}
                onCardFocus={() => {}}
              />
            ))}
          </div>
        </DndContext>
      ) : viewMode === "board" && phaseFilter === "design" ? (
        <BoardView
          requests={filtered}
          columns={DESIGN_STAGE_COLUMNS}
          getColumnKey={(r) => r.designStage ?? "sense"}
          projectMap={projectMap}
          onRequestClick={openDock}
        />
      ) : (
        /* Default: list view — render a simplified table inline */
        <div style={{ overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                }}
              >
                {["ID", "REQUEST", "STAGE", "ASSIGNEE", "PRIORITY"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 12px",
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 10,
                        fontWeight: 500,
                        color: "var(--text-tertiary)",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const proj = r.projectId ? projectMap[r.projectId] : null;
                const assignees = assigneesByRequest[r.id] ?? [];
                return (
                  <tr
                    key={r.id}
                    onClick={() => openDock(r.id)}
                    style={{
                      cursor: "pointer",
                      borderBottom: "1px solid var(--border)",
                    }}
                    className="hover:bg-[var(--bg-subtle)] transition-colors"
                  >
                    <td
                      style={{
                        padding: "10px 12px",
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {r.id.slice(0, 6).toUpperCase()}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--text-primary)",
                        }}
                      >
                        {r.title}
                      </div>
                      {proj && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--text-tertiary)",
                            fontFamily: "'Geist Mono', monospace",
                          }}
                        >
                          {proj.name}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontFamily: "'Geist Mono', monospace",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {getActiveStageLabel(r)}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "10px 12px",
                        fontSize: 11,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {assignees[0] ?? "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {r.priority && (
                        <span
                          style={{
                            fontFamily: "'Geist Mono', monospace",
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: `var(--priority-${r.priority}-bg)`,
                            color: `var(--priority-${r.priority}-text)`,
                          }}
                        >
                          {r.priority.toUpperCase()}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 7: Verify Requests page**

Run:
```bash
npm run dev
```

Navigate to `http://localhost:3000/dashboard/requests`. Verify:
- Phase tabs show with counts
- Clicking "Dev" shows kanban toggle, switching to kanban shows drag-drop columns
- Clicking "Design" shows board toggle, switching to board shows stage columns
- Group by dropdown works
- Save View button appears when filters are active

- [ ] **Step 8: Commit**

```bash
git add app/\(dashboard\)/dashboard/requests/ components/requests/group-by-dropdown.tsx components/requests/view-mode-toggle.tsx components/requests/board-view.tsx components/requests/save-view-button.tsx
git commit -m "feat: add unified Requests page with contextual kanban and board views"
```

---

## Task 7: Views API

**Files:**
- Create: `app/api/views/route.ts`
- Create: `app/api/views/[id]/pin/route.ts`

- [ ] **Step 1: Create views CRUD API**

```typescript
// app/api/views/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, publishedViews } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const body = await req.json();
  const { name, filters, groupBy, viewMode, pin } = body;

  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const [view] = await db
    .insert(publishedViews)
    .values({
      orgId: profile.orgId,
      createdById: user.id,
      name,
      viewType: "requests",
      filters: filters ?? {},
      groupBy: groupBy ?? null,
      viewMode: viewMode ?? "list",
      pinnedBy: pin ? [user.id] : [],
    })
    .returning();

  return NextResponse.json(view);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const views = await db
    .select()
    .from(publishedViews)
    .where(
      and(
        eq(publishedViews.orgId, profile.orgId),
        eq(publishedViews.isActive, true)
      )
    );

  return NextResponse.json(views);
}
```

- [ ] **Step 2: Create pin/unpin API**

```typescript
// app/api/views/[id]/pin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, publishedViews } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "No profile" }, { status: 401 });

  const [view] = await db
    .select()
    .from(publishedViews)
    .where(eq(publishedViews.id, params.id));
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentPinned = (view.pinnedBy ?? []) as string[];
  const isPinned = currentPinned.includes(user.id);
  const newPinned = isPinned
    ? currentPinned.filter((id) => id !== user.id)
    : [...currentPinned, user.id];

  const [updated] = await db
    .update(publishedViews)
    .set({ pinnedBy: newPinned })
    .where(eq(publishedViews.id, params.id))
    .returning();

  return NextResponse.json({ pinned: !isPinned, view: updated });
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/views/
git commit -m "feat: add views CRUD and pin/unpin API"
```

---

## Task 8: Projects Page

**Files:**
- Create: `app/(dashboard)/dashboard/projects/page.tsx`
- Create: `app/(dashboard)/dashboard/projects/projects-client.tsx`
- Create: `app/actions/projects.ts`

- [ ] **Step 1: Create project server actions**

```typescript
// app/actions/projects.ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, projects, projectMembers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) throw new Error("No profile");

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || null;
  const icon = (formData.get("icon") as string) || null;
  const color = (formData.get("color") as string) || "#71717a";
  const targetDate = (formData.get("targetDate") as string) || null;

  const [project] = await db
    .insert(projects)
    .values({
      orgId: profile.orgId,
      name,
      description,
      icon,
      color,
      targetDate,
      leadId: user.id,
      createdBy: user.id,
    })
    .returning();

  // Add creator as lead member
  await db.insert(projectMembers).values({
    projectId: project.id,
    userId: user.id,
    role: "lead",
  });

  revalidatePath("/dashboard/projects");
  return project;
}

export async function archiveProject(projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  await db
    .update(projects)
    .set({ archivedAt: new Date(), status: "archived" })
    .where(eq(projects.id, projectId));

  revalidatePath("/dashboard/projects");
}
```

- [ ] **Step 2: Create Projects server page**

```typescript
// app/(dashboard)/dashboard/projects/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, projects, requests, projectMembers } from "@/db/schema";
import { eq, and, isNull, sql, count } from "drizzle-orm";
import { ProjectsPageClient } from "./projects-client";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/signup");

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)))
    .orderBy(projects.createdAt);

  // Get request counts per project
  const requestCounts = await db
    .select({
      projectId: requests.projectId,
      total: count(),
    })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .groupBy(requests.projectId);

  const countMap = Object.fromEntries(
    requestCounts
      .filter((rc) => rc.projectId)
      .map((rc) => [rc.projectId!, Number(rc.total)])
  );

  // Get lead names
  const orgMembers = await db
    .select({ id: profiles.id, fullName: profiles.fullName })
    .from(profiles)
    .where(eq(profiles.orgId, profile.orgId));
  const memberMap = Object.fromEntries(
    orgMembers.map((m) => [m.id, m.fullName ?? "Unknown"])
  );

  const projectsWithMeta = activeProjects.map((p) => ({
    ...p,
    requestCount: countMap[p.id] ?? 0,
    leadName: p.leadId ? memberMap[p.leadId] ?? null : null,
    targetDate: p.targetDate,
  }));

  return (
    <ProjectsPageClient
      projects={projectsWithMeta}
      userRole={profile.role ?? "member"}
    />
  );
}
```

- [ ] **Step 3: Create Projects client component**

```typescript
// app/(dashboard)/dashboard/projects/projects-client.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen } from "lucide-react";
import { createProject } from "@/app/actions/projects";
import { EmptyState } from "@/components/ui/empty-state";

interface ProjectWithMeta {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string;
  leadName: string | null;
  targetDate: string | null;
  requestCount: number;
  status: string;
}

interface Props {
  projects: ProjectWithMeta[];
  userRole: string;
}

export function ProjectsPageClient({ projects, userRole }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const canCreate = ["admin", "lead", "pm"].includes(userRole);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          height: 52,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-surface)",
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
          Projects
        </span>
        {canCreate && (
          <button
            onClick={() => setShowForm(!showForm)}
            style={{
              height: 28,
              padding: "0 10px",
              borderRadius: 4,
              fontSize: 11,
              fontFamily: "'Geist Mono', monospace",
              fontWeight: 600,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Plus size={12} style={{ display: "inline", marginRight: 4 }} />
            New Project
          </button>
        )}
      </div>

      {/* New project form */}
      {showForm && (
        <form
          action={async (formData) => {
            await createProject(formData);
            setShowForm(false);
          }}
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-subtle)",
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "end",
          }}
        >
          <div>
            <label style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "'Geist Mono', monospace", display: "block", marginBottom: 4 }}>NAME *</label>
            <input
              name="name"
              required
              placeholder="Project name"
              style={{
                height: 32,
                padding: "0 10px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: "none",
                width: 200,
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "'Geist Mono', monospace", display: "block", marginBottom: 4 }}>COLOR</label>
            <input name="color" type="color" defaultValue="#71717a" style={{ height: 32, width: 40, border: "none", borderRadius: 4, cursor: "pointer" }} />
          </div>
          <div>
            <label style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "'Geist Mono', monospace", display: "block", marginBottom: 4 }}>TARGET DATE</label>
            <input
              name="targetDate"
              type="date"
              style={{
                height: 32,
                padding: "0 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg-surface)",
                fontSize: 12,
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setShowForm(false)}
            style={{
              height: 32,
              padding: "0 14px",
              borderRadius: 4,
              fontSize: 12,
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {/* Projects grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet."
          subtitle="Projects help organize requests by product area."
          cta={canCreate ? { label: "+ Create project", onClick: () => setShowForm(true) } : undefined}
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 12,
            padding: "20px",
          }}
        >
          {projects.map((p) => {
            const isOverTarget =
              p.targetDate && p.targetDate < today;
            const daysOver = isOverTarget
              ? Math.floor(
                  (new Date(today).getTime() - new Date(p.targetDate!).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : 0;

            return (
              <button
                key={p.id}
                onClick={() =>
                  router.push(`/dashboard/requests?project=${p.id}`)
                }
                style={{
                  textAlign: "left",
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "16px",
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                className="hover:bg-[var(--bg-subtle)]"
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: p.color,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 580,
                      color: "var(--text-primary)",
                    }}
                  >
                    {p.icon ? `${p.icon} ` : ""}{p.name}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: 11,
                    fontFamily: "'Geist Mono', monospace",
                    color: "var(--text-tertiary)",
                  }}
                >
                  <span>{p.requestCount} requests</span>
                  {p.leadName && <span>Lead: {p.leadName}</span>}
                </div>
                {p.targetDate && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      fontFamily: "'Geist Mono', monospace",
                      color: isOverTarget ? "#D4A84B" : "var(--text-tertiary)",
                    }}
                  >
                    {isOverTarget
                      ? `Appetite exceeded by ${daysOver} days`
                      : `Target: ${p.targetDate}`}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Verify Projects page**

Run:
```bash
npm run dev
```

Navigate to `http://localhost:3000/dashboard/projects`. Verify project cards show name, color, request count, lead, and target date. "Appetite exceeded" language shows for overdue projects.

- [ ] **Step 5: Commit**

```bash
git add app/\(dashboard\)/dashboard/projects/ app/actions/projects.ts
git commit -m "feat: add Projects page with cards, creation form, and appetite language"
```

---

## Task 9: Route Redirects for Old URLs

**Files:**
- Create: `app/(dashboard)/dashboard/intake/page.tsx` (redirect)
- Create: `app/(dashboard)/dashboard/dev/page.tsx` (redirect)
- Create: `app/(dashboard)/dashboard/journey/page.tsx` (redirect)
- Create: `app/(dashboard)/dashboard/betting/page.tsx` (redirect)

- [ ] **Step 1: Replace old pages with redirects**

Each old page becomes a server redirect to the new Requests page with appropriate query params.

`app/(dashboard)/dashboard/intake/page.tsx`:
```typescript
import { redirect } from "next/navigation";

export default function IntakePage() {
  redirect("/dashboard/requests?phase=predesign&stage=intake");
}
```

`app/(dashboard)/dashboard/dev/page.tsx`:
```typescript
import { redirect } from "next/navigation";

export default function DevBoardPage() {
  redirect("/dashboard/requests?phase=dev&view=kanban");
}
```

`app/(dashboard)/dashboard/journey/page.tsx`:
```typescript
import { redirect } from "next/navigation";

export default function JourneyPage() {
  redirect("/dashboard/requests?group=phase");
}
```

`app/(dashboard)/dashboard/betting/page.tsx`:
```typescript
import { redirect } from "next/navigation";

export default function BettingPage() {
  redirect("/dashboard/requests?phase=predesign&stage=bet");
}
```

- [ ] **Step 2: Move old intake components to archive (don't delete)**

```bash
mkdir -p components/_archive
mv components/intake components/_archive/intake 2>/dev/null || true
```

- [ ] **Step 3: Verify redirects work**

Navigate to `http://localhost:3000/dashboard/dev` — should redirect to `/dashboard/requests?phase=dev&view=kanban`.
Navigate to `http://localhost:3000/dashboard/intake` — should redirect to `/dashboard/requests?phase=predesign&stage=intake`.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/dashboard/intake/page.tsx app/\(dashboard\)/dashboard/dev/page.tsx app/\(dashboard\)/dashboard/journey/page.tsx app/\(dashboard\)/dashboard/betting/page.tsx
git commit -m "feat: redirect old routes to unified Requests page"
```

---

## Task 10: TypeScript Verification & Build Check

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors. If errors, fix import paths and type mismatches.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Build completes successfully.

- [ ] **Step 3: Fix any issues found**

Address type errors and build issues. Common things to check:
- Import paths for moved/new components
- Missing type exports from new schema files
- searchParams typing for new pages

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A
git commit -m "fix: resolve type errors and build issues from nav redesign"
```

---

## Summary

| Task | What it does | Files touched |
|------|-------------|---------------|
| 1 | Projects schema: icon, target_date, members | 3 schema files |
| 2 | Views schema: groupBy, viewMode, pinnedBy | 1 schema file |
| 3 | Sidebar rewrite: 14→9 links + pinned views | 3 files |
| 4 | Hotkeys update | 1 file |
| 5 | Home page with focus ordering | 2 files |
| 6 | Unified Requests page (biggest task) | 6 new files |
| 7 | Views API (save/pin) | 2 API routes |
| 8 | Projects page | 3 files |
| 9 | Old route redirects | 4 files |
| 10 | Type check + build | 0 files (verification) |
