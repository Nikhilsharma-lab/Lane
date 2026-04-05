# Dev Kanban Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `/dashboard/dev` kanban board showing all dev-phase requests in 5 columns with drag-and-drop, keyboard shortcuts, and a slide-over detail drawer.

**Architecture:** Server component fetches dev-phase requests grouped by `kanban_state` and passes them to a client `DevBoard` component. `@dnd-kit` handles drag and drop. The existing `/api/requests/[id]/kanban` PATCH endpoint handles state changes with optimistic updates. Existing `RealtimeDashboard` component provides live updates. No DB schema changes needed — `kanban_state` enum already exists.

**Tech Stack:** Next.js 14 App Router, `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`, Drizzle ORM, Tailwind CSS, Supabase Realtime

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `components/dev-board/types.ts` | Create | Shared `CardData` type used by all board components |
| `components/dev-board/kanban-card.tsx` | Create | Single draggable card with title, priority, type, project, assignees, deadline |
| `components/dev-board/card-drawer.tsx` | Create | Slide-over detail panel (custom fixed overlay, no external library) |
| `components/dev-board/kanban-column.tsx` | Create | Single column — droppable zone + list of cards |
| `components/dev-board/dev-board.tsx` | Create | Client component — DndContext, optimistic state, keyboard shortcuts, realtime |
| `app/(dashboard)/dashboard/dev/page.tsx` | Create | Server page — auth, fetch, group by state, render board |
| `app/(dashboard)/dashboard/page.tsx` | Modify | Add "Dev Board" nav link |
| `app/(dashboard)/dashboard/team/page.tsx` | Modify | Add "Dev Board" nav link |
| `app/(dashboard)/dashboard/insights/page.tsx` | Modify | Add "Dev Board" nav link |
| `app/(dashboard)/dashboard/ideas/page.tsx` | Modify | Add "Dev Board" nav link |
| `app/(dashboard)/dashboard/radar/page.tsx` | Modify | Add "Dev Board" nav link |

---

## Task 1: Install @dnd-kit

**Files:**
- Modify: `package.json` (via npm install)

- [ ] **Step 1: Install packages**

```bash
cd /Users/yashkaushal/Lane && npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Expected: packages added to `node_modules` and `package.json` dependencies, no errors.

- [ ] **Step 2: Verify install**

```bash
grep "@dnd-kit" package.json
```

Expected output:
```
"@dnd-kit/core": "^6.x.x",
"@dnd-kit/sortable": "^8.x.x",
"@dnd-kit/utilities": "^3.x.x",
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @dnd-kit packages for kanban board"
```

---

## Task 2: Shared CardData type

**Files:**
- Create: `components/dev-board/types.ts`

- [ ] **Step 1: Create the types file**

Create `components/dev-board/types.ts`:

```typescript
export type KanbanState = "todo" | "in_progress" | "in_review" | "qa" | "done";

export const KANBAN_STATES: KanbanState[] = [
  "todo",
  "in_progress",
  "in_review",
  "qa",
  "done",
];

export const KANBAN_STATE_LABELS: Record<KanbanState, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  qa: "QA",
  done: "Done",
};

