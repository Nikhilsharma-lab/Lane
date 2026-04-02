# Design Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/dashboard/radar` page — a live command centre for the Design Head showing designer status, phase heat map, risk panel, and shipped-this-week with cycle times.

**Architecture:** Single server component fetches all org data in two parallel batches, runs all classification/computation in pure server-side functions in `lib/radar.ts`, then renders four client components (DesignerStatus, RiskPanel, ShippedWeek) and one server component (HeatMap). Real-time updates use the existing Supabase Postgres Changes → `router.refresh()` pattern via a new `RealtimeRadar` wrapper.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Supabase Realtime, TypeScript, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `db/schema/users.ts` | Modify | Add `managerId` nullable self-referential FK to `profiles` |
| `lib/radar.ts` | Create | Pure computation functions + serialisable TS types |
| `hooks/use-realtime-radar.ts` | Create | Supabase subscription hook for the radar page |
| `components/realtime/realtime-radar.tsx` | Create | Invisible client wrapper that mounts the hook |
| `components/radar/designer-status.tsx` | Create | Panel 1 — status cards + Nudge / Mark at-risk buttons |
| `components/radar/heat-map.tsx` | Create | Panel 2 — 4 phase buckets (server component, links only) |
| `components/radar/risk-panel.tsx` | Create | Panel 3 — 3 collapsible risk categories |
| `components/radar/shipped-week.tsx` | Create | Panel 4 — shipped cards with expandable cycle times |
| `app/(dashboard)/dashboard/radar/page.tsx` | Create | Server component — auth, data fetch, renders all panels |
| `app/api/team/[memberId]/manager/route.ts` | Create | PATCH endpoint to set `managerId` (admin only) |
| `components/team/reports-to-select.tsx` | Create | Client component — "Reports to" dropdown |
| `app/(dashboard)/dashboard/team/page.tsx` | Modify | Add Reports-to dropdowns (admin only) + Radar nav link |
| `app/(dashboard)/dashboard/page.tsx` | Modify | Add Radar nav link |
| `app/(dashboard)/dashboard/insights/page.tsx` | Modify | Add Radar nav link |
| `app/(dashboard)/dashboard/ideas/page.tsx` | Modify | Add Radar nav link |

---

## Task 1: Add managerId to profiles schema

**Files:**
- Modify: `db/schema/users.ts`

The `profiles` table needs a nullable self-referential FK. When a team lead reports to a Design Head, the lead's `managerId` is set to the Design Head's profile ID. Null means no manager (Design Head or unset).

- [ ] **Step 1: Add the managerId column**

Open `db/schema/users.ts`. The current `profiles` table ends at `updatedAt`. Add one new column before the closing `}`:

```typescript
import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);
export const roleEnum = pgEnum("role", ["pm", "designer", "developer", "lead", "admin"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // references auth.users(id)
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("designer"),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").default("UTC"),
  managerId: uuid("manager_id").references((): ReturnType<typeof profiles._.columns.id.config.references> => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
```

Wait — Drizzle's self-referential FK syntax is simpler. Use this exact replacement for just the `managerId` line:

```typescript
  managerId: uuid("manager_id").references(() => profiles.id, { onDelete: "set null" }),
```

The complete updated file:

```typescript
import { pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["free", "pro", "enterprise"]);
export const roleEnum = pgEnum("role", ["pm", "designer", "developer", "lead", "admin"]);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("free"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(), // references auth.users(id)
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("designer"),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").default("UTC"),
  managerId: uuid("manager_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
```

- [ ] **Step 2: Type-check the schema change**

Run: `npx tsc --noEmit`

Expected: No errors. If Drizzle complains about the self-referential reference, the fix is to wrap with `sql`: replace the references call with `.references(() => profiles.id, { onDelete: "set null" })` — this is already the correct form.

- [ ] **Step 3: Push schema to the database**

Run: `npm run db:push`

Expected: Supabase applies the migration, adds `manager_id` column to the `profiles` table. The column is nullable, so existing rows are unaffected.

- [ ] **Step 4: Commit**

```bash
git add db/schema/users.ts
git commit -m "feat: add managerId to profiles for team lead reporting structure"
```

---

## Task 2: Radar computation library

**Files:**
- Create: `lib/radar.ts`

All classification and computation is done in pure functions. This file has no side effects and no imports from Next.js or React — it only imports DB types. Every return type is serialisable (strings, numbers, nulls — no `Date` objects) so the page can safely pass results as props to client components.

- [ ] **Step 1: Create `lib/radar.ts`**

