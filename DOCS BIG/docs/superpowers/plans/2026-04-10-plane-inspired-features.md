# Plane-Inspired Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 15 Plane-inspired features to Lane — intake split-pane, Power K command palette, filter chips, stickies/reflections, cycles, initiatives, team analytics, request timeline, inline commenting, published views, and rich empty states.

**Architecture:** Schema-first approach. Task 1 lays down all new DB tables and schema changes. Tasks 2–6 are independent UI workstreams that can run in parallel via subagents, each owning distinct files with no overlap.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Supabase PostgreSQL, TypeScript, Tailwind CSS, shadcn/ui, cmdk, recharts, lucide-react.

---

## File Map

### New Schema Files
- `db/schema/stickies.ts` — stickies + reflections table
- `db/schema/notification_preferences.ts` — per-user notification settings
- `db/schema/activity_log.ts` — request timeline events
- `db/schema/cycles.ts` — cycles + cycle_requests tables
- `db/schema/initiatives.ts` — initiatives + initiative_requests tables
- `db/schema/iterations.ts` — design iterations + iteration_comments tables
- `db/schema/published_views.ts` — published/shared views

### Modified Schema Files
- `db/schema/requests.ts` — add `snoozedUntil`, `snoozedById` columns
- `db/schema/index.ts` — export new schema modules

### New Components
- `components/ui/empty-state.tsx` — shared empty state component
- `components/ui/filter-chips.tsx` — applied filter chip bar
- `components/ui/snooze-popover.tsx` — snooze date picker popover
- `components/ui/appetite-bar.tsx` — cycle appetite progress bar
- `components/stickies/sticky-pad.tsx` — floating capture FAB
- `components/stickies/sticky-card.tsx` — individual sticky card
- `components/stickies/stickies-panel.tsx` — full stickies grid view
- `components/intake/intake-sidebar.tsx` — triage sidebar list
- `components/intake/intake-detail.tsx` — triage detail panel
- `components/intake/intake-actions.tsx` — accept/decline/snooze/duplicate bar
- `components/cycles/cycle-card.tsx` — cycle list card
- `components/cycles/cycle-detail.tsx` — cycle detail view
- `components/initiatives/initiative-card.tsx` — initiative list card
- `components/initiatives/initiative-detail.tsx` — initiative detail view
- `components/timeline/activity-timeline.tsx` — request activity feed
- `components/timeline/activity-entry.tsx` — single timeline entry
- `components/iterations/iteration-card.tsx` — design iteration card
- `components/iterations/iteration-comments.tsx` — per-iteration comment thread
- `components/published/published-view-page.tsx` — public view renderer
- `components/published/share-dialog.tsx` — share/publish dialog
- `components/analytics/pipeline-chart.tsx` — requests by phase chart
- `components/analytics/flow-rate-chart.tsx` — flow rate line chart
- `components/analytics/intake-health-chart.tsx` — intake metrics
- `components/analytics/cycle-throughput-chart.tsx` — cycle performance
- `components/settings/notification-prefs-form.tsx` — notification toggles

### New Hooks
- `hooks/use-hotkeys.ts` — two-key sequence keyboard shortcuts

### New Routes
- `app/(dashboard)/dashboard/intake/page.tsx` — intake split-pane
- `app/(dashboard)/dashboard/cycles/page.tsx` — cycles list
- `app/(dashboard)/dashboard/cycles/[id]/page.tsx` — cycle detail
- `app/(dashboard)/dashboard/initiatives/page.tsx` — initiatives list
- `app/(dashboard)/dashboard/initiatives/[id]/page.tsx` — initiative detail
- `app/(dashboard)/dashboard/stickies/page.tsx` — stickies panel page
- `app/(settings)/settings/notifications/page.tsx` — notification prefs
- `app/views/[id]/page.tsx` — published view (public route)

### New Server Actions
- `app/actions/stickies.ts` — CRUD for stickies
- `app/actions/cycles.ts` — CRUD for cycles + cycle_requests
- `app/actions/initiatives.ts` — CRUD for initiatives + initiative_requests
- `app/actions/iterations.ts` — CRUD for iterations + iteration_comments
- `app/actions/notification-preferences.ts` — save/load prefs
- `app/actions/published-views.ts` — create/update/delete views
- `app/actions/activity-log.ts` — write activity log entries

### New API Routes
- `app/api/cron/resurface/route.ts` — snooze auto-resurface cron

### Modified Files
- `components/shell/sidebar.tsx` — add Intake, Cycles, Initiatives, Stickies nav items
- `components/ui/command-palette.tsx` — enhance with Power K shortcuts, actions, navigation groups
- `components/requests/request-list.tsx` — integrate filter chips, empty states
- `components/shell/detail-dock.tsx` — add Timeline tab, iteration section
- `app/(dashboard)/dashboard/page.tsx` — add welcome greeting, dashboard polish
- `app/(dashboard)/layout.tsx` — mount `<StickyPad />` and `useHotkeys`
- `components/dashboard/morning-briefing-card.tsx` — add refresh button, timestamp

---

## Task 1: Schema & Migrations (MUST RUN FIRST)

All subsequent tasks depend on these tables existing.

**Files:**
- Create: `db/schema/stickies.ts`
- Create: `db/schema/notification_preferences.ts`
- Create: `db/schema/activity_log.ts`
- Create: `db/schema/cycles.ts`
- Create: `db/schema/initiatives.ts`
- Create: `db/schema/iterations.ts`
- Create: `db/schema/published_views.ts`
- Modify: `db/schema/requests.ts`
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Create `db/schema/stickies.ts`**

```typescript
import { pgTable, uuid, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { organizations } from "./users";
import { requests } from "./requests";

export const stickies = pgTable("stickies", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  requestId: uuid("request_id").references(() => requests.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  color: text("color").notNull().default("cream"),
  isPinned: boolean("is_pinned").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Sticky = typeof stickies.$inferSelect;
export type NewSticky = typeof stickies.$inferInsert;
```

- [ ] **Step 2: Create `db/schema/notification_preferences.ts`**

```typescript
import { pgTable, uuid, boolean, timestamp } from "drizzle-orm/pg-core";
import { profiles } from "./users";

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => profiles.id, { onDelete: "cascade" }),
  nudgesInApp: boolean("nudges_in_app").notNull().default(true),
  nudgesEmail: boolean("nudges_email").notNull().default(false),
  commentsInApp: boolean("comments_in_app").notNull().default(true),
  commentsEmail: boolean("comments_email").notNull().default(true),
  stageChangesInApp: boolean("stage_changes_in_app").notNull().default(true),
  stageChangesEmail: boolean("stage_changes_email").notNull().default(false),
  mentionsInApp: boolean("mentions_in_app").notNull().default(true),
  mentionsEmail: boolean("mentions_email").notNull().default(true),
  weeklyDigestEmail: boolean("weekly_digest_email").notNull().default(true),
  morningBriefingInApp: boolean("morning_briefing_in_app").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;
```

