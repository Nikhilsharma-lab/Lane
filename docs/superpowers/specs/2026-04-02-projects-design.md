# Projects — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Projects" concept to DesignQ — orgs can have multiple product lines or initiatives (e.g. Rider App, Driver App, Q2 Redesign). Every request belongs to a project. Dashboard filters to one project or shows all.

**Architecture:** New `projects` DB table + `projectId` FK on `requests`. New settings page `/settings/projects` for CRUD. Project switcher dropdown added to all dashboard headers. Request creation requires a project. Migration script auto-creates a "General" project per org and assigns all existing requests to it.

**Tech Stack:** Next.js 14 App Router, Supabase Auth, Drizzle ORM, Tailwind + shadcn/ui.

---

## What a Project Is

A flexible container — can be a permanent product line ("Rider App") or a time-boxed initiative ("Q2 Redesign"). No type distinction in the data model; the name is the only semantic signal.

---

## Access Model

Any team member (any role) can create, edit, archive, unarchive, and delete projects. No admin restriction. Guard: user must belong to the same org as the project on all actions.

---

## Data Model

### New: `db/schema/projects.ts`

```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profiles, organizations } from "./users";

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#71717a"), // zinc-500 hex
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

### Modified: `db/schema/requests.ts`

Add one column to the `requests` table:

```typescript
projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
```

`projectId` is nullable in the DB to allow backward compatibility with existing rows and to survive `db:push` without blocking. New requests require it at the application layer. The migration script (below) fills existing rows. `onDelete: "set null"` is intentional — if a project is deleted and its requests are moved, the FK is cleared; the delete action always reassigns or explicitly cascade-deletes.

### `db/schema/index.ts`

Add: `export * from "./projects";`

---

## Migration Script

File: `scripts/migrate-projects.mjs`

Runs once after `db:push`. Logic:
1. For each org in `organizations`, insert a "General" project (color `#71717a`, createdBy = first admin of the org)
2. Update all `requests` rows where `projectId IS NULL` to point to their org's "General" project

```javascript
// scripts/migrate-projects.mjs
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, isNull } from "drizzle-orm";
import * as schema from "../db/schema/index.js";

const client = postgres(process.env.DATABASE_URL, { prepare: false });
const db = drizzle(client, { schema });

const orgs = await db.select().from(schema.organizations);

for (const org of orgs) {
  // Find first admin (or any member) to be createdBy
  const [creator] = await db
    .select({ id: schema.profiles.id })
    .from(schema.profiles)
    .where(eq(schema.profiles.orgId, org.id))
    .limit(1);

  if (!creator) continue;

  // Create General project
  const [general] = await db
    .insert(schema.projects)
    .values({
      orgId: org.id,
      name: "General",
      description: "Default project for ungrouped requests.",
      color: "#71717a",
      createdBy: creator.id,
    })
    .returning();

  // Assign all unassigned requests in this org
  await db
    .update(schema.requests)
    .set({ projectId: general.id })
    .where(
      eq(schema.requests.orgId, org.id)
    );
}

await client.end();
console.log("Migration complete.");
```

Run: `node scripts/migrate-projects.mjs`

---

## Routes

```
app/
  (settings)/settings/
    projects/
      page.tsx          ← project list + create/edit/archive/delete
  (dashboard)/dashboard/
    page.tsx            ← gains project switcher in header
    team/page.tsx       ← gains project switcher in header
    insights/page.tsx   ← gains project switcher in header
    ideas/page.tsx      ← gains project switcher in header
    requests/[id]/
      page.tsx          ← shows project badge in header
```

---

## Settings: `/settings/projects`

**Sidebar:** Add "Projects" to `BASE_NAV` in `components/settings/settings-sidebar.tsx` between Members and Plan (visible to all, not admin-gated).

**Page layout — two parts:**

**Part 1: Create new project form (inline at top)**
```
New project
───────────────────────────────────────
Name          [________________________]
Description   [________________________]  (optional)
Color         ● ● ● ● ● ● ● ●            (8 preset swatches)
              [Create project]
```

**Part 2: Active projects list**

Each row:
```
● Project name    Description (truncated)    [Edit] [Archive]
```

Clicking Edit expands the row into an inline edit form (same fields). Clicking Archive triggers a confirmation: "Archive 'Rider App'? It will be hidden from the project switcher. You can unarchive it later." → [Cancel] [Archive]

**Archived projects section** (below active list, hidden by default):
- "Show archived (N)" toggle
- Each row: `● Project name    [Unarchive] [Delete]`