```typescript
import type { Request } from "@/db/schema/requests";
import type { Profile } from "@/db/schema/users";

// ─── Serialisable output types ─────────────────────────────────────────────

export type DesignerStatus = "in-flow" | "idle" | "stuck" | "blocked" | "no-work";

export type RadarDesigner = {
  id: string;
  fullName: string;
  managerId: string | null;
  status: DesignerStatus;
  activeCount: number;
  /** Staleness of the most-recently-updated active request (ms). Null when no active work. */
  lastMovedMs: number | null;
  /** ID of the most-stalled active request — target for Nudge and Mark at-risk actions. */
  mostStalledRequestId: string | null;
  /** Current status of that request, needed for toggle-blocked body. */
  mostStalledRequestStatus: string | null;
  /** Title + stale days of the blocked request for display. Null when not blocked. */
  blockedTitle: string | null;
};

export type RiskRow = {
  requestId: string;
  title: string;
  priority: string | null;
  phase: string;
  designerName: string;
  staleDays: number;
};

export type FigmaDriftRow = {
  requestId: string;
  title: string;
  priority: string | null;
  unreviewedCount: number;
};

export type ShippedCard = {
  requestId: string;
  title: string;
  designerName: string;
  fullDays: number;
  designDays: number | null;
  devDays: number | null;
};

export type PhaseHeatMap = {
  predesign: number;
  design: number;
  dev: number;
  track: number;
};

// ─── Internal helpers ──────────────────────────────────────────────────────

const ACTIVE_PHASES = new Set(["predesign", "design", "dev"]);

function isActive(r: Request): boolean {
  return ACTIVE_PHASES.has(r.phase ?? "") && r.status !== "draft";
}

// ─── Public functions ──────────────────────────────────────────────────────

/**
 * Classify a single designer's status from their active requests.
 * Blocked overrides time-based signals.
 */
export function classifyDesignerStatus(activeRequests: Request[]): DesignerStatus {
  if (activeRequests.length === 0) return "no-work";
  if (activeRequests.some((r) => r.status === "blocked")) return "blocked";

  const now = Date.now();
  const mostRecentMs = Math.max(
    ...activeRequests.map((r) => new Date(r.updatedAt).getTime())
  );
  const staleMs = now - mostRecentMs;

  if (staleMs >= 5 * 86_400_000) return "stuck";
  if (staleMs >= 2 * 86_400_000) return "idle";
  return "in-flow";
}

/**
 * Build one RadarDesigner row per designer/lead profile.
 * allAssignments: flat list from the assignments table.
 */
export function buildDesignerRows(
  allProfiles: Profile[],
  allRequests: Request[],
  allAssignments: Array<{ requestId: string; assigneeId: string }>
): RadarDesigner[] {
  const designers = allProfiles.filter(
    (p) => p.role === "designer" || p.role === "lead"
  );

  // assigneeId → Set of requestIds
  const assignedIds = new Map<string, Set<string>>();
  for (const a of allAssignments) {
    if (!assignedIds.has(a.assigneeId)) assignedIds.set(a.assigneeId, new Set());
    assignedIds.get(a.assigneeId)!.add(a.requestId);
  }

  const requestMap = new Map(allRequests.map((r) => [r.id, r]));
  const now = Date.now();

  return designers.map((profile) => {
    const reqIds = assignedIds.get(profile.id) ?? new Set<string>();
    const activeRequests = [...reqIds]
      .map((id) => requestMap.get(id))
      .filter((r): r is Request => !!r && isActive(r));

    const status = classifyDesignerStatus(activeRequests);

    // Most stalled = oldest updatedAt
    const mostStalled =
      activeRequests.length > 0
        ? activeRequests.reduce((a, b) =>
            new Date(a.updatedAt).getTime() < new Date(b.updatedAt).getTime() ? a : b
          )
        : null;

    const lastMovedMs = mostStalled
      ? now - new Date(mostStalled.updatedAt).getTime()
      : null;

    // Blocked request info for card display
    const blockedReq = activeRequests.find((r) => r.status === "blocked");
    const blockedStaleDays = blockedReq
      ? Math.floor((now - new Date(blockedReq.updatedAt).getTime()) / 86_400_000)
      : null;

    return {
      id: profile.id,
      fullName: profile.fullName,
      managerId: profile.managerId ?? null,
      status,
      activeCount: activeRequests.length,
      lastMovedMs,
      mostStalledRequestId: mostStalled?.id ?? null,
      mostStalledRequestStatus: mostStalled?.status ?? null,
      blockedTitle:
        blockedReq && blockedStaleDays !== null
          ? `${blockedReq.title} (${blockedStaleDays}d)`
          : null,
    };
  });
}

/**
 * Count org requests per phase for the heat map.
 * Excludes draft and completed/shipped.
 */
export function getPhaseHeatMap(allRequests: Request[]): PhaseHeatMap {
  const counts: PhaseHeatMap = { predesign: 0, design: 0, dev: 0, track: 0 };
  for (const r of allRequests) {
    if (r.status === "draft" || r.status === "completed" || r.status === "shipped") continue;
    const p = (r.phase ?? "predesign") as keyof PhaseHeatMap;
    if (p in counts) counts[p]++;
  }
  return counts;
}

/**
 * Build the three risk categories.
 * designerByRequest: requestId → designer display name (from assignments).
 */
export function getRiskItems(
  allRequests: Request[],
  driftUpdates: Array<{ requestId: string }>,
  designerByRequest: Record<string, string>
): { stalled: RiskRow[]; signOffOverdue: RiskRow[]; figmaDrift: FigmaDriftRow[] } {
  const now = Date.now();

  const stalled: RiskRow[] = allRequests
    .filter((r) => isActive(r) && now - new Date(r.updatedAt).getTime() >= 5 * 86_400_000)
    .map((r) => ({
      requestId: r.id,
      title: r.title,
      priority: r.priority ?? null,
      phase: r.phase ?? "predesign",
      designerName: designerByRequest[r.id] ?? "Unassigned",
      staleDays: Math.floor((now - new Date(r.updatedAt).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.staleDays - a.staleDays);

  const signOffOverdue: RiskRow[] = allRequests
    .filter(
      (r) =>
        r.designStage === "validate" &&
        now - new Date(r.updatedAt).getTime() >= 3 * 86_400_000
    )
    .map((r) => ({
      requestId: r.id,
      title: r.title,
      priority: r.priority ?? null,
      phase: "design",
      designerName: designerByRequest[r.id] ?? "Unassigned",
      staleDays: Math.floor((now - new Date(r.updatedAt).getTime()) / 86_400_000),
    }))
    .sort((a, b) => b.staleDays - a.staleDays);

  // Group drift updates by request
  const driftCount = new Map<string, number>();
  for (const fu of driftUpdates) {
    driftCount.set(fu.requestId, (driftCount.get(fu.requestId) ?? 0) + 1);
  }

  const figmaDrift: FigmaDriftRow[] = [];
  for (const [requestId, count] of driftCount) {
    const req = allRequests.find((r) => r.id === requestId);
    if (!req) continue;
    figmaDrift.push({
      requestId,
      title: req.title,
      priority: req.priority ?? null,
      unreviewedCount: count,
    });
  }

  return { stalled, signOffOverdue, figmaDrift };
}

/**
 * Compute cycle times for a single request.
 * stages: filtered entries for this request from the request_stages table.
 * Returns null for design/dev if data is unavailable — never crashes.
 */
export function computeCycleTimes(
  request: Request,
  stages: Array<{ stage: string; enteredAt: Date | string }>
): { fullDays: number; designDays: number | null; devDays: number | null } {
  const shippedAt = new Date(request.updatedAt).getTime();
  const createdAt = new Date(request.createdAt).getTime();
  const fullDays = Math.max(1, Math.ceil((shippedAt - createdAt) / 86_400_000));

  // Design cycle: 'explore' stage entry (from legacy request_stages) → figmaLockedAt
  const exploreEntry = stages.find((s) => s.stage === "explore");
  const designStart = exploreEntry ? new Date(exploreEntry.enteredAt).getTime() : null;
  const handoffAt = request.figmaLockedAt ? new Date(request.figmaLockedAt).getTime() : null;

  const designDays =
    designStart !== null && handoffAt !== null
      ? Math.max(1, Math.ceil((handoffAt - designStart) / 86_400_000))
      : null;

  const devDays =
    handoffAt !== null
      ? Math.max(1, Math.ceil((shippedAt - handoffAt) / 86_400_000))
      : null;

  return { fullDays, designDays, devDays };
}

/**
 * Requests that reached the track phase within the last 7 days.
 * Uses updatedAt as proxy for when phase became track.
 */
export function getShippedThisWeek(
  allRequests: Request[],
  allStages: Array<{ requestId: string; stage: string; enteredAt: Date | string }>,
  designerByRequest: Record<string, string>
): ShippedCard[] {
  const now = Date.now();
  return allRequests
    .filter((r) => r.phase === "track" && now - new Date(r.updatedAt).getTime() <= 7 * 86_400_000)
    .map((r) => {
      const stages = allStages.filter((s) => s.requestId === r.id);
      const { fullDays, designDays, devDays } = computeCycleTimes(r, stages);
      return {
        requestId: r.id,
        title: r.title,
        designerName: designerByRequest[r.id] ?? "Unknown",
        fullDays,
        designDays,
        devDays,
      };
    });
}

/**
 * Returns a canAction predicate for the radar page.
 * Design Head (lead/admin with no managerId): can act on all designers.
 * Team Lead (lead with managerId set): can act only on direct reports.
 * Everyone else: read-only.
 */
export function makeCanAction(
  viewer: Profile,
  allProfiles: Profile[]
): (designerId: string) => boolean {
  const isDesignHead =
    (viewer.role === "lead" || viewer.role === "admin") && !viewer.managerId;
  if (isDesignHead) return () => true;

  if (viewer.role === "lead" && viewer.managerId) {
    return (designerId: string) => {
      const designer = allProfiles.find((p) => p.id === designerId);
      return designer?.managerId === viewer.id;
    };
  }

  return () => false;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/radar.ts
git commit -m "feat: add radar computation library (classifyDesignerStatus, getRiskItems, getShippedThisWeek)"
```