export interface CardData {
  id: string;
  title: string;
  description: string;
  businessContext: string | null;
  priority: string | null;
  requestType: string | null;
  kanbanState: KanbanState;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  assignees: string[];
  deadlineAt: string | null;
  figmaUrl: string | null;
  figmaLockedAt: string | null;
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/dev-board/types.ts
git commit -m "feat: add shared CardData type for dev kanban board"
```

---

## Task 3: KanbanCard component

**Files:**
- Create: `components/dev-board/kanban-card.tsx`

- [ ] **Step 1: Create the component**

Create `components/dev-board/kanban-card.tsx`:

```tsx
"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ProjectBadge } from "@/components/projects/project-badge";
import type { CardData } from "./types";

const PRIORITY_COLORS: Record<string, string> = {
  p0: "bg-red-500/15 text-red-400 border-red-500/20",
  p1: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  p2: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  p3: "bg-zinc-700/50 text-zinc-400 border-zinc-700",
};

interface Props {
  card: CardData;
  isFocused: boolean;
  onClick: () => void;
  onFocus: () => void;
}

export function KanbanCard({ card, isFocused, onClick, onFocus }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      tabIndex={0}
      onClick={onClick}
      onFocus={onFocus}
      className={`bg-zinc-900 border rounded-lg px-3 py-3 cursor-pointer select-none focus:outline-none transition-colors space-y-2 ${
        isFocused
          ? "border-indigo-500/50 ring-1 ring-indigo-500/20"
          : "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      {/* Title */}
      <p className="text-xs font-medium text-zinc-200 leading-snug line-clamp-2">
        {card.title}
      </p>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        {card.priority && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
              PRIORITY_COLORS[card.priority] ?? ""
            }`}
          >
            {card.priority.toUpperCase()}
          </span>
        )}
        {card.requestType && (
          <span className="text-[10px] text-zinc-500 bg-zinc-800/60 border border-zinc-700/40 rounded px-1.5 py-0.5 capitalize">
            {card.requestType}
          </span>
        )}
      </div>

      {/* Project */}
      {card.projectName && card.projectColor && (
        <ProjectBadge name={card.projectName} color={card.projectColor} />
      )}

      {/* Footer: assignees + deadline */}
      <div className="flex items-center justify-between gap-2">
        {card.assignees.length > 0 && (
          <span className="text-[10px] text-zinc-500 truncate">
            {card.assignees.join(", ")}
          </span>
        )}
        {card.deadlineAt && (
          <span className="text-[10px] text-zinc-600 shrink-0">
            {new Date(card.deadlineAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/dev-board/kanban-card.tsx
git commit -m "feat: add KanbanCard component"
```

---

## Task 4: CardDrawer component

**Files:**
- Create: `components/dev-board/card-drawer.tsx`

Note: The project has no shadcn Sheet. This is a custom fixed overlay + slide-in panel.

- [ ] **Step 1: Create the component**

Create `components/dev-board/card-drawer.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { DevPhasePanel } from "@/components/requests/dev-phase-panel";
import type { CardData } from "./types";

const PRIORITY_COLORS: Record<string, string> = {
  p0: "bg-red-500/15 text-red-400 border-red-500/20",
  p1: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  p2: "bg-yellow-500/15 text-yellow-400 border-yellow-500/20",
  p3: "bg-zinc-700/50 text-zinc-400 border-zinc-700",
};

interface Props {
  card: CardData;
  onClose: () => void;
}

export function CardDrawer({ card, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[420px] bg-zinc-950 border-l border-zinc-800 z-50 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950">
          <span className="text-sm font-semibold text-zinc-200 truncate pr-4">
            {card.title}
          </span>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5 space-y-6">
          {/* Dev Phase Panel — handles its own kanban state + move buttons */}
          <DevPhasePanel
            requestId={card.id}
            kanbanState={card.kanbanState}
            figmaUrl={card.figmaUrl}
            figmaLockedAt={card.figmaLockedAt}
          />

          {/* Description */}
          <section>
            <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">
              Description
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
              {card.description}
            </p>
          </section>

          {card.businessContext && (
            <section>
              <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1.5">
                Business Context
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                {card.businessContext}
              </p>
            </section>
          )}

          {/* Meta fields */}
          <section className="space-y-3">
            {card.assignees.length > 0 && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
                  Assignees
                </div>
                <p className="text-xs text-zinc-400">{card.assignees.join(", ")}</p>
              </div>
            )}

            {card.priority && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
                  Priority
                </div>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
                    PRIORITY_COLORS[card.priority] ?? ""
                  }`}
                >
                  {card.priority.toUpperCase()}
                </span>
              </div>
            )}

            {card.deadlineAt && (
              <div>
                <div className="text-[10px] text-zinc-600 uppercase tracking-wide mb-1">
                  Deadline
                </div>
                <p className="text-xs text-zinc-400">
                  {new Date(card.deadlineAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              </div>
            )}
          </section>

          {/* Link to full request detail */}
          <Link
            href={`/dashboard/requests/${card.id}`}
            className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            View full details →
          </Link>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/dev-board/card-drawer.tsx
git commit -m "feat: add CardDrawer slide-over component"
```

---

## Task 5: KanbanColumn component

**Files:**
- Create: `components/dev-board/kanban-column.tsx`

- [ ] **Step 1: Create the component**

Create `components/dev-board/kanban-column.tsx`:

```tsx
"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { KanbanCard } from "./kanban-card";
import type { CardData, KanbanState } from "./types";

interface Props {
  state: KanbanState;
  label: string;
  cards: CardData[];
  focusedCardId: string | null;
  onCardClick: (card: CardData) => void;
  onCardFocus: (id: string) => void;
}

export function KanbanColumn({
  state,
  label,
  cards,
  focusedCardId,
  onCardClick,
  onCardFocus,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: state });

  return (
    <div className="flex flex-col w-64 shrink-0">
      {/* Column header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          {label}
        </span>
        <span className="text-xs text-zinc-600 font-mono bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5">
          {cards.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-24 rounded-xl transition-colors space-y-2 p-2 ${
          isOver
            ? "bg-zinc-800/40 ring-1 ring-zinc-700/50"
            : "bg-zinc-900/30"
        }`}
      >
        <SortableContext
          items={cards.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              isFocused={focusedCardId === card.id}
              onClick={() => onCardClick(card)}
              onFocus={() => onCardFocus(card.id)}
            />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <div className="h-16 flex items-center justify-center">
            <span className="text-[10px] text-zinc-700">Drop here</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/dev-board/kanban-column.tsx
git commit -m "feat: add KanbanColumn component"
```

---

## Task 6: DevBoard client component

**Files:**
- Create: `components/dev-board/dev-board.tsx`

This is the main orchestrator: DnD context, optimistic state, keyboard shortcuts (`]`/`[`/`Enter`/`Escape`), realtime subscription.

- [ ] **Step 1: Create the component**

Create `components/dev-board/dev-board.tsx`:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from "@dnd-kit/core";
import { KanbanColumn } from "./kanban-column";
import { CardDrawer } from "./card-drawer";
import { RealtimeDashboard } from "@/components/realtime/realtime-dashboard";
import {
  KANBAN_STATES,
  KANBAN_STATE_LABELS,
  type CardData,
  type KanbanState,
} from "./types";

interface Props {
  columns: Record<KanbanState, CardData[]>;
  orgId: string;
}

export function DevBoard({ columns: initialColumns, orgId }: Props) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [drawerCard, setDrawerCard] = useState<CardData | null>(null);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep columns in sync when server re-renders (after router.refresh())
  useEffect(() => {
    setColumns(initialColumns);
  }, [initialColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const moveCard = useCallback(
    async (cardId: string, fromState: KanbanState, toState: KanbanState) => {
      if (fromState === toState) return;

      // Optimistic update
      setColumns((prev) => {
        const card = prev[fromState].find((c) => c.id === cardId);
        if (!card) return prev;
        return {
          ...prev,
          [fromState]: prev[fromState].filter((c) => c.id !== cardId),
          [toState]: [...prev[toState], { ...card, kanbanState: toState }],
        };
      });
      setError(null);

      try {
        const res = await fetch(`/api/requests/${cardId}/kanban`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: toState }),
        });
        if (!res.ok) {
          const data = await res.json();
          // Revert
          setColumns((prev) => {
            const card = prev[toState].find((c) => c.id === cardId);
            if (!card) return prev;
            return {
              ...prev,
              [toState]: prev[toState].filter((c) => c.id !== cardId),
              [fromState]: [...prev[fromState], { ...card, kanbanState: fromState }],
            };
          });
          setError(data.error ?? "Failed to move card");
        } else {
          router.refresh();
        }
      } catch {
        // Revert on network error
        setColumns((prev) => {
          const card = prev[toState].find((c) => c.id === cardId);
          if (!card) return prev;
          return {
            ...prev,
            [toState]: prev[toState].filter((c) => c.id !== cardId),
            [fromState]: [...prev[fromState], { ...card, kanbanState: fromState }],
          };
        });
        setError("Network error");
      }
    },
    [router]
  );

  // Keyboard shortcuts: ] forward, [ back, Enter open drawer, Escape close/deselect
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (drawerCard && e.key === "Escape") {
        e.preventDefault();
        setDrawerCard(null);
        return;
      }
      if (!focusedCardId) return;

      let card: CardData | null = null;
      let currentState: KanbanState | null = null;
      for (const state of KANBAN_STATES) {
        const found = columns[state].find((c) => c.id === focusedCardId);
        if (found) {
          card = found;
          currentState = state;
          break;
        }
      }
      if (!card || !currentState) return;

      const idx = KANBAN_STATES.indexOf(currentState);

      if (e.key === "]" && idx < KANBAN_STATES.length - 1) {
        e.preventDefault();
        moveCard(card.id, currentState, KANBAN_STATES[idx + 1]);
      } else if (e.key === "[" && idx > 0) {
        e.preventDefault();
        moveCard(card.id, currentState, KANBAN_STATES[idx - 1]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        setDrawerCard(card);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setFocusedCardId(null);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [focusedCardId, columns, drawerCard, moveCard]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const cardId = active.id as string;
    const toState = over.id as KanbanState;

    let fromState: KanbanState | null = null;
    for (const state of KANBAN_STATES) {
      if (columns[state].find((c) => c.id === cardId)) {
        fromState = state;
        break;
      }
    }
    if (!fromState) return;
    moveCard(cardId, fromState, toState);
  }

  return (
    <>
      <RealtimeDashboard orgId={orgId} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full overflow-x-auto pb-6">
          {KANBAN_STATES.map((state) => (
            <KanbanColumn
              key={state}
              state={state}
              label={KANBAN_STATE_LABELS[state]}
              cards={columns[state]}
              focusedCardId={focusedCardId}
              onCardClick={setDrawerCard}
              onCardFocus={setFocusedCardId}
            />
          ))}
        </div>
      </DndContext>

      {/* Keyboard hint */}
      {focusedCardId && !drawerCard && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-zinc-500 text-[10px] px-3 py-1.5 rounded-lg flex items-center gap-3">
          <span><kbd className="font-mono text-zinc-400">[</kbd> / <kbd className="font-mono text-zinc-400">]</kbd> move</span>
          <span><kbd className="font-mono text-zinc-400">Enter</kbd> open</span>
          <span><kbd className="font-mono text-zinc-400">Esc</kbd> deselect</span>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Slide-over drawer */}
      {drawerCard && (
        <CardDrawer card={drawerCard} onClose={() => setDrawerCard(null)} />
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/dev-board/dev-board.tsx
git commit -m "feat: add DevBoard client component with DnD and keyboard shortcuts"
```

---

## Task 7: Dev board server page

**Files:**
- Create: `app/(dashboard)/dashboard/dev/page.tsx`

- [ ] **Step 1: Create the page**

Create `app/(dashboard)/dashboard/dev/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, requests, assignments, projects } from "@/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { DevBoard } from "@/components/dev-board/dev-board";
import { ProjectSwitcher } from "@/components/projects/project-switcher";
import { UserMenu } from "@/components/settings/user-menu";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { HeaderSearch } from "@/components/ui/header-search";
import { KANBAN_STATES, type KanbanState, type CardData } from "@/components/dev-board/types";

export default async function DevBoardPage({
  searchParams,
}: {
  searchParams: { project?: string };
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

  const activeProjects = await db
    .select()
    .from(projects)
    .where(and(eq(projects.orgId, profile.orgId), isNull(projects.archivedAt)));

  const projectFilter = searchParams?.project;

  const whereClause = projectFilter
    ? and(
        eq(requests.orgId, profile.orgId),
        eq(requests.phase, "dev"),
        eq(requests.projectId, projectFilter)
      )
    : and(eq(requests.orgId, profile.orgId), eq(requests.phase, "dev"));

  const devRequests = await db.select().from(requests).where(whereClause);

  // Fetch assignee names
  const reqIds = devRequests.map((r) => r.id);
  const allAssignments = reqIds.length
    ? await db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
        })
        .from(assignments)
        .where(inArray(assignments.requestId, reqIds))
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
    if (!assigneesByRequest[a.requestId]) assigneesByRequest[a.requestId] = [];
    const name = memberMap[a.assigneeId];
    if (name) assigneesByRequest[a.requestId].push(name);
  }

  const projectMap = Object.fromEntries(
    activeProjects.map((p) => [p.id, { name: p.name, color: p.color }])
  );

  // Group by kanban_state
  const columns = Object.fromEntries(
    KANBAN_STATES.map((s) => [s, [] as CardData[]])
  ) as Record<KanbanState, CardData[]>;

  for (const r of devRequests) {
    const state = (r.kanbanState ?? "todo") as KanbanState;
    const proj = r.projectId ? projectMap[r.projectId] : null;
    columns[state].push({
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

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">Lane</span>
          <span className="text-zinc-700">·</span>
          <nav className="flex items-center gap-1">
            <Link
              href="/dashboard"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Requests
            </Link>
            <Link
              href="/dashboard/team"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Team
            </Link>
            <Link
              href="/dashboard/insights"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Insights
            </Link>
            <Link
              href="/dashboard/ideas"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Ideas
            </Link>
            <Link
              href="/dashboard/radar"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
            <Link
              href="/dashboard/dev"
              className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
            >
              Dev Board
            </Link>
          </nav>
          <ProjectSwitcher projects={activeProjects} />
        </div>
        <div className="flex items-center gap-3">
          <HeaderSearch />
          <NotificationsBell />
          <span className="text-xs text-zinc-600 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 capitalize">
            {profile.role}
          </span>
          <UserMenu fullName={profile.fullName} />
        </div>
      </header>

      {/* Board — full height, horizontal scroll */}
      <main className="flex-1 px-6 py-6 overflow-hidden">
        <DevBoard columns={columns} orgId={profile.orgId} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/dashboard/dev/page.tsx
git commit -m "feat: add /dashboard/dev kanban board page"
```

---

## Task 8: Add "Dev Board" to all existing nav headers

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/dashboard/team/page.tsx`
- Modify: `app/(dashboard)/dashboard/insights/page.tsx`
- Modify: `app/(dashboard)/dashboard/ideas/page.tsx`
- Modify: `app/(dashboard)/dashboard/radar/page.tsx`

In each file, find the nav block and add a "Dev Board" link after the last existing nav item. The exact existing nav snippet to find and the replacement are given per file below.

### dashboard/page.tsx

- [ ] **Step 1: Add Dev Board link**

In `app/(dashboard)/dashboard/page.tsx`, find:
```tsx
            <Link href="/dashboard/radar" className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors">
              Radar
            </Link>
          </nav>
```

Replace with:
```tsx
            <Link href="/dashboard/radar" className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors">
              Radar
            </Link>
            <Link href="/dashboard/dev" className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors">
              Dev Board
            </Link>
          </nav>
```

### dashboard/team/page.tsx

- [ ] **Step 2: Add Dev Board link**

In `app/(dashboard)/dashboard/team/page.tsx`, find:
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
          </nav>
          <ProjectSwitcher projects={activeProjects} />
```

Replace with:
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
            <Link
              href="/dashboard/dev"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Dev Board
            </Link>
          </nav>
          <ProjectSwitcher projects={activeProjects} />
```

### dashboard/insights/page.tsx

- [ ] **Step 3: Add Dev Board link**

In `app/(dashboard)/dashboard/insights/page.tsx`, find:
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
          </nav>
          <ProjectSwitcher projects={activeProjects} />
```

Replace with:
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
            <Link
              href="/dashboard/dev"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Dev Board
            </Link>
          </nav>
          <ProjectSwitcher projects={activeProjects} />
```

### dashboard/ideas/page.tsx

- [ ] **Step 4: Add Dev Board link**

In `app/(dashboard)/dashboard/ideas/page.tsx`, find:
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
          </nav>
          <ProjectSwitcher projects={activeProjects} />
```

Replace with:
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
            <Link
              href="/dashboard/dev"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Dev Board
            </Link>
          </nav>
          <ProjectSwitcher projects={activeProjects} />
```

### dashboard/radar/page.tsx

- [ ] **Step 5: Add Dev Board link**

In `app/(dashboard)/dashboard/radar/page.tsx`, find (note Radar has the active class here since it's the current page):
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
          </nav>
        </div>
```

Replace with:
```tsx
            <Link
              href="/dashboard/radar"
              className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
            <Link
              href="/dashboard/dev"
              className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
            >
              Dev Board
            </Link>
          </nav>
        </div>
```

- [ ] **Step 6: Type-check all nav changes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/(dashboard)/dashboard/page.tsx \
        app/(dashboard)/dashboard/team/page.tsx \
        app/(dashboard)/dashboard/insights/page.tsx \
        app/(dashboard)/dashboard/ideas/page.tsx \
        app/(dashboard)/dashboard/radar/page.tsx
git commit -m "feat: add Dev Board nav link to all dashboard headers"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Dev server smoke test**

```bash
npm run dev
```

Open in browser and verify:
1. All existing nav pages still have "Dev Board" link in the header
2. `/dashboard/dev` loads without errors
3. Requests with `phase = 'dev'` appear in the correct column
4. Dragging a card between columns moves it and persists (check the request detail page confirms the new state)
5. Focusing a card and pressing `]` moves it forward one column
6. Pressing `Enter` on a focused card opens the slide-over drawer
7. Pressing `Escape` closes the drawer
8. Project switcher filters the board correctly

- [ ] **Step 3: Build check**

```bash
npm run build
```

Expected: build succeeds with no TypeScript or compilation errors.