- [ ] **Step 3: Create `db/schema/activity_log.ts`**

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests } from "./requests";

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").references(() => profiles.id),
  action: text("action").notNull(),
  field: text("field"),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type NewActivityLogEntry = typeof activityLog.$inferInsert;
```

- [ ] **Step 4: Create `db/schema/cycles.ts`**

```typescript
import { pgTable, uuid, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./users";
import { profiles } from "./users";
import { projects } from "./projects";
import { requests } from "./requests";

export const cycleStatusEnum = pgEnum("cycle_status", [
  "draft",
  "active",
  "completed",
  "cancelled",
]);

export const cycles = pgTable("cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  status: cycleStatusEnum("status").notNull().default("draft"),
  appetiteWeeks: integer("appetite_weeks").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdById: uuid("created_by_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cycleRequests = pgTable("cycle_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  cycleId: uuid("cycle_id")
    .notNull()
    .references(() => cycles.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  addedById: uuid("added_by_id").references(() => profiles.id),
});

export type Cycle = typeof cycles.$inferSelect;
export type NewCycle = typeof cycles.$inferInsert;
export type CycleRequest = typeof cycleRequests.$inferSelect;
export type NewCycleRequest = typeof cycleRequests.$inferInsert;
```

- [ ] **Step 5: Create `db/schema/initiatives.ts`**

```typescript
import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./users";
import { profiles } from "./users";
import { requests } from "./requests";

export const initiativeStatusEnum = pgEnum("initiative_status", [
  "active",
  "completed",
  "archived",
]);

export const initiatives = pgTable("initiatives", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#2E5339"),
  status: initiativeStatusEnum("status").notNull().default("active"),
  createdById: uuid("created_by_id").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const initiativeRequests = pgTable("initiative_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  initiativeId: uuid("initiative_id")
    .notNull()
    .references(() => initiatives.id, { onDelete: "cascade" }),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Initiative = typeof initiatives.$inferSelect;
export type NewInitiative = typeof initiatives.$inferInsert;
export type InitiativeRequest = typeof initiativeRequests.$inferSelect;
export type NewInitiativeRequest = typeof initiativeRequests.$inferInsert;
```

- [ ] **Step 6: Create `db/schema/iterations.ts`**

```typescript
import { pgTable, uuid, text, timestamp, integer } from "drizzle-orm/pg-core";
import { profiles } from "./users";
import { requests, designStageEnum } from "./requests";

export const iterations = pgTable("iterations", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  title: text("title").notNull(),
  description: text("description"),
  figmaUrl: text("figma_url"),
  stage: designStageEnum("stage").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const iterationComments = pgTable("iteration_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  iterationId: uuid("iteration_id")
    .notNull()
    .references(() => iterations.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => profiles.id),
  parentId: uuid("parent_id"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Iteration = typeof iterations.$inferSelect;
export type NewIteration = typeof iterations.$inferInsert;
export type IterationComment = typeof iterationComments.$inferSelect;
export type NewIterationComment = typeof iterationComments.$inferInsert;
```

- [ ] **Step 7: Create `db/schema/published_views.ts`**

```typescript
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
  assigneeId?: string[];
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
  accessMode: text("access_mode").notNull().default("authenticated"),
  publicToken: text("public_token").unique(),
  allowComments: boolean("allow_comments").notNull().default(false),
  allowVoting: boolean("allow_voting").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PublishedView = typeof publishedViews.$inferSelect;
export type NewPublishedView = typeof publishedViews.$inferInsert;
```

- [ ] **Step 8: Add snooze fields to `db/schema/requests.ts`**

Add these two columns to the `requests` table definition, after the `linkedIdeaId` field:

```typescript
  // Snooze / Defer
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  snoozedById: uuid("snoozed_by_id").references(() => profiles.id),
```

- [ ] **Step 9: Update `db/schema/index.ts` to export all new modules**

Append these lines:

```typescript
export * from "./stickies";
export * from "./notification_preferences";
export * from "./activity_log";
export * from "./cycles";
export * from "./initiatives";
export * from "./iterations";
export * from "./published_views";
```

- [ ] **Step 10: Run schema push and verify**

Run: `npm run db:generate && npm run db:push`

Verify: `npx drizzle-kit studio` opens and shows the new tables.

- [ ] **Step 11: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: No errors related to new schema files.

- [ ] **Step 12: Commit**

```bash
git add db/schema/
git commit -m "feat: add schema for stickies, notification prefs, activity log, cycles, initiatives, iterations, published views, and request snooze fields"
```

---

## Task 2: Command Palette + Filter Chips (Parallel)

**Files:**
- Create: `hooks/use-hotkeys.ts`
- Modify: `components/ui/command-palette.tsx`
- Create: `components/ui/filter-chips.tsx`
- Create: `components/ui/empty-state.tsx`
- Modify: `components/requests/request-list.tsx`
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Create `hooks/use-hotkeys.ts` — two-key sequence handler**

```typescript
"use client";

import { useEffect, useRef, useCallback } from "react";

interface HotkeySequence {
  keys: [string, string]; // e.g., ["g", "r"]
  action: () => void;
  description?: string;
}

export function useHotkeys(sequences: HotkeySequence[]) {
  const firstKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);

  const handler = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      const key = e.key.toLowerCase();

      if (firstKeyRef.current) {
        // Second key of sequence
        const first = firstKeyRef.current;
        firstKeyRef.current = null;
        if (timerRef.current) clearTimeout(timerRef.current);
        pendingRef.current = null;

        const match = sequences.find(
          (s) => s.keys[0] === first && s.keys[1] === key
        );
        if (match) {
          e.preventDefault();
          match.action();
        }
        return;
      }

      // Check if this could be the first key of any sequence
      const isFirstKey = sequences.some((s) => s.keys[0] === key);
      if (isFirstKey) {
        firstKeyRef.current = key;
        pendingRef.current = key;
        timerRef.current = setTimeout(() => {
          firstKeyRef.current = null;
          pendingRef.current = null;
        }, 500);
      }
    },
    [sequences]
  );

  useEffect(() => {
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handler]);

  return { pendingKey: pendingRef };
}
```

- [ ] **Step 2: Enhance `components/ui/command-palette.tsx`**

Replace the entire file. Key changes: add Navigation group with all G-shortcuts, Creation group with N-shortcuts, Actions group when a request context exists, and a "Recent" section.

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useRequests } from "@/context/requests-context";
import {
  Home, Inbox, Kanban, LayoutGrid, Lightbulb, BarChart3,
  Settings, Users, Target, Clock, Layers, Plus, ArrowRight,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Requests", href: "/dashboard", icon: Home, shortcut: "G R" },
  { label: "Intake", href: "/dashboard/intake", icon: Inbox, shortcut: "G I" },
  { label: "Dev Board", href: "/dashboard/dev", icon: Kanban, shortcut: "G D" },
  { label: "Betting Board", href: "/dashboard/betting", icon: LayoutGrid, shortcut: "G B" },
  { label: "Ideas", href: "/dashboard/ideas", icon: Lightbulb, shortcut: "G A" },
  { label: "Cycles", href: "/dashboard/cycles", icon: Clock, shortcut: "G C" },
  { label: "Initiatives", href: "/dashboard/initiatives", icon: Layers, shortcut: "G L" },
  { label: "Insights", href: "/dashboard/insights", icon: BarChart3, shortcut: "G N" },
  { label: "Team", href: "/dashboard/team", icon: Users, shortcut: "G T" },
  { label: "Settings", href: "/settings", icon: Settings, shortcut: "G S" },
];

const CREATE_ITEMS = [
  { label: "New Request", href: "/dashboard?new=1", shortcut: "N R" },
  { label: "New Idea", href: "/dashboard/ideas?new=1", shortcut: "N I" },
  { label: "New Sticky", href: "/dashboard/stickies?new=1", shortcut: "N S" },
];

const PHASE_LABELS: Record<string, string> = {
  predesign: "Predesign", design: "Design", dev: "Dev", track: "Track",
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const requests = useRequests();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");

  useEffect(() => { inputRef.current?.focus(); }, []);

  function navigate(href: string) {
    router.push(href);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--text-primary)]/40 backdrop-blur-sm flex items-start justify-center pt-[18vh]"
      onClick={onClose}
    >
      <div className="w-full max-w-xl mx-4" onClick={(e) => e.stopPropagation()}>
        <Command
          className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden"
          loop
        >
          <Command.Input
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder="Search requests, navigate, create..."
            className="w-full bg-transparent px-4 py-3.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none border-b border-[var(--border)]"
          />

          <Command.List className="max-h-80 overflow-y-auto py-2">
            <Command.Empty className="px-4 py-8 text-sm text-[var(--text-tertiary)] text-center">
              No results
            </Command.Empty>

            {/* Navigation */}
            <Command.Group>
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide px-4 pt-2 pb-1">
                Navigation
              </div>
              {NAV_ITEMS.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`go ${item.label}`}
                  onSelect={() => navigate(item.href)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] cursor-pointer aria-selected:bg-[var(--bg-hover)] rounded-lg mx-2"
                >
                  <item.icon size={14} className="text-[var(--text-tertiary)] shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <kbd className="text-[10px] text-[var(--text-tertiary)] font-mono bg-[var(--bg-subtle)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    {item.shortcut}
                  </kbd>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Create */}
            <Command.Group>
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide px-4 pt-3 pb-1">
                Create
              </div>
              {CREATE_ITEMS.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`create ${item.label}`}
                  onSelect={() => navigate(item.href)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] cursor-pointer aria-selected:bg-[var(--bg-hover)] rounded-lg mx-2"
                >
                  <Plus size={14} className="text-[var(--text-tertiary)] shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  <kbd className="text-[10px] text-[var(--text-tertiary)] font-mono bg-[var(--bg-subtle)] border border-[var(--border)] px-1.5 py-0.5 rounded">
                    {item.shortcut}
                  </kbd>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Requests */}
            {requests.length > 0 && (
              <Command.Group>
                <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide px-4 pt-3 pb-1">
                  Requests
                </div>
                {requests.slice(0, 10).map((r) => (
                  <Command.Item
                    key={r.id}
                    value={r.title}
                    onSelect={() => navigate(`/dashboard/requests/${r.id}`)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] cursor-pointer aria-selected:bg-[var(--bg-hover)] rounded-lg mx-2"
                  >
                    <ArrowRight size={14} className="text-[var(--text-tertiary)] shrink-0" />
                    <span className="flex-1 truncate">{r.title}</span>
                    {r.phase && (
                      <span className="text-[10px] text-[var(--text-tertiary)] shrink-0">
                        {PHASE_LABELS[r.phase] ?? r.phase}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="border-t border-[var(--border)] px-4 py-2 flex items-center gap-3">
            <span className="text-[10px] text-[var(--text-tertiary)]">↑↓ navigate</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">↵ open</span>
            <span className="text-[10px] text-[var(--text-tertiary)]">Esc close</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount `useHotkeys` in dashboard layout**

Read `app/(dashboard)/layout.tsx` and add the hotkeys hook. Create a new client wrapper component if the layout is a server component. The hotkeys to register:

```typescript
const sequences: HotkeySequence[] = [
  { keys: ["g", "r"], action: () => router.push("/dashboard") },
  { keys: ["g", "i"], action: () => router.push("/dashboard/intake") },
  { keys: ["g", "d"], action: () => router.push("/dashboard/dev") },
  { keys: ["g", "b"], action: () => router.push("/dashboard/betting") },
  { keys: ["g", "a"], action: () => router.push("/dashboard/ideas") },
  { keys: ["g", "c"], action: () => router.push("/dashboard/cycles") },
  { keys: ["g", "l"], action: () => router.push("/dashboard/initiatives") },
  { keys: ["g", "n"], action: () => router.push("/dashboard/insights") },
  { keys: ["g", "t"], action: () => router.push("/dashboard/team") },
  { keys: ["g", "s"], action: () => router.push("/settings") },
  { keys: ["n", "r"], action: () => router.push("/dashboard?new=1") },
  { keys: ["n", "i"], action: () => router.push("/dashboard/ideas?new=1") },
  { keys: ["n", "s"], action: () => router.push("/dashboard/stickies?new=1") },
];
```

Wrap in a `"use client"` component `components/shell/hotkeys-provider.tsx` that calls `useHotkeys(sequences)` and renders `{children}`.

- [ ] **Step 4: Create `components/ui/filter-chips.tsx`**

```typescript
"use client";

import { X } from "lucide-react";

export interface FilterChip {
  key: string;      // URL param key, e.g., "phase"
  label: string;    // Display label, e.g., "Phase"
  value: string;    // Display value, e.g., "Design"
  rawValue: string; // URL param value, e.g., "design"
}

interface FilterChipsProps {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}

export function FilterChips({ chips, onRemove, onClearAll }: FilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.rawValue}`}
          onClick={() => onRemove(chip.key)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors hover:bg-[var(--bg-hover)]"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <span style={{ fontWeight: 500, color: "var(--text-tertiary)" }}>{chip.label}:</span>
          <span style={{ fontWeight: 560 }}>{chip.value}</span>
          <X size={10} className="ml-0.5 opacity-50" />
        </button>
      ))}
      {chips.length >= 2 && (
        <button
          onClick={onClearAll}
          className="text-xs px-2 py-1 rounded transition-colors hover:bg-[var(--bg-hover)]"
          style={{
            color: "var(--text-tertiary)",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `components/ui/empty-state.tsx`**

```typescript
import type { ComponentType } from "react";
import Link from "next/link";

interface EmptyStateProps {
  icon?: ComponentType<{ size?: number }>;
  title: string;
  subtitle?: string;
  cta?: { label: string; href?: string; onClick?: () => void };
}

export function EmptyState({ icon: Icon, title, subtitle, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {Icon && (
        <div className="mb-4 opacity-30">
          <Icon size={40} />
        </div>
      )}
      <p
        style={{
          fontSize: 14,
          fontWeight: 560,
          color: "var(--text-primary)",
          textAlign: "center",
        }}
      >
        {title}
      </p>
      {subtitle && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            textAlign: "center",
            marginTop: 6,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      )}
      {cta && (
        <div className="mt-4">
          {cta.href ? (
            <Link
              href={cta.href}
              style={{
                fontSize: 13,
                color: "var(--accent)",
                fontWeight: 520,
                textDecoration: "none",
              }}
            >
              {cta.label} →
            </Link>
          ) : (
            <button
              onClick={cta.onClick}
              style={{
                fontSize: 13,
                color: "var(--accent)",
                fontWeight: 520,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              {cta.label} →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Integrate filter chips into `components/requests/request-list.tsx`**

Import `FilterChips` and add it below the phase tabs. Read current URL search params for `phase`, `priority`, `stage`, `project`, `assignee`. Build `FilterChip[]` from active params. `onRemove` removes the param and pushes new URL. `onClearAll` clears all filter params.

- [ ] **Step 7: Add empty states to request list**

When the filtered request list is empty, render `<EmptyState>` instead of the table. Use role-aware copy:
- Designer: `title="You're clear." subtitle="Time to think, learn, or help a teammate."`
- PM: `title="All clear." subtitle="Good time to review your impact data." cta={{ label: "View Impact", href: "/dashboard/insights/impact" }}`
- Default: `title="No requests match your filters." cta={{ label: "Clear filters", onClick: clearAll }}`

- [ ] **Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add hooks/use-hotkeys.ts components/ui/command-palette.tsx components/ui/filter-chips.tsx components/ui/empty-state.tsx components/requests/request-list.tsx components/shell/hotkeys-provider.tsx
git commit -m "feat: add Power K command palette, filter chips, empty states, and keyboard shortcuts"
```

---

## Task 3: Intake Split-Pane + Snooze (Parallel)

**Files:**
- Create: `app/(dashboard)/dashboard/intake/page.tsx`
- Create: `components/intake/intake-sidebar.tsx`
- Create: `components/intake/intake-detail.tsx`
- Create: `components/intake/intake-actions.tsx`
- Create: `components/ui/snooze-popover.tsx`
- Create: `app/api/cron/resurface/route.ts`
- Modify: `components/shell/sidebar.tsx`

- [ ] **Step 1: Create `components/ui/snooze-popover.tsx`**

```typescript
"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { addDays, addWeeks, format } from "date-fns";

interface SnoozePopoverProps {
  onSnooze: (until: Date) => void;
  label?: string;
}

export function SnoozePopover({ onSnooze, label = "Snooze" }: SnoozePopoverProps) {
  const [open, setOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");

  const presets = [
    { label: "Tomorrow", date: addDays(new Date(), 1) },
    { label: "Next week", date: addWeeks(new Date(), 1) },
    { label: "In 2 weeks", date: addWeeks(new Date(), 2) },
  ];

  function handleSnooze(date: Date) {
    onSnooze(date);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors hover:bg-[var(--bg-hover)]"
        style={{
          background: "var(--bg-subtle)",
          border: "1px solid var(--border)",
          color: "var(--text-secondary)",
          cursor: "pointer",
          fontWeight: 520,
        }}
      >
        <Clock size={12} />
        {label}
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 rounded-lg shadow-lg py-1"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            minWidth: 180,
          }}
        >
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => handleSnooze(p.date)}
              className="w-full text-left px-3 py-2 text-xs transition-colors hover:bg-[var(--bg-hover)]"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}
            >
              {p.label}
              <span className="ml-2 text-[var(--text-tertiary)]">{format(p.date, "MMM d")}</span>
            </button>
          ))}
          <div className="border-t border-[var(--border)] px-3 py-2">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full text-xs rounded px-2 py-1"
              style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              min={format(addDays(new Date(), 1), "yyyy-MM-dd")}
            />
            {customDate && (
              <button
                onClick={() => handleSnooze(new Date(customDate))}
                className="w-full mt-1 text-xs px-2 py-1 rounded transition-colors"
                style={{ background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 520 }}
              >
                Snooze until {format(new Date(customDate), "MMM d")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/intake/intake-actions.tsx`**

Action bar with Accept, Decline, Snooze, Mark Duplicate buttons. Accept calls a server action to advance request to `context` stage. Decline archives. Snooze sets `snoozedUntil` on the request. Mark Duplicate opens a search to link to existing request.

```typescript
"use client";

import { useState } from "react";
import { Check, X, Link2 } from "lucide-react";
import { SnoozePopover } from "@/components/ui/snooze-popover";
import { advanceToContext, declineRequest, snoozeRequest } from "@/app/actions/requests";

interface IntakeActionsProps {
  requestId: string;
}

export function IntakeActions({ requestId }: IntakeActionsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  async function handleAccept() {
    setLoading("accept");
    await advanceToContext(requestId);
    setLoading(null);
  }

  async function handleDecline() {
    if (!declineReason.trim()) return;
    setLoading("decline");
    await declineRequest(requestId, declineReason);
    setLoading(null);
    setShowDecline(false);
  }

  async function handleSnooze(until: Date) {
    setLoading("snooze");
    await snoozeRequest(requestId, until.toISOString());
    setLoading(null);
  }

  return (
    <div className="flex items-center gap-2 py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <button
        onClick={handleAccept}
        disabled={loading === "accept"}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors"
        style={{ background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontWeight: 560 }}
      >
        <Check size={12} />
        {loading === "accept" ? "Accepting..." : "Accept"}
      </button>

      {!showDecline ? (
        <button
          onClick={() => setShowDecline(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors hover:bg-red-50"
          style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer", fontWeight: 520 }}
        >
          <X size={12} />
          Decline
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            placeholder="Reason..."
            className="text-xs px-2 py-1.5 rounded"
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-primary)", width: 160 }}
          />
          <button
            onClick={handleDecline}
            disabled={!declineReason.trim() || loading === "decline"}
            className="text-xs px-2 py-1.5 rounded"
            style={{ background: "#DC2626", color: "#fff", border: "none", cursor: "pointer", fontWeight: 520, opacity: declineReason.trim() ? 1 : 0.5 }}
          >
            Confirm
          </button>
          <button
            onClick={() => setShowDecline(false)}
            className="text-xs px-1.5 py-1.5"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)" }}
          >
            Cancel
          </button>
        </div>
      )}

      <SnoozePopover onSnooze={handleSnooze} />

      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors hover:bg-[var(--bg-hover)]"
        style={{ background: "var(--bg-subtle)", border: "1px solid var(--border)", color: "var(--text-secondary)", cursor: "pointer", fontWeight: 520 }}
      >
        <Link2 size={12} />
        Duplicate
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `components/intake/intake-sidebar.tsx`**

Sidebar list showing intake requests. Props: `requests`, `activeId`, `onSelect`. Each row shows title, priority badge, requester, time ago. Active row highlighted. J/K keyboard nav via `useKeyboardNav` hook (already exists in codebase).

- [ ] **Step 4: Create `components/intake/intake-detail.tsx`**

Detail panel showing full request info, AI triage section, and `<IntakeActions>` bar at the bottom. Reuses existing AI triage display pattern from `detail-dock.tsx`. Shows description, business context, success metrics, and the AI analysis if it exists.

- [ ] **Step 5: Create `app/(dashboard)/dashboard/intake/page.tsx`**

Server component that:
1. Fetches all requests where `phase = 'predesign'` and `predesignStage = 'intake'` and `snoozedUntil IS NULL`
2. Fetches AI analysis for each
3. Renders 2-column layout: `<IntakeSidebar>` (w-1/3) + `<IntakeDetail>` (w-2/3)
4. If no requests, render `<EmptyState title="No requests waiting." subtitle="The intake is clear." />`

- [ ] **Step 6: Add server actions for intake operations**

Add to `app/actions/requests.ts`:
- `advanceToContext(requestId)` — sets `predesignStage = 'context'`, logs to activity_log
- `declineRequest(requestId, reason)` — sets `status = 'blocked'`, adds system comment with reason, logs to activity_log
- `snoozeRequest(requestId, untilIso)` — sets `snoozedUntil` and `snoozedById`, logs to activity_log

- [ ] **Step 7: Create `app/api/cron/resurface/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { db } from "@/db";
import { requests } from "@/db/schema";
import { lt, isNotNull, and } from "drizzle-orm";

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const snoozed = await db
    .select()
    .from(requests)
    .where(and(isNotNull(requests.snoozedUntil), lt(requests.snoozedUntil, now)));

  for (const r of snoozed) {
    await db
      .update(requests)
      .set({ snoozedUntil: null, snoozedById: null, updatedAt: now })
      .where(and(lt(requests.snoozedUntil, now), isNotNull(requests.snoozedUntil)));
  }

  return NextResponse.json({ resurfaced: snoozed.length });
}
```

- [ ] **Step 8: Add "Intake" nav item to sidebar**

In `components/shell/sidebar.tsx`, add under the Workspace section:

```typescript
<NavItemLink href="/dashboard/intake" icon={Inbox} label="Intake" />
```

- [ ] **Step 9: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add components/intake/ components/ui/snooze-popover.tsx app/actions/requests.ts "app/(dashboard)/dashboard/intake/" app/api/cron/resurface/ components/shell/sidebar.tsx
git commit -m "feat: add intake split-pane UI with triage actions, snooze, and auto-resurface cron"
```

---

## Task 4: Stickies + Notification Preferences (Parallel)

**Files:**
- Create: `app/actions/stickies.ts`
- Create: `app/actions/notification-preferences.ts`
- Create: `components/stickies/sticky-card.tsx`
- Create: `components/stickies/sticky-pad.tsx`
- Create: `components/stickies/stickies-panel.tsx`
- Create: `app/(dashboard)/dashboard/stickies/page.tsx`
- Create: `components/settings/notification-prefs-form.tsx`
- Create: `app/(settings)/settings/notifications/page.tsx`
- Modify: `components/shell/sidebar.tsx` (add Stickies nav)

- [ ] **Step 1: Create `app/actions/stickies.ts`**

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { stickies, profiles } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

async function getAuthedProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  return profile ?? null;
}

export async function createSticky(data: {
  content: string;
  color?: string;
  requestId?: string | null;
}) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  await db.insert(stickies).values({
    orgId: profile.orgId,
    authorId: profile.id,
    content: data.content,
    color: data.color ?? "cream",
    requestId: data.requestId ?? null,
  });

  revalidatePath("/dashboard/stickies");
  return { success: true };
}

export async function updateSticky(
  stickyId: string,
  data: { content?: string; color?: string; isPinned?: boolean; requestId?: string | null }
) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  await db
    .update(stickies)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(stickies.id, stickyId), eq(stickies.authorId, profile.id)));

  revalidatePath("/dashboard/stickies");
  return { success: true };
}

export async function archiveSticky(stickyId: string) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  await db
    .update(stickies)
    .set({ archivedAt: new Date() })
    .where(and(eq(stickies.id, stickyId), eq(stickies.authorId, profile.id)));

  revalidatePath("/dashboard/stickies");
  return { success: true };
}

export async function getMyStickies() {
  const profile = await getAuthedProfile();
  if (!profile) return [];

  return db
    .select()
    .from(stickies)
    .where(and(eq(stickies.authorId, profile.id), isNull(stickies.archivedAt)))
    .orderBy(stickies.isPinned, stickies.createdAt);
}
```

- [ ] **Step 2: Create `app/actions/notification-preferences.ts`**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { notificationPreferences, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getNotificationPreferences() {
  const userId = await getAuthedUserId();
  if (!userId) return null;

  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  return prefs ?? null;
}

export async function saveNotificationPreferences(data: {
  nudgesInApp?: boolean;
  nudgesEmail?: boolean;
  commentsInApp?: boolean;
  commentsEmail?: boolean;
  stageChangesInApp?: boolean;
  stageChangesEmail?: boolean;
  mentionsInApp?: boolean;
  mentionsEmail?: boolean;
  weeklyDigestEmail?: boolean;
  morningBriefingInApp?: boolean;
}) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));

  if (existing) {
    await db
      .update(notificationPreferences)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      ...data,
    });
  }

  return { success: true };
}
```

- [ ] **Step 3: Create `components/stickies/sticky-card.tsx`**

Individual sticky card with editable content, color indicator, pin toggle, archive button, and optional request link badge. Colors map to Tailwind-compatible background values.

- [ ] **Step 4: Create `components/stickies/sticky-pad.tsx`**

Floating action button (bottom-right, `position: fixed`). Clicking opens a small capture card overlay with: textarea, color picker (5 dots), optional "Link to request" combobox, Save/Discard buttons. Uses `createSticky` server action on save.

- [ ] **Step 5: Create `components/stickies/stickies-panel.tsx`**

Grid layout of `<StickyCard>` components. Filter tabs: All | Pinned | Linked (reflections). Empty state when no stickies: `<EmptyState title="A place for fleeting thoughts." subtitle="Press N then S to start." />`

- [ ] **Step 6: Create `app/(dashboard)/dashboard/stickies/page.tsx`**

Server component that calls `getMyStickies()` and renders `<StickiesPanel>`.

- [ ] **Step 7: Create `components/settings/notification-prefs-form.tsx`**

Client component with a grid of toggle switches:

```
Category          In-App    Email
AI Nudges         [toggle]  [toggle]
Comments          [toggle]  [toggle]
Stage Changes     [toggle]  [toggle]
Mentions          [toggle]  [toggle]
Weekly Digest     —         [toggle]
Morning Briefing  [toggle]  —
```

Each toggle calls `saveNotificationPreferences` with the changed field. Optimistic UI — toggle updates locally immediately, server action fires in background. "Reset to defaults" button.

- [ ] **Step 8: Create `app/(settings)/settings/notifications/page.tsx`**

Server component that calls `getNotificationPreferences()` and renders `<NotificationPrefsForm>` with initial values.

- [ ] **Step 9: Add Stickies nav item to sidebar**

In `components/shell/sidebar.tsx`, add under Personal section:

```typescript
<NavItemLink href="/dashboard/stickies" icon={FileText} label="Stickies" />
```

- [ ] **Step 10: Mount `<StickyPad />` in dashboard layout**

Add `<StickyPad />` to `app/(dashboard)/layout.tsx` so it appears on every dashboard page.

- [ ] **Step 11: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add app/actions/stickies.ts app/actions/notification-preferences.ts components/stickies/ "app/(dashboard)/dashboard/stickies/" components/settings/notification-prefs-form.tsx "app/(settings)/settings/notifications/" components/shell/sidebar.tsx
git commit -m "feat: add stickies/reflections system and notification preferences"
```

---

## Task 5: Cycles + Initiatives + Analytics (Parallel)

**Files:**
- Create: `app/actions/cycles.ts`
- Create: `app/actions/initiatives.ts`
- Create: `components/ui/appetite-bar.tsx`
- Create: `components/cycles/cycle-card.tsx`
- Create: `components/cycles/cycle-detail.tsx`
- Create: `components/initiatives/initiative-card.tsx`
- Create: `components/initiatives/initiative-detail.tsx`
- Create: `components/analytics/pipeline-chart.tsx`
- Create: `components/analytics/flow-rate-chart.tsx`
- Create: `components/analytics/intake-health-chart.tsx`
- Create: `components/analytics/cycle-throughput-chart.tsx`
- Create: `app/(dashboard)/dashboard/cycles/page.tsx`
- Create: `app/(dashboard)/dashboard/cycles/[id]/page.tsx`
- Create: `app/(dashboard)/dashboard/initiatives/page.tsx`
- Create: `app/(dashboard)/dashboard/initiatives/[id]/page.tsx`
- Modify: `app/(dashboard)/dashboard/insights/page.tsx` (or equivalent)
- Modify: `components/shell/sidebar.tsx`

- [ ] **Step 1: Create `app/actions/cycles.ts`**

CRUD server actions for cycles and cycle_requests:
- `createCycle({ orgId, projectId, name, appetiteWeeks, startsAt })` — validates only one active cycle per project
- `updateCycle(cycleId, data)` — update name, status, dates
- `activateCycle(cycleId)` — sets status to "active", validates no other active cycle for that project
- `completeCycle(cycleId)` — sets status to "completed"
- `addRequestToCycle(cycleId, requestId)` — inserts into cycle_requests
- `removeRequestFromCycle(cycleId, requestId)` — deletes from cycle_requests
- `transferIncomplete(fromCycleId, toCycleId)` — moves un-completed requests to new cycle

- [ ] **Step 2: Create `app/actions/initiatives.ts`**

CRUD server actions for initiatives and initiative_requests:
- `createInitiative({ orgId, name, description, color })` — creates initiative
- `updateInitiative(initiativeId, data)` — update name, description, color, status
- `addRequestToInitiative(initiativeId, requestId)` — inserts into initiative_requests
- `removeRequestFromInitiative(initiativeId, requestId)` — deletes from initiative_requests

- [ ] **Step 3: Create `components/ui/appetite-bar.tsx`**

```typescript
interface AppetiteBarProps {
  appetiteWeeks: number;
  startsAt: string | Date;
  endsAt: string | Date;
  completedCount: number;
  totalCount: number;
}

export function AppetiteBar({ appetiteWeeks, startsAt, endsAt, completedCount, totalCount }: AppetiteBarProps) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(1, (now - start) / (end - start)));
  const weeksElapsed = Math.round(elapsed * appetiteWeeks * 10) / 10;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 520 }}>
          {weeksElapsed} of {appetiteWeeks} weeks elapsed
        </span>
        <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 520 }}>
          {completedCount} of {totalCount} requests completed
        </span>
      </div>
      <div style={{ width: "100%", height: 6, background: "var(--bg-hover)", borderRadius: 3, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${elapsed * 100}%`,
            borderRadius: 3,
            background: elapsed > 0.9 ? "#E07070" : elapsed > 0.7 ? "#D4A84B" : "var(--accent)",
            transition: "width 300ms ease",
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `components/cycles/cycle-card.tsx`**

Card component for cycle list: name, status badge (draft/active/completed/cancelled), project name, appetite weeks, date range, request count, and a mini appetite bar. Click navigates to `/dashboard/cycles/[id]`.

- [ ] **Step 5: Create `components/cycles/cycle-detail.tsx`**

Detail view: header with cycle name + status + edit button, `<AppetiteBar>`, request list (reuse existing `<RequestList>` pattern with cycle filter), aggregate stats (requests by phase, throughput). "Transfer incomplete" button when cycle status is "completed". NO per-designer breakdown.

- [ ] **Step 6: Create cycle route pages**

`app/(dashboard)/dashboard/cycles/page.tsx` — server component, fetches all cycles for the org grouped by project, renders `<CycleCard>` grid. Create button. Empty state: "No cycles yet. Create your first cycle to start tracking appetite."

`app/(dashboard)/dashboard/cycles/[id]/page.tsx` — server component, fetches cycle + its requests + aggregate stats, renders `<CycleDetail>`.

- [ ] **Step 7: Create `components/initiatives/initiative-card.tsx`**

Card: name, color dot, description snippet, request count, status badge. Click navigates to `/dashboard/initiatives/[id]`.

- [ ] **Step 8: Create `components/initiatives/initiative-detail.tsx`**

Detail view: header with name + color + description + status, request list filtered to initiative, "Add request" button (search combobox to add), remove button per request.

- [ ] **Step 9: Create initiative route pages**

`app/(dashboard)/dashboard/initiatives/page.tsx` — server component, fetches all active initiatives for the org, renders card grid. Create button. Empty state: "No initiatives yet. Group related requests across projects."

`app/(dashboard)/dashboard/initiatives/[id]/page.tsx` — server component, fetches initiative + its requests, renders detail.

- [ ] **Step 10: Create analytics chart components**

`components/analytics/pipeline-chart.tsx` — horizontal bar chart using recharts. Shows request count by phase (predesign | design | dev | track). Color-coded per phase using existing `STAGE_COLORS` pattern.

`components/analytics/flow-rate-chart.tsx` — line chart showing requests entering vs exiting each phase per week. Two lines per phase.

`components/analytics/intake-health-chart.tsx` — shows acceptance rate (% of intake requests accepted), avg triage time, quality score distribution (histogram).

`components/analytics/cycle-throughput-chart.tsx` — bar chart of requests completed per cycle. Shows aggregate throughput, never per-designer.

- [ ] **Step 11: Enhance insights page**

Modify the existing insights page to add new chart sections: Pipeline View, Flow Rate, Intake Health, Cycle Throughput. Each section has a heading + the chart component. Data is fetched server-side via aggregate queries.

- [ ] **Step 12: Add Cycles and Initiatives nav items to sidebar**

In `components/shell/sidebar.tsx`, add under Workspace section:

```typescript
<NavItemLink href="/dashboard/cycles" icon={Clock} label="Cycles" />
<NavItemLink href="/dashboard/initiatives" icon={Layers} label="Initiatives" />
```

Import `Clock` and `Layers` from `lucide-react`.

- [ ] **Step 13: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add app/actions/cycles.ts app/actions/initiatives.ts components/ui/appetite-bar.tsx components/cycles/ components/initiatives/ components/analytics/ "app/(dashboard)/dashboard/cycles/" "app/(dashboard)/dashboard/initiatives/" components/shell/sidebar.tsx
git commit -m "feat: add cycles, initiatives, and team-level analytics"
```

---

## Task 6: Timeline + Inline Comments + Published Views (Parallel)

**Files:**
- Create: `app/actions/activity-log.ts`
- Create: `app/actions/iterations.ts`
- Create: `app/actions/published-views.ts`
- Create: `components/timeline/activity-timeline.tsx`
- Create: `components/timeline/activity-entry.tsx`
- Create: `components/iterations/iteration-card.tsx`
- Create: `components/iterations/iteration-comments.tsx`
- Create: `components/published/published-view-page.tsx`
- Create: `components/published/share-dialog.tsx`
- Create: `app/views/[id]/page.tsx`
- Modify: `components/shell/detail-dock.tsx`
- Modify: `components/requests/design-phase-panel.tsx`

- [ ] **Step 1: Create `app/actions/activity-log.ts`**

```typescript
"use server";

import { db } from "@/db";
import { activityLog } from "@/db/schema";

export async function logActivity(data: {
  requestId: string;
  actorId: string | null;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(activityLog).values({
    requestId: data.requestId,
    actorId: data.actorId,
    action: data.action,
    field: data.field ?? null,
    oldValue: data.oldValue ?? null,
    newValue: data.newValue ?? null,
    metadata: data.metadata ?? {},
  });
}

export async function getActivityLog(requestId: string) {
  return db
    .select()
    .from(activityLog)
    .where(eq(activityLog.requestId, requestId))
    .orderBy(activityLog.createdAt);
}
```

Add `import { eq } from "drizzle-orm";` at the top.

- [ ] **Step 2: Create `app/actions/iterations.ts`**

CRUD server actions:
- `createIteration({ requestId, title, description, figmaUrl, stage })` — inserts iteration
- `updateIteration(iterationId, data)` — update title, description, figmaUrl
- `deleteIteration(iterationId)` — deletes iteration
- `addIterationComment({ iterationId, body, parentId? })` — inserts comment
- `getIterationsForRequest(requestId)` — returns iterations with comment counts
- `getIterationComments(iterationId)` — returns threaded comments

- [ ] **Step 3: Create `app/actions/published-views.ts`**

```typescript
"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { publishedViews, profiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { ViewFilters } from "@/db/schema/published_views";

async function getAuthedProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  return profile ?? null;
}

export async function createPublishedView(data: {
  name: string;
  description?: string;
  viewType: string;
  filters: ViewFilters;
  accessMode: "authenticated" | "public";
  allowComments?: boolean;
}) {
  const profile = await getAuthedProfile();
  if (!profile) return { error: "Not authenticated" };

  const publicToken = data.accessMode === "public" ? randomUUID() : null;

  const [view] = await db
    .insert(publishedViews)
    .values({
      orgId: profile.orgId,
      createdById: profile.id,
      name: data.name,
      description: data.description,
      viewType: data.viewType,
      filters: data.filters,
      accessMode: data.accessMode,
      publicToken,
      allowComments: data.allowComments ?? false,
    })
    .returning();

  revalidatePath("/dashboard");
  return { success: true, viewId: view.id, publicToken };
}

export async function getPublishedView(viewId: string, token?: string) {
  const [view] = await db
    .select()
    .from(publishedViews)
    .where(and(eq(publishedViews.id, viewId), eq(publishedViews.isActive, true)));

  if (!view) return null;

  if (view.accessMode === "public" && view.publicToken !== token) {
    return null;
  }

  return view;
}
```

- [ ] **Step 4: Create `components/timeline/activity-entry.tsx`**

```typescript
import { formatDistanceToNow } from "date-fns";
import type { ActivityLogEntry } from "@/db/schema";

const ACTION_LABELS: Record<string, string> = {
  stage_changed: "moved to",
  comment_added: "commented",
  assigned: "assigned",
  figma_updated: "updated Figma file",
  ai_triage: "AI triage completed",
  created: "created this request",
  snoozed: "snoozed",
  resurfaced: "resurfaced from snooze",
  cycle_added: "added to cycle",
  initiative_added: "added to initiative",
};

interface ActivityEntryProps {
  entry: ActivityLogEntry;
  actorName: string | null;
}

export function ActivityEntry({ entry, actorName }: ActivityEntryProps) {
  const actionLabel = ACTION_LABELS[entry.action] ?? entry.action;
  const actor = actorName ?? "System";
  const timeAgo = formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true });

  return (
    <div className="flex items-start gap-3 py-2">
      <div
        className="shrink-0 mt-0.5 rounded-full"
        style={{
          width: 6,
          height: 6,
          background: entry.actorId ? "var(--accent)" : "var(--text-tertiary)",
        }}
      />
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          <span style={{ fontWeight: 560, color: "var(--text-primary)" }}>{actor}</span>
          {" "}{actionLabel}
          {entry.newValue && (
            <span style={{ fontWeight: 520 }}>{" "}{entry.newValue}</span>
          )}
        </p>
        <p style={{ fontSize: 10, color: "var(--text-tertiary)", fontFamily: "'Geist Mono', monospace", marginTop: 2 }}>
          {timeAgo}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `components/timeline/activity-timeline.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import type { ActivityLogEntry } from "@/db/schema";
import { ActivityEntry } from "./activity-entry";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

interface ActivityTimelineProps {
  requestId: string;
}

export function ActivityTimeline({ requestId }: ActivityTimelineProps) {
  const [entries, setEntries] = useState<(ActivityLogEntry & { actorName: string | null })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/requests/${requestId}/activity`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [requestId]);

  if (loading) {
    return <p style={{ fontSize: 12, color: "var(--text-tertiary)", padding: 16 }}>Loading timeline...</p>;
  }

  if (entries.length === 0) {
    return <EmptyState icon={Activity} title="No activity yet." subtitle="Events will appear here as this request progresses." />;
  }

  return (
    <div className="flex flex-col">
      {entries.map((entry) => (
        <ActivityEntry key={entry.id} entry={entry} actorName={entry.actorName} />
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Create API route for activity log**

Create `app/api/requests/[id]/activity/route.ts`:
- Joins `activity_log` with `profiles` to get actor names
- Returns `{ entries: (ActivityLogEntry & { actorName })[] }`
- Auth check: user must be in same org as request

- [ ] **Step 7: Add Timeline tab to detail dock**

In `components/shell/detail-dock.tsx`, add a tab system below the header. Two tabs: "Details" (current content) and "Timeline" (`<ActivityTimeline requestId={request.id} />`). Use a simple `useState<"details" | "timeline">` tab switcher.

- [ ] **Step 8: Create `components/iterations/iteration-card.tsx`**

Card component for a design iteration: title, Figma link button, description, comment count badge. Edit/delete actions for the author. "Add comment" collapsible section.

- [ ] **Step 9: Create `components/iterations/iteration-comments.tsx`**

Threaded comment list for an iteration. Top-level comments with one level of replies. Each comment: author name, body, timestamp, "Reply" button. New comment form at bottom. Uses `addIterationComment` server action.

- [ ] **Step 10: Integrate iterations into design phase panel**

Modify `components/requests/design-phase-panel.tsx`:
- When stage is "diverge" or "converge", show an "Iterations" section
- "Add Direction" button → form with title, description, figmaUrl
- List of `<IterationCard>` components with inline `<IterationComments>`
- Empty state for diverge: "Start exploring directions. There's no wrong answer yet."
- Empty state for converge: "Narrow down your directions. Log what you chose and why."

- [ ] **Step 11: Create `components/published/share-dialog.tsx`**

Dialog component for publishing a view:
- Name input
- View type selector (auto-detected from current page)
- Access mode toggle: "Authenticated only" / "Anyone with link"
- Allow comments toggle
- "Publish" button → calls `createPublishedView`
- After publish: shows the generated URL with copy button

- [ ] **Step 12: Create `components/published/published-view-page.tsx`**

Read-only view renderer. Receives a `PublishedView` and renders the filtered request list in a clean, branded layout. NO assignee names in public mode. Shows org name + Lane branding. If `allowComments` is true, show a simple comment sidebar.

- [ ] **Step 13: Create `app/views/[id]/page.tsx`**

Public route (outside dashboard layout):

```typescript
import { db } from "@/db";
import { publishedViews, requests } from "@/db/schema";
import type { ViewFilters } from "@/db/schema/published_views";
import { eq, and } from "drizzle-orm";
import { PublishedViewPage } from "@/components/published/published-view-page";
import { notFound } from "next/navigation";

export default async function ViewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { token?: string };
}) {
  const [view] = await db
    .select()
    .from(publishedViews)
    .where(and(eq(publishedViews.id, params.id), eq(publishedViews.isActive, true)));

  if (!view) notFound();

  // Public access check
  if (view.accessMode === "public" && view.publicToken !== searchParams.token) {
    notFound();
  }

  // Authenticated access check
  if (view.accessMode === "authenticated") {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const { redirect } = await import("next/navigation");
      redirect("/login");
    }
  }

  // Fetch requests for this org, then apply view filters client-side
  // (filters are simple enough that JS filtering is fine for MVP)
  let filteredRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, view.orgId));

  const f = view.filters as ViewFilters;
  if (f.phase?.length) filteredRequests = filteredRequests.filter(r => r.phase && f.phase!.includes(r.phase));
  if (f.priority?.length) filteredRequests = filteredRequests.filter(r => r.priority && f.priority!.includes(r.priority));
  if (f.projectId?.length) filteredRequests = filteredRequests.filter(r => r.projectId && f.projectId!.includes(r.projectId));

  return (
    <PublishedViewPage
      view={view}
      requests={filteredRequests}
      isPublic={view.accessMode === "public"}
    />
  );
}
```

- [ ] **Step 14: Verify and commit**

Run: `npx tsc --noEmit`

```bash
git add app/actions/activity-log.ts app/actions/iterations.ts app/actions/published-views.ts components/timeline/ components/iterations/ components/published/ "app/views/" app/api/requests/ components/shell/detail-dock.tsx components/requests/design-phase-panel.tsx
git commit -m "feat: add request timeline, per-iteration commenting, and published views"
```

---

## Task 7: Dashboard Polish + Sidebar Updates (After Tasks 2-6)

Final integration pass once all features are merged.

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `components/dashboard/morning-briefing-card.tsx`

- [ ] **Step 1: Add welcome greeting to dashboard**

In `app/(dashboard)/dashboard/page.tsx`, add above the `<MorningBriefingCard>`:

```tsx
<h1 style={{
  fontSize: 18,
  fontWeight: 620,
  color: "var(--text-primary)",
  letterSpacing: "-0.02em",
  marginBottom: 8,
}}>
  Welcome back, {profile.fullName?.split(" ")[0] ?? "there"}
</h1>
```

- [ ] **Step 2: Enhance morning briefing card**

In `components/dashboard/morning-briefing-card.tsx`:
- Add generation timestamp display: `Generated at {formatTime(brief.createdAt)}`
- Add "Refresh" button that calls the morning briefing generation endpoint

- [ ] **Step 3: Add "Dismiss all" to alerts section**

Read and modify `components/dashboard/alerts-section.tsx` — add a "Dismiss all" link when there are 2+ alerts. Group alerts by urgency (high first, then medium, then low).

- [ ] **Step 4: Final TypeScript check and commit**

Run: `npx tsc --noEmit`
Run: `npm run build`

```bash
git add .
git commit -m "feat: dashboard polish — welcome greeting, briefing refresh, alert dismiss all"
```

---

## Execution Order

```
Task 1 (Schema) ──────────────────────────────► MUST complete first
                                                 │
              ┌──────────────────────────────────┤
              │              │              │     │              │
         Task 2         Task 3         Task 4   Task 5         Task 6
      (Cmd Palette)  (Intake+Snooze) (Stickies) (Cycles)    (Timeline)
      (Filter Chips) (Empty States)  (Notif)    (Initiatives)(Comments)
              │              │              │    (Analytics)   (Pub Views)
              │              │              │     │              │
              └──────────────┴──────────────┴────┴──────────────┘
                                                 │
                                            Task 7
                                        (Dashboard Polish)
```

Tasks 2–6 are fully independent and can be dispatched as parallel subagents.
Task 7 runs after all others merge.