---

## Task 3: Realtime infrastructure

**Files:**
- Create: `hooks/use-realtime-radar.ts`
- Create: `components/realtime/realtime-radar.tsx`

Same pattern as `hooks/use-realtime-dashboard.ts` + `components/realtime/realtime-dashboard.tsx`.

- [ ] **Step 1: Create the hook**

Create `hooks/use-realtime-radar.ts`:

```typescript
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to request changes for the radar page.
 * Refreshes on any change so designer status and risk panels stay current.
 */
export function useRealtimeRadar(orgId: string) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`radar:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "requests",
          filter: `org_id=eq.${orgId}`,
        },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, router]);
}
```

- [ ] **Step 2: Create the invisible client wrapper**

Create `components/realtime/realtime-radar.tsx`:

```typescript
"use client";

import { useRealtimeRadar } from "@/hooks/use-realtime-radar";

export function RealtimeRadar({ orgId }: { orgId: string }) {
  useRealtimeRadar(orgId);
  return null;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add hooks/use-realtime-radar.ts components/realtime/realtime-radar.tsx
git commit -m "feat: add RealtimeRadar hook and wrapper for live radar updates"
```

---

## Task 4: DesignerStatus component (Panel 1)

**Files:**
- Create: `components/radar/designer-status.tsx`

Client component. Receives `RadarDesigner[]` and `canActionMap` (precomputed server-side). Shows a status card per designer. Leads/Design Head get Nudge and Mark at-risk buttons.

- [ ] **Step 1: Create `components/radar/designer-status.tsx`**

```typescript
"use client";

import { useState } from "react";
import type { RadarDesigner } from "@/lib/radar";

function formatStaleness(ms: number | null): string {
  if (ms === null) return "";
  const hours = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

const STATUS_DOT: Record<string, string> = {
  "in-flow": "🟢",
  idle: "🟡",
  stuck: "🔴",
  blocked: "🔴",
  "no-work": "⚪",
};

type ActionState = "idle" | "loading" | "done";

function DesignerCard({
  designer,
  canAct,
}: {
  designer: RadarDesigner;
  canAct: boolean;
}) {
  const [nudge, setNudge] = useState<ActionState>("idle");
  const [risk, setRisk] = useState<ActionState>("idle");

  async function handleNudge() {
    if (!designer.mostStalledRequestId || nudge !== "idle") return;
    setNudge("loading");
    await fetch(`/api/requests/${designer.mostStalledRequestId}/nudge`, {
      method: "POST",
    });
    setNudge("done");
  }

  async function handleMarkAtRisk() {
    if (!designer.mostStalledRequestId || risk !== "idle") return;
    setRisk("loading");
    await fetch(`/api/requests/${designer.mostStalledRequestId}/toggle-blocked`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStatus: designer.mostStalledRequestStatus }),
    });
    setRisk("done");
  }

  const alreadyBlocked = designer.mostStalledRequestStatus === "blocked";

  return (
    <div className="flex items-start justify-between border border-zinc-800 rounded-xl px-5 py-3">
      <div>
        <p className="text-sm text-white">
          {STATUS_DOT[designer.status] ?? "⚪"} {designer.fullName}
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {designer.activeCount} active
          {designer.lastMovedMs !== null &&
            ` · last moved ${formatStaleness(designer.lastMovedMs)}`}
          {designer.status === "blocked" && designer.blockedTitle &&
            ` · BLOCKED · ${designer.blockedTitle}`}
        </p>
      </div>
      {canAct && designer.mostStalledRequestId && (
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={handleNudge}
            disabled={nudge !== "idle"}
            className="text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {nudge === "loading" ? "…" : nudge === "done" ? "Sent ✓" : "Nudge"}
          </button>
          <button
            onClick={handleMarkAtRisk}
            disabled={risk !== "idle" || alreadyBlocked}
            className="text-xs text-zinc-400 border border-zinc-700 rounded px-2 py-1 hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {alreadyBlocked
              ? "Already blocked"
              : risk === "loading"
              ? "…"
              : risk === "done"
              ? "Marked ✓"
              : "Mark at-risk"}
          </button>
        </div>
      )}
    </div>
  );
}