Clicking Delete opens a confirmation dialog:
```
Delete "Rider App"?
───────────────────────────────────────
This project has 12 requests.

○ Move requests to: [dropdown of other active projects]
○ Delete all 12 requests too

[Cancel]   [Delete project]
```
"Delete project" button disabled until one option is selected. If "Move requests to" is chosen, `projectId` on those requests is updated to the target project. If "Delete all requests" is chosen, requests are cascade-deleted. Validation: if only one project exists, block delete entirely — "You can't delete your last project. Create another project first."

**Color swatches (8 presets):**

```typescript
export const PROJECT_COLORS = [
  "#71717a", // zinc
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#22c55e", // green
  "#0ea5e9", // sky
] as const;
```

---

## Dashboard: Project Switcher

All four dashboard pages (`/dashboard`, `/dashboard/team`, `/dashboard/insights`, `/dashboard/ideas`) gain a project switcher dropdown in the header.

**Position:** Between the nav links and the right-side icons:
```
DesignQ · [Requests] [Team] [Insights] [Ideas]    [All projects ▾]    🔔 admin  [Yash]
```

**Component:** `components/projects/project-switcher.tsx` — client component.

**Behaviour:**
- Reads `?project=` URL param using `useSearchParams()`
- Renders a native `<select>` styled to match the dark theme (or a custom dropdown if time allows — use native `<select>` for MVP)
- Options: "All projects" (value `""`) + one entry per active project (colored dot + name)
- On change: calls `router.push(pathname + "?project=" + value)` (clears value if "All projects")
- Selected value persists across navigation within the dashboard

**Data:** Projects are fetched server-side and passed as props to each dashboard page — no client fetch. Each dashboard page queries `db.select().from(projects).where(eq(projects.orgId, profile.orgId))` and filters out archived ones.

**Dashboard request filtering:** `dashboard/page.tsx` reads `searchParams.project`. If set, adds `.where(eq(requests.projectId, searchParams.project))` to the request query. If not set, shows all org requests.

---

## Request Creation: Required Project Field

The new request form gains a required "Project" `<select>` field. Projects are fetched server-side and passed as props.

**In `app/actions/requests.ts` (or wherever `createRequest` lives):** `projectId` is a required field. Server validates:
1. `projectId` is present
2. The project's `orgId` matches the requester's `orgId`

If either check fails, return `{ error: "Invalid project" }`.

---

## Request Detail Page: Project Badge

`/dashboard/requests/[id]/page.tsx` shows a project badge in the header area:

```
● Rider App    [other metadata]
```

`components/projects/project-badge.tsx` — renders a colored dot (using `project.color`) and the project name. Used on the request detail page and request list rows.

---

## Server Actions: `app/actions/projects.ts`

```typescript
createProject(formData: FormData)
  // fields: name (required), description (optional), color (required, must be in PROJECT_COLORS)
  // inserts into projects table
  // revalidatePath("/settings/projects")
  // revalidatePath("/dashboard")

updateProject(projectId: string, formData: FormData)
  // fields: name, description, color
  // guard: project.orgId === profile.orgId
  // revalidatePath("/settings/projects")
  // revalidatePath("/dashboard")

archiveProject(projectId: string)
  // sets archivedAt = now()
  // guard: project.orgId === profile.orgId
  // revalidatePath("/settings/projects")
  // revalidatePath("/dashboard")

unarchiveProject(projectId: string)
  // clears archivedAt
  // guard: project.orgId === profile.orgId
  // revalidatePath("/settings/projects")

deleteProject(projectId: string, action: "move" | "delete", moveToProjectId?: string)
  // guard: project.orgId === profile.orgId
  // guard: at least one other project exists in the org
  // if action === "move": update requests SET projectId = moveToProjectId WHERE projectId = projectId
  // if action === "delete": delete requests WHERE projectId = projectId (cascade via FK)
  // delete project row
  // revalidatePath("/settings/projects")
  // revalidatePath("/dashboard")
```

---

## Components

```
components/
  settings/
    project-list.tsx       ← active + archived project rows, archive/delete/unarchive actions
    project-form.tsx       ← create + inline edit form (name, description, color swatches)
  projects/
    project-switcher.tsx   ← header dropdown (All projects + active project list)
    project-badge.tsx      ← colored dot + project name (used on request rows + detail)
```

---

## What Is NOT in This Spec

- Left sidebar navigation — deferred to UI redesign phase
- Project-level roles or permissions — all members have equal access
- Project analytics / per-project insights — deferred
- Project templates — deferred
- Archiving vs. deleting distinction enforcement — archive is soft, delete is hard, both available to any member
- Idea Board scoped to project — requests are scoped, ideas are org-wide for now