export function DesignerStatus({
  designers,
  canActionMap,
}: {
  designers: RadarDesigner[];
  canActionMap: Record<string, boolean>;
}) {
  if (designers.length === 0) {
    return (
      <p className="text-sm text-zinc-600 border border-zinc-800/50 rounded-xl px-5 py-4">
        No designers in this org yet.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {designers.map((d) => (
        <DesignerCard key={d.id} designer={d} canAct={canActionMap[d.id] ?? false} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/radar/designer-status.tsx
git commit -m "feat: add DesignerStatus panel (Panel 1) with Nudge and Mark at-risk actions"
```

---

## Task 5: HeatMap component (Panel 2)

**Files:**
- Create: `components/radar/heat-map.tsx`

Server component — no state, just 4 link buckets. Each bucket navigates to `/dashboard?phase=X`.

- [ ] **Step 1: Create `components/radar/heat-map.tsx`**

```typescript
import Link from "next/link";
import type { PhaseHeatMap } from "@/lib/radar";

const PHASE_LABELS: Record<keyof PhaseHeatMap, string> = {
  predesign: "Predesign",
  design: "Design",
  dev: "Dev",
  track: "Track",
};

export function HeatMap({ heatMap }: { heatMap: PhaseHeatMap }) {
  const phases = ["predesign", "design", "dev", "track"] as const;
  return (
    <div className="grid grid-cols-4 gap-3">
      {phases.map((phase) => (
        <Link
          key={phase}
          href={`/dashboard?phase=${phase}`}
          className="border border-zinc-800 rounded-xl px-5 py-4 hover:border-zinc-600 transition-colors block"
        >
          <p className="text-xs text-zinc-500 mb-1">{PHASE_LABELS[phase]}</p>
          <p className="text-2xl font-semibold text-white">{heatMap[phase]}</p>
        </Link>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/radar/heat-map.tsx
git commit -m "feat: add HeatMap panel (Panel 2) with phase bucket links"
```

---

## Task 6: RiskPanel component (Panel 3)

**Files:**
- Create: `components/radar/risk-panel.tsx`

Client component — three collapsible sections. Each section shows "All clear" when empty.

- [ ] **Step 1: Create `components/radar/risk-panel.tsx`**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import type { RiskRow, FigmaDriftRow } from "@/lib/radar";

const PRIORITY_COLORS: Record<string, string> = {
  p0: "text-red-400",
  p1: "text-orange-400",
  p2: "text-yellow-400",
  p3: "text-zinc-500",
};

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return null;
  return (
    <span
      className={`text-[10px] font-mono ${PRIORITY_COLORS[priority] ?? "text-zinc-500"} bg-zinc-900 border border-zinc-800 rounded px-1 shrink-0`}
    >
      {priority.toUpperCase()}
    </span>
  );
}

function RiskSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-zinc-900/50 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-medium text-zinc-300">{title}</span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono ${count > 0 ? "text-red-400" : "text-green-400"}`}
          >
            {count}
          </span>
          <span className="text-zinc-600 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div className="border-t border-zinc-800">{children}</div>}
    </div>
  );
}

export function RiskPanel({
  risk,
}: {
  risk: {
    stalled: RiskRow[];
    signOffOverdue: RiskRow[];
    figmaDrift: FigmaDriftRow[];
  };
}) {
  return (
    <div className="space-y-3">
      {/* Stalled */}
      <RiskSection title="Stalled Requests" count={risk.stalled.length}>
        {risk.stalled.length === 0 ? (
          <p className="px-5 py-3 text-sm text-green-500">All clear</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {risk.stalled.map((r) => (
              <Link
                key={r.requestId}
                href={`/dashboard/requests/${r.requestId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/50 transition-colors"
              >
                <PriorityBadge priority={r.priority} />
                <span className="text-sm text-zinc-300 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-zinc-500 capitalize shrink-0">{r.phase}</span>
                <span className="text-xs text-zinc-500 shrink-0">{r.designerName}</span>
                <span className="text-xs text-red-400 shrink-0">{r.staleDays}d stalled</span>
              </Link>
            ))}
          </div>
        )}
      </RiskSection>

      {/* Sign-off overdue */}
      <RiskSection title="Sign-off Overdue" count={risk.signOffOverdue.length}>
        {risk.signOffOverdue.length === 0 ? (
          <p className="px-5 py-3 text-sm text-green-500">All clear</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {risk.signOffOverdue.map((r) => (
              <Link
                key={r.requestId}
                href={`/dashboard/requests/${r.requestId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/50 transition-colors"
              >
                <PriorityBadge priority={r.priority} />
                <span className="text-sm text-zinc-300 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-zinc-500 shrink-0">Waiting for sign-offs</span>
                <span className="text-xs text-red-400 shrink-0">{r.staleDays}d</span>
              </Link>
            ))}
          </div>
        )}
      </RiskSection>

      {/* Figma drift */}
      <RiskSection
        title="Post-Handoff Figma Drift"
        count={risk.figmaDrift.length}
      >
        {risk.figmaDrift.length === 0 ? (
          <p className="px-5 py-3 text-sm text-green-500">All clear</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {risk.figmaDrift.map((r) => (
              <Link
                key={r.requestId}
                href={`/dashboard/requests/${r.requestId}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/50 transition-colors"
              >
                <PriorityBadge priority={r.priority} />
                <span className="text-sm text-zinc-300 flex-1 truncate">{r.title}</span>
                <span className="text-xs text-zinc-500 shrink-0">
                  Figma updated post-handoff
                </span>
                <span className="text-xs text-amber-400 shrink-0">
                  {r.unreviewedCount} unreviewed
                </span>
              </Link>
            ))}
          </div>
        )}
      </RiskSection>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/radar/risk-panel.tsx
git commit -m "feat: add RiskPanel (Panel 3) with stalled, sign-off overdue, and Figma drift sections"
```

---

## Task 7: ShippedWeek component (Panel 4)

**Files:**
- Create: `components/radar/shipped-week.tsx`

Client component. Collapsed by default — click [▶] to expand design/dev breakdown.

- [ ] **Step 1: Create `components/radar/shipped-week.tsx`**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import type { ShippedCard } from "@/lib/radar";

function CycleCard({ card }: { card: ShippedCard }) {
  const [expanded, setExpanded] = useState(false);
  const hasBreakdown = card.designDays !== null || card.devDays !== null;

  const breakdownLabel = `Design: ${card.designDays !== null ? `${card.designDays}d` : "—"} · Dev: ${card.devDays !== null ? `${card.devDays}d` : "—"}`;

  return (
    <div className="border border-zinc-800 rounded-xl px-5 py-3">
      <Link
        href={`/dashboard/requests/${card.requestId}`}
        className="text-sm text-zinc-300 hover:text-white transition-colors"
      >
        {card.title}
      </Link>
      <p className="text-xs text-zinc-500 mt-0.5">
        {card.designerName} · {card.fullDays}d full cycle
      </p>
      {hasBreakdown && (
        <button
          className="text-xs text-zinc-600 hover:text-zinc-400 mt-1 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "▲ Collapse" : `▶ ${breakdownLabel}`}
        </button>
      )}
      {expanded && (
        <div className="mt-1 flex gap-4 text-xs text-zinc-500">
          <span>Design: {card.designDays !== null ? `${card.designDays}d` : "—"}</span>
          <span>Dev: {card.devDays !== null ? `${card.devDays}d` : "—"}</span>
        </div>
      )}
    </div>
  );
}

export function ShippedWeek({ shipped }: { shipped: ShippedCard[] }) {
  if (shipped.length === 0) {
    return (
      <p className="text-sm text-zinc-600 border border-zinc-800/50 rounded-xl px-5 py-4">
        Nothing shipped yet this week — keep pushing.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {shipped.map((card) => (
        <CycleCard key={card.requestId} card={card} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/radar/shipped-week.tsx
git commit -m "feat: add ShippedWeek panel (Panel 4) with expandable cycle time breakdown"
```

---

## Task 8: Radar page

**Files:**
- Create: `app/(dashboard)/dashboard/radar/page.tsx`

Server component. Fetches all org data in two parallel batches, computes all radar data server-side, passes serialisable results to the four panel components.

- [ ] **Step 1: Create `app/(dashboard)/dashboard/radar/page.tsx`**

```typescript
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  assignments,
  figmaUpdates,
  requestStages,
} from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import {
  buildDesignerRows,
  getPhaseHeatMap,
  getRiskItems,
  getShippedThisWeek,
  makeCanAction,
} from "@/lib/radar";
import { RealtimeRadar } from "@/components/realtime/realtime-radar";
import { DesignerStatus } from "@/components/radar/designer-status";
import { HeatMap } from "@/components/radar/heat-map";
import { RiskPanel } from "@/components/radar/risk-panel";
import { ShippedWeek } from "@/components/radar/shipped-week";
import { HeaderSearch } from "@/components/ui/header-search";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { UserMenu } from "@/components/settings/user-menu";

export default async function RadarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [viewer] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!viewer) redirect("/login");

  // Batch 1: org-wide requests and profiles
  const [allRequests, allProfiles] = await Promise.all([
    db.select().from(requests).where(eq(requests.orgId, viewer.orgId)),
    db.select().from(profiles).where(eq(profiles.orgId, viewer.orgId)),
  ]);

  const orgReqIds = allRequests.map((r) => r.id);

  // Batch 2: assignments, Figma drift, stage history
  const [allAssignments, driftUpdates, allStages] = orgReqIds.length
    ? await Promise.all([
        db
          .select({
            requestId: assignments.requestId,
            assigneeId: assignments.assigneeId,
          })
          .from(assignments)
          .where(inArray(assignments.requestId, orgReqIds)),
        db
          .select({ requestId: figmaUpdates.requestId })
          .from(figmaUpdates)
          .where(
            and(
              inArray(figmaUpdates.requestId, orgReqIds),
              eq(figmaUpdates.postHandoff, true),
              eq(figmaUpdates.devReviewed, false)
            )
          ),
        db
          .select({
            requestId: requestStages.requestId,
            stage: requestStages.stage,
            enteredAt: requestStages.enteredAt,
          })
          .from(requestStages)
          .where(inArray(requestStages.requestId, orgReqIds)),
      ])
    : ([ [], [], [] ] as [typeof allAssignments, typeof driftUpdates, typeof allStages]);

  // Build lookup: requestId → primary designer name
  const profileMap = Object.fromEntries(allProfiles.map((p) => [p.id, p.fullName]));
  const designerByRequest: Record<string, string> = {};
  for (const a of allAssignments) {
    designerByRequest[a.requestId] = profileMap[a.assigneeId] ?? "Unassigned";
  }

  // Compute all radar data server-side
  const radarDesigners = buildDesignerRows(allProfiles, allRequests, allAssignments);
  const heatMap = getPhaseHeatMap(allRequests);
  const risk = getRiskItems(allRequests, driftUpdates, designerByRequest);
  const shipped = getShippedThisWeek(allRequests, allStages, designerByRequest);

  // Precompute canAction per designer
  const canAction = makeCanAction(viewer, allProfiles);
  const canActionMap = Object.fromEntries(
    allProfiles.map((p) => [p.id, canAction(p.id)])
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <RealtimeRadar orgId={viewer.orgId} />
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold">DesignQ</span>
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
              className="text-sm text-white bg-zinc-800 px-2 py-1 rounded transition-colors"
            >
              Radar
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <HeaderSearch />
          <NotificationsBell />
          <UserMenu fullName={viewer.fullName} />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Designer Status
          </h2>
          <DesignerStatus designers={radarDesigners} canActionMap={canActionMap} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Phase Heat Map
          </h2>
          <HeatMap heatMap={heatMap} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Risk
          </h2>
          <RiskPanel risk={risk} />
        </section>

        <section>
          <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-4">
            Shipped This Week
          </h2>
          <ShippedWeek shipped={shipped} />
        </section>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors. If there is a TypeScript error on the empty array fallback for `driftUpdates` or `allStages` types, replace the fallback with:

```typescript
    : await Promise.resolve([[], [], []] as const);
```

And explicitly type the destructure:

```typescript
  const [allAssignments, driftUpdates, allStages]: [
    Array<{ requestId: string; assigneeId: string }>,
    Array<{ requestId: string }>,
    Array<{ requestId: string; stage: string; enteredAt: Date }>
  ] = orgReqIds.length ? await Promise.all([...]) : [[], [], []];
```

- [ ] **Step 3: Smoke test in browser**

Run: `npm run dev`

Navigate to `http://localhost:3000/dashboard/radar`. Expected:
- Page loads without errors
- All 4 panels render (may be empty if no org data)
- Header shows Requests / Team / Insights / Ideas / Radar with Radar highlighted

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/dashboard/radar/page.tsx
git commit -m "feat: add Design Radar page with all 4 panels"
```

---

## Task 9: PATCH manager API route

**Files:**
- Create: `app/api/team/[memberId]/manager/route.ts`

Admin-only endpoint that sets `managerId` on a profile. Used by the Reports-to dropdown.

- [ ] **Step 1: Create `app/api/team/[memberId]/manager/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;
  const { managerId } = await req.json() as { managerId: string | null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [viewer] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!viewer || viewer.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (managerId === memberId) {
    return NextResponse.json({ error: "Cannot report to yourself" }, { status: 400 });
  }

  await db
    .update(profiles)
    .set({ managerId: managerId ?? null })
    .where(eq(profiles.id, memberId));

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/team/\[memberId\]/manager/route.ts
git commit -m "feat: add PATCH /api/team/[memberId]/manager for admin team structure setup"
```

---

## Task 10: Reports-to dropdown and Team page modification

**Files:**
- Create: `components/team/reports-to-select.tsx`
- Modify: `app/(dashboard)/dashboard/team/page.tsx`

Admin sees a "Reports to" dropdown per member. Saves on change via the PATCH route.

- [ ] **Step 1: Create `components/team/reports-to-select.tsx`**

```typescript
"use client";

import { useState } from "react";

type Manager = { id: string; fullName: string };

export function ReportsToSelect({
  memberId,
  currentManagerId,
  managers,
}: {
  memberId: string;
  currentManagerId: string | null;
  managers: Manager[];
}) {
  const [value, setValue] = useState(currentManagerId ?? "");
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newManagerId = e.target.value || null;
    setValue(e.target.value);
    setSaving(true);
    await fetch(`/api/team/${memberId}/manager`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId: newManagerId }),
    });
    setSaving(false);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={saving}
      className="text-xs bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-zinc-400 hover:border-zinc-600 disabled:opacity-50 transition-colors"
    >
      <option value="">No manager</option>
      {managers.map((m) => (
        <option key={m.id} value={m.id}>
          {m.fullName}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: Modify the member card section in `app/(dashboard)/dashboard/team/page.tsx`**

Add the import at the top (after existing imports):

```typescript
import { ReportsToSelect } from "@/components/team/reports-to-select";
```

Then in the member card's right-side `div` (the one that already contains PM quality score, designer workload, and role badge), add the `ReportsToSelect` BEFORE the role badge span, but only for admin viewers. Find the member card `div` that starts with:

```tsx
<div className="flex items-center gap-3">
```

Inside it, after the designer workload block and before the role badge `<span>`, add:

```tsx
{profile.role === "admin" && (
  <ReportsToSelect
    memberId={m.id}
    currentManagerId={m.managerId ?? null}
    managers={members.filter(
      (p) =>
        (p.role === "lead" || p.role === "admin") &&
        p.id !== m.id
    )}
  />
)}
```

Also add the Radar nav link. Find the nav block (the `<nav>` with Requests / Team / Insights / Ideas links) and add the Radar link after Ideas:

```tsx
<Link
  href="/dashboard/radar"
  className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
>
  Radar
</Link>
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 4: Smoke test**

Run `npm run dev`, navigate to `/dashboard/team` as an admin. Expected:
- "Reports to" dropdown appears for each member
- Change saves without page reload

- [ ] **Step 5: Commit**

```bash
git add components/team/reports-to-select.tsx app/\(dashboard\)/dashboard/team/page.tsx
git commit -m "feat: add Reports-to dropdown on Team page for admin team structure setup"
```

---

## Task 11: Add Radar nav link to remaining pages

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/dashboard/insights/page.tsx`
- Modify: `app/(dashboard)/dashboard/ideas/page.tsx`

Each page already has the same nav block (Requests / Team / Insights / Ideas). Add the Radar link as the fifth item in each.

- [ ] **Step 1: Add Radar link to the main dashboard page**

In `app/(dashboard)/dashboard/page.tsx`, find the `<nav>` block and add after the Ideas link:

```tsx
<Link
  href="/dashboard/radar"
  className="text-sm text-zinc-500 hover:text-zinc-300 px-2 py-1 rounded transition-colors"
>
  Radar
</Link>
```

- [ ] **Step 2: Add Radar link to the Insights page**

In `app/(dashboard)/dashboard/insights/page.tsx`, same change — add after the Ideas link in the `<nav>`.

- [ ] **Step 3: Add Radar link to the Ideas page**

In `app/(dashboard)/dashboard/ideas/page.tsx`, same change.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 5: Smoke test all nav links**

Navigate to `/dashboard`, `/dashboard/insights`, `/dashboard/ideas`. Each should show Radar in the nav. Click Radar — should arrive at `/dashboard/radar` with all panels visible.

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)/dashboard/page.tsx app/\(dashboard\)/dashboard/insights/page.tsx app/\(dashboard\)/dashboard/ideas/page.tsx
git commit -m "feat: add Radar nav link to all dashboard pages"
```

---

## Spec Coverage Self-Review

| Spec requirement | Covered by |
|-----------------|------------|
| Route `/dashboard/radar` | Task 8 |
| Nav link on all pages | Tasks 8, 10, 11 |
| canAction — Design Head sees all | Task 2 (`makeCanAction`) |
| canAction — Team Lead sees reportees | Task 2 (`makeCanAction`) |
| canAction — others read-only | Task 2 (`makeCanAction`) |
| managerId schema | Task 1 |
| Admin "Reports to" UI | Task 10 |
| PATCH manager API | Task 9 |
| Panel 1 — status dots (🟢🟡🔴⚪) | Task 4 |
| Panel 1 — blocked override | Task 2 (`classifyDesignerStatus`) |
| Panel 1 — Nudge action | Task 4 |
| Panel 1 — Mark at-risk action | Task 4 |
| Panel 2 — 4 phase buckets | Task 5 |
| Panel 2 — link to filtered dashboard | Task 5 |
| Panel 3 — stalled 5+ days | Task 6 |
| Panel 3 — sign-off overdue 3+ days | Task 6 |
| Panel 3 — Figma drift unreviewd | Task 6 |
| Panel 3 — "All clear" when empty | Task 6 |
| Panel 4 — shipped last 7 days | Task 7 |
| Panel 4 — full cycle time primary | Task 7 |
| Panel 4 — design/dev collapsed | Task 7 |
| Panel 4 — graceful "—" for missing data | Task 2 (`computeCycleTimes`) |
| Real-time via router.refresh() | Task 3 |
| Pure server-side computation | Task 2 |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run `/autoplan` for full review pipeline, or individual reviews above.
