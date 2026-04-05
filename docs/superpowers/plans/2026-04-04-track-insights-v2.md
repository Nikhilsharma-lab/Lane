# Track & Insights v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Track phase loop (variance feedback to PM), add AI coaching notes to PM calibration, wire up real digest+cron, and unify the Insights page.

**Architecture:** Extract all digest logic into `lib/digest.ts` with a `generateDigestForOrg()` function. A new `weekly_digests` table caches the latest digest per org. A new `InsightsShell` client component lifts coaching state so `DigestPanel` and `PmCalibration` can share it without prop drilling through the server component. Variance is passed as a prop from the server component to `TrackPhasePanel`.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Supabase PostgreSQL, Vercel AI SDK (`generateObject`), Claude claude-3-5-haiku-20241022, Tailwind CSS with warm cream tokens.

---

## File Map

### New files
- `db/schema/weekly_digests.ts` — DB table: one row per org, stores latest DigestResponse as jsonb
- `lib/digest.ts` — shared types + `generateDigestForOrg(orgId)` function
- `components/insights/insights-shell.tsx` — client component lifting coaching state between DigestPanel and PmCalibration

### Modified files
- `db/schema/index.ts` — add `export * from "./weekly_digests"`
- `app/api/digest/route.ts` — thin wrapper: auth + call `generateDigestForOrg` + return
- `app/api/insights/digest/generate/route.ts` — replace stub: iterate all orgs, generate, upsert to weekly_digests
- `components/requests/track-phase-panel.tsx` — accept `initialVariancePercent` prop, show variance+label after save
- `components/insights/pm-calibration.tsx` — accept optional `coaching?: PmCoachingNote[]` prop
- `components/insights/digest-panel.tsx` — accept `initialDigest` + `onCoachingGenerated` callback props
- `app/(dashboard)/dashboard/insights/page.tsx` — fetch weekly_digests, fetch impact record for TrackPhasePanel, pass to InsightsShell; new layout order
- `app/(dashboard)/dashboard/requests/[id]/page.tsx` — fetch impactRecord, pass variancePercent to TrackPhasePanel; remove ImpactPanel import

### Deleted files
- `components/requests/impact-panel.tsx`
- `app/api/requests/[id]/impact/route.ts`

---

## Task 1: weekly_digests DB schema

**Files:**
- Create: `db/schema/weekly_digests.ts`
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

```typescript
// db/schema/weekly_digests.ts
import { pgTable, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organizations } from "./users";

export const weeklyDigests = pgTable("weekly_digests", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  content: jsonb("content").notNull(),
});

export type WeeklyDigestRow = typeof weeklyDigests.$inferSelect;
```

- [ ] **Step 2: Export from schema index**

In `db/schema/index.ts`, add this line at the end:
```typescript
export * from "./weekly_digests";
```

- [ ] **Step 3: Push schema to DB**

```bash
npm run db:push
```

Expected: Drizzle applies the new `weekly_digests` table. No errors.

- [ ] **Step 4: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add db/schema/weekly_digests.ts db/schema/index.ts
git commit -m "feat: add weekly_digests table schema"
```

---

## Task 2: lib/digest.ts — shared types and generateDigestForOrg

**Files:**
- Create: `lib/digest.ts`

This extracts and upgrades the logic from `/api/digest/route.ts`. It adds:
- `impactRecords` join so shipped items show actual impact
- PM calibration calculation (same logic as `/api/pm/calibration`)
- Coaching note generation via Claude (in the same `generateObject` call as the digest)

- [ ] **Step 1: Create lib/digest.ts**

```typescript
// lib/digest.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { db } from "@/db";
import { profiles, requests, assignments, impactRecords } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────────────

export type RecentPrediction = {
  requestId: string;
  requestTitle: string;
  predictedValue: string;
  actualValue: string | null;
  variancePercent: number;
  measuredAt: string | null;
};

export type PmCoachingNote = {
  pmId: string;
  fullName: string;
  note: string;
  avgVariancePercent: number;
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  trend: "improving" | "worsening" | "stable";
  predictionCount: number;
  recent: RecentPrediction[];
};

export type WeeklyDigest = {
  headline: string;
  shippedThisWeek: string;
  teamHealth: string;
  standout: string;
  recommendations: string[];
};

export type DigestResponse = {
  digest: WeeklyDigest;
  pmCoaching: PmCoachingNote[];
};

// ── Internal helpers ─────────────────────────────────────────────────────────

const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function cycleDays(r: { createdAt: Date; updatedAt: Date }): number {
  return Math.round(
    (new Date(r.updatedAt).getTime() - new Date(r.createdAt).getTime()) / 86_400_000
  );
}

function avgCycle(reqs: { createdAt: Date; updatedAt: Date }[]): number | null {
  if (!reqs.length) return null;
  return Math.round(reqs.reduce((s, r) => s + cycleDays(r), 0) / reqs.length);
}

type ImpactRow = typeof impactRecords.$inferSelect;
type RequestRow = typeof requests.$inferSelect;

function buildPmCalibration(
  measured: ImpactRow[],
  orgRequests: RequestRow[]
): {
  avgVariancePercent: number;
  trend: "improving" | "worsening" | "stable";
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  recent: RecentPrediction[];
  predictionCount: number;
} | null {
  if (!measured.length) return null;

  const variances = measured.map((r) => parseFloat(r.variancePercent as string));
  const avgVariance = variances.reduce((s, v) => s + v, 0) / variances.length;

  let trend: "improving" | "worsening" | "stable" = "stable";
  if (measured.length >= 4) {
    const mid = Math.floor(measured.length / 2);
    const firstHalf =
      measured.slice(0, mid).reduce((s, r) => s + Math.abs(parseFloat(r.variancePercent as string)), 0) / mid;
    const secondHalf =
      measured.slice(mid).reduce((s, r) => s + Math.abs(parseFloat(r.variancePercent as string)), 0) /
      (measured.length - mid);
    if (secondHalf < firstHalf - 5) trend = "improving";
    else if (secondHalf > firstHalf + 5) trend = "worsening";
  }

  const label: "well_calibrated" | "over_optimistic" | "under_optimistic" =
    Math.abs(avgVariance) <= 10
      ? "well_calibrated"
      : avgVariance < -10
      ? "over_optimistic"
      : "under_optimistic";

  const recent: RecentPrediction[] = measured
    .slice(-5)
    .reverse()
    .map((r) => {
      const req = orgRequests.find((req) => req.id === r.requestId);
      return {
        requestId: r.requestId,
        requestTitle: req?.title ?? "Unknown request",
        predictedValue: r.predictedValue,
        actualValue: r.actualValue,
        variancePercent: parseFloat(r.variancePercent as string),
        measuredAt: r.measuredAt ? new Date(r.measuredAt).toISOString() : null,
      };
    });

  return {
    avgVariancePercent: Math.round(avgVariance * 10) / 10,
    trend,
    label,
    recent,
    predictionCount: measured.length,
  };
}

// ── generateObject schema ─────────────────────────────────────────────────────

const digestWithCoachingSchema = z.object({
  headline: z.string().describe("One punchy sentence summarising the team's week"),
  shippedThisWeek: z.string().describe(
    "What shipped — list each item with designer name, cycle time, and actual vs predicted impact if available"
  ),
  teamHealth: z.string().describe(
    "Throughput (items shipped), avg cycle time, whether pace is improving or slipping"
  ),
  standout: z.string().describe(
    "Standout performer(s) this week — fastest output, most shipped, or highest-impact work. Name them directly."
  ),
  recommendations: z
    .array(z.string())
    .min(1)
    .max(3)
    .describe("2-3 direct, actionable coaching recommendations"),
  pmCoachingNotes: z
    .array(
      z.object({
        pmId: z.string().describe("Exact pmId string as provided in PM_CALIBRATION"),
        note: z
          .string()
          .describe(
            "1-3 sentence coaching note for this PM based on their prediction accuracy history"
          ),
      })
    )
    .describe("One note per PM listed in PM_CALIBRATION. Empty array if no PM data."),
});

// ── Main export ───────────────────────────────────────────────────────────────

export async function generateDigestForOrg(orgId: string): Promise<DigestResponse> {
  const members = await db.select().from(profiles).where(eq(profiles.orgId, orgId));
  const orgRequests = await db.select().from(requests).where(eq(requests.orgId, orgId));
  const orgReqIds = orgRequests.map((r) => r.id);

  const allAssignments = orgReqIds.length
    ? await db
        .select({
          requestId: assignments.requestId,
          assigneeId: assignments.assigneeId,
          role: assignments.role,
        })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
    : [];

  const allImpactRecords = orgReqIds.length
    ? await db
        .select()
        .from(impactRecords)
        .where(inArray(impactRecords.requestId, orgReqIds))
    : [];

  const memberMap = Object.fromEntries(members.map((m) => [m.id, m.fullName]));

  // Impact map: requestId → impact record (only those with actual values)
  const impactMap = Object.fromEntries(
    allImpactRecords
      .filter((r) => r.actualValue)
      .map((r) => [r.requestId, r])
  );

  // Lead designer per request
  const leadByRequest: Record<string, string> = {};
  for (const a of allAssignments) {
    if (a.role === "lead") leadByRequest[a.requestId] = memberMap[a.assigneeId] ?? "Unknown";
  }

  const now = Date.now();

  const shippedAll = orgRequests.filter(
    (r) => r.status === "shipped" || r.status === "completed" || r.trackStage === "complete"
  );
  const shippedThisWeek = shippedAll.filter(
    (r) => now - new Date(r.updatedAt).getTime() < ONE_WEEK_MS
  );
  const shippedLastWeek = shippedAll.filter((r) => {
    const age = now - new Date(r.updatedAt).getTime();
    return age >= ONE_WEEK_MS && age < TWO_WEEKS_MS;
  });

  const stalledRequests = orgRequests.filter((r) => {
    if (STALL_EXEMPT.has(r.status)) return false;
    return (now - new Date(r.updatedAt).getTime()) / 86_400_000 >= 5;
  });

  const activeByDesigner: Record<string, number> = {};
  for (const a of allAssignments) {
    const req = orgRequests.find((r) => r.id === a.requestId);
    if (!req || STALL_EXEMPT.has(req.status)) continue;
    if (a.role === "lead") {
      activeByDesigner[a.assigneeId] = (activeByDesigner[a.assigneeId] ?? 0) + 1;
    }
  }

  // Shipped items with actual impact for prompt
  const shippedItems = shippedThisWeek.map((r) => {
    const designer = leadByRequest[r.id] ?? "Unassigned";
    const days = cycleDays(r);
    const impact = impactMap[r.id];
    let impactStr = "";
    if (impact) {
      const v = impact.variancePercent ? parseFloat(impact.variancePercent as string) : null;
      impactStr = ` → Actual: ${impact.actualValue}${v !== null ? ` (${v > 0 ? "+" : ""}${v.toFixed(1)}% vs prediction)` : ""}`;
    } else if (r.impactPrediction) {
      impactStr = ` → Predicted: ${r.impactPrediction} (not yet measured)`;
    }
    return `• "${r.title}" — ${designer}, ${days}d cycle time${impactStr}`;
  });

  const designerSummaries = members
    .filter((m) => m.role === "designer" || m.role === "lead")
    .map((m) => {
      const active = activeByDesigner[m.id] ?? 0;
      const shipped = shippedThisWeek.filter(
        (r) => leadByRequest[r.id] === m.fullName
      ).length;
      return `${m.fullName} (${m.role}): ${active} active, ${shipped} shipped this week`;
    });

  const stalledList = stalledRequests.map((r) => {
    const days = Math.floor((now - new Date(r.updatedAt).getTime()) / 86_400_000);
    return `• "${r.title}" — ${leadByRequest[r.id] ?? "Unassigned"}, stuck ${days}d`;
  });

  const shippedThisWeekAvgCycle = avgCycle(shippedThisWeek);
  const shippedLastWeekAvgCycle = avgCycle(shippedLastWeek);
  const throughputTrend =
    shippedLastWeekAvgCycle !== null && shippedThisWeekAvgCycle !== null
      ? shippedThisWeekAvgCycle < shippedLastWeekAvgCycle
        ? "improving (cycle time down)"
        : shippedThisWeekAvgCycle > shippedLastWeekAvgCycle
        ? "slowing (cycle time up)"
        : "steady"
      : "insufficient data for trend";

  // ── PM calibration data ────────────────────────────────────────────────────

  // Group measured records by PM
  const byPm: Record<string, ImpactRow[]> = {};
  for (const rec of allImpactRecords) {
    if (!rec.actualValue || rec.variancePercent === null) continue;
    const req = orgRequests.find((r) => r.id === rec.requestId);
    const pmId = rec.pmId ?? req?.requesterId;
    if (!pmId) continue;
    if (!byPm[pmId]) byPm[pmId] = [];
    byPm[pmId].push(rec);
  }

  type CalibrationEntry = {
    pmId: string;
    fullName: string;
    calibration: NonNullable<ReturnType<typeof buildPmCalibration>>;
  };

  const pmCalibrationData: CalibrationEntry[] = [];
  for (const [pmId, records] of Object.entries(byPm)) {
    const member = members.find((m) => m.id === pmId);
    if (!member) continue;
    const cal = buildPmCalibration(records, orgRequests);
    if (cal) pmCalibrationData.push({ pmId, fullName: member.fullName, calibration: cal });
  }

  // Build prompt lines for PM coaching
  const pmSummaryLines = pmCalibrationData.map(
    ({ pmId, fullName, calibration }) =>
      `pmId: ${pmId} | Name: ${fullName} | ${calibration.predictionCount} predictions | avg variance: ${calibration.avgVariancePercent > 0 ? "+" : ""}${calibration.avgVariancePercent}% | label: ${calibration.label} | trend: ${calibration.trend}`
  );

  // ── Claude call ────────────────────────────────────────────────────────────

  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: digestWithCoachingSchema,
    prompt: `You are a design ops AI writing the weekly digest and PM coaching notes for a design team lead.

TODAY: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

SHIPPED THIS WEEK (${shippedThisWeek.length} items):
${shippedItems.length ? shippedItems.join("\n") : "Nothing shipped this week."}

SHIPPED LAST WEEK: ${shippedLastWeek.length} items
THROUGHPUT TREND: ${throughputTrend}
This week avg cycle: ${shippedThisWeekAvgCycle !== null ? `${shippedThisWeekAvgCycle} days` : "n/a"}
Last week avg cycle: ${shippedLastWeekAvgCycle !== null ? `${shippedLastWeekAvgCycle} days` : "n/a"}

DESIGNER WORKLOAD:
${designerSummaries.length ? designerSummaries.join("\n") : "No designers yet."}

STALLED (5+ days no update):
${stalledList.length ? stalledList.join("\n") : "None."}

TOTAL PIPELINE: ${orgRequests.length} requests

PM_CALIBRATION (for pmCoachingNotes — use exact pmId values):
${pmSummaryLines.length ? pmSummaryLines.join("\n") : "No PM impact data yet — return empty pmCoachingNotes array."}

Write the weekly digest. Be specific — name people and requests. This is a private internal report for the design lead, not a PR document. Flag real problems plainly.

For pmCoachingNotes: write one note per PM in PM_CALIBRATION. Use the exact pmId string. Be direct and actionable in 1-3 sentences.`,
  });

  // ── Merge AI coaching with calculated calibration data ─────────────────────

  const { pmCoachingNotes, ...digestFields } = object;

  const pmCoaching: PmCoachingNote[] = pmCalibrationData.map(({ pmId, fullName, calibration }) => {
    const aiNote = pmCoachingNotes.find((n) => n.pmId === pmId);
    return {
      pmId,
      fullName,
      note: aiNote?.note ?? "Insufficient data for coaching recommendation.",
      avgVariancePercent: calibration.avgVariancePercent,
      label: calibration.label,
      trend: calibration.trend,
      predictionCount: calibration.predictionCount,
      recent: calibration.recent,
    };
  });

  return { digest: digestFields, pmCoaching };
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If `impactRecords` type for `variancePercent` causes issues, it's typed as `numeric` in Drizzle which resolves to `string | null` at runtime — the `parseFloat` calls handle this.

- [ ] **Step 3: Commit**

```bash
git add lib/digest.ts
git commit -m "feat: add lib/digest.ts with generateDigestForOrg (impact data + PM coaching)"
```

---

## Task 3: Thin /api/digest route

**Files:**
- Modify: `app/api/digest/route.ts`

Replace the entire file. Auth + org lookup + call `generateDigestForOrg` + return.

- [ ] **Step 1: Replace app/api/digest/route.ts**

```typescript
// app/api/digest/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateDigestForOrg } from "@/lib/digest";

// Re-export WeeklyDigest so digest-panel.tsx keeps compiling until Task 7 updates it
export type { WeeklyDigest } from "@/lib/digest";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const result = await generateDigestForOrg(profile.orgId);
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/digest/route.ts
git commit -m "refactor: /api/digest now delegates to generateDigestForOrg"
```

---

## Task 4: Real cron endpoint

**Files:**
- Modify: `app/api/insights/digest/generate/route.ts`

Replace the stub. Remove `export const runtime = "edge"` (edge runtime can't use Drizzle).

- [ ] **Step 1: Replace app/api/insights/digest/generate/route.ts**

```typescript
// app/api/insights/digest/generate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, weeklyDigests } from "@/db/schema";
import { generateDigestForOrg } from "@/lib/digest";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const allOrgs = await db.select({ id: organizations.id }).from(organizations);

  const results: { orgId: string; status: string }[] = [];

  for (const org of allOrgs) {
    try {
      const digestResponse = await generateDigestForOrg(org.id);

      await db
        .insert(weeklyDigests)
        .values({
          orgId: org.id,
          generatedAt: new Date(),
          content: digestResponse as unknown as Record<string, unknown>,
        })
        .onConflictDoUpdate({
          target: weeklyDigests.orgId,
          set: {
            generatedAt: new Date(),
            content: digestResponse as unknown as Record<string, unknown>,
          },
        });

      results.push({ orgId: org.id, status: "ok" });
    } catch (err) {
      console.error(`[cron] Digest generation failed for org ${org.id}:`, err);
      results.push({ orgId: org.id, status: `error: ${String(err)}` });
    }
  }

  return NextResponse.json({ ok: true, firedAt: new Date().toISOString(), results });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/insights/digest/generate/route.ts
git commit -m "feat: wire up Friday digest cron — generates and stores per org"
```

---

## Task 5: TrackPhasePanel variance display

**Files:**
- Modify: `components/requests/track-phase-panel.tsx`
- Modify: `app/(dashboard)/dashboard/requests/[id]/page.tsx`

Add `initialVariancePercent` prop. Show variance + label block after impact is logged (on mount if already exists, and immediately after save).

- [ ] **Step 1: Update TrackPhasePanel**

Replace the entire file:

```typescript
// components/requests/track-phase-panel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  requestId: string;
  trackStage: "measuring" | "complete";
  impactMetric: string | null;
  impactPrediction: string | null;
  impactActual: string | null;
  initialVariancePercent: number | null;
}

function varianceConfig(v: number): { label: string; style: string } {
  const abs = Math.abs(v);
  if (abs <= 10)
    return {
      label: "Well-calibrated",
      style: "text-[#2E5339] bg-[#2E5339]/10 border-[#2E5339]/20",
    };
  if (v < -10)
    return {
      label: "Over-optimistic",
      style: "text-red-600 bg-red-500/10 border-red-500/20",
    };
  return {
    label: "Under-optimistic",
    style: "text-amber-600 bg-amber-500/10 border-amber-500/20",
  };
}

export function TrackPhasePanel({
  requestId,
  trackStage,
  impactMetric,
  impactPrediction,
  impactActual,
  initialVariancePercent,
}: Props) {
  const router = useRouter();
  const [actual, setActual] = useState(impactActual ?? "");
  const [optimisticActual, setOptimisticActual] = useState<string | null>(impactActual);
  const [variancePercent, setVariancePercent] = useState<number | null>(initialVariancePercent);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!actual.trim()) return;
    const previousActual = optimisticActual;
    const previousVariance = variancePercent;
    setOptimisticActual(actual.trim());
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/impact-record`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualValue: actual.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOptimisticActual(previousActual);
        setVariancePercent(previousVariance);
        setError(data.error ?? "Failed to save");
      } else {
        if (typeof data.variancePercent === "number") {
          setVariancePercent(data.variancePercent);
        }
        router.refresh();
      }
    } catch {
      setOptimisticActual(previousActual);
      setVariancePercent(previousVariance);
      setError("Network error");
    }
  }

  async function markComplete() {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/advance-phase`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed to complete");
      else router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setCompleting(false);
    }
  }

  const isComplete = trackStage === "complete";
  const vcfg = variancePercent !== null ? varianceConfig(variancePercent) : null;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Phase 4 — Track
        </span>
        <span
          className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
            isComplete
              ? "text-[#2E5339] bg-[#2E5339]/10 border-[#2E5339]/20"
              : "text-amber-600 bg-amber-500/10 border-amber-500/20"
          }`}
        >
          {isComplete ? "Complete" : "Measuring"}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Metric */}
        {impactMetric && (
          <div>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Metric</p>
            <p className="text-xs text-[var(--text-primary)]">{impactMetric}</p>
          </div>
        )}

        {/* Predicted */}
        {impactPrediction && (
          <div>
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Predicted</p>
            <p className="text-xs text-[var(--text-secondary)]">{impactPrediction}</p>
          </div>
        )}

        {/* Actual result */}
        <div>
          <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">Actual result</p>
          {isComplete ? (
            <p className="text-xs text-[var(--text-primary)]">{optimisticActual ?? "—"}</p>
          ) : (
            <div className="space-y-2">
              {optimisticActual && (
                <p className="text-xs text-[var(--text-primary)]">{optimisticActual}</p>
              )}
              <input
                type="text"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
                placeholder="e.g. +4.2% retention"
                className="w-full bg-[var(--bg-subtle)] border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-strong)] transition-colors"
              />
              <button
                onClick={handleSave}
                disabled={!actual.trim()}
                className="text-xs bg-[var(--bg-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          )}
        </div>

        {/* Accuracy block — shown when variance is known */}
        {vcfg && optimisticActual && (
          <div className="border border-[var(--border)] rounded-lg px-4 py-3 space-y-2.5 bg-[var(--bg-subtle)]">
            <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide">Accuracy</p>
            {impactPrediction && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--text-tertiary)]">Predicted</span>
                <span className="font-mono text-[var(--text-secondary)]">{impactPrediction}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--text-tertiary)]">Variance</span>
              <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${vcfg.style}`}>
                {variancePercent! > 0 ? "+" : ""}
                {variancePercent!.toFixed(1)}%
              </span>
            </div>
            <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border font-medium ${vcfg.style}`}>
              {vcfg.label}
            </span>
          </div>
        )}

        {/* Mark complete */}
        {!isComplete && optimisticActual && (
          <button
            onClick={markComplete}
            disabled={completing}
            className="text-xs bg-[var(--bg-hover)] hover:bg-[var(--border)] text-[var(--text-primary)] px-3 py-1.5 rounded-lg border border-[var(--border)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {completing && (
              <span className="w-3 h-3 border border-[var(--text-secondary)] border-t-transparent rounded-full animate-spin" />
            )}
            Mark complete
          </button>
        )}

        {isComplete && (
          <div className="bg-[#2E5339]/5 border border-[#2E5339]/15 rounded-lg px-3 py-2 flex items-center gap-2">
            <span className="text-[#2E5339] text-xs">✓</span>
            <p className="text-[11px] text-[#2E5339]/80">Impact recorded — request complete</p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fetch impactRecord in the request detail page and pass variancePercent**

In `app/(dashboard)/dashboard/requests/[id]/page.tsx`:

Add the import at the top with other schema imports:
```typescript
import { impactRecords } from "@/db/schema";
```

After the existing `const [request] = ...` fetch (around line 76), add:
```typescript
// Fetch impact record for variance display in track phase
const [impactRecord] = request.phase === "track"
  ? await db.select().from(impactRecords).where(eq(impactRecords.requestId, id))
  : [undefined];
const initialVariancePercent = impactRecord?.variancePercent
  ? parseFloat(impactRecord.variancePercent as string)
  : null;
```

Then update the `<TrackPhasePanel>` usage (around line 499):
```tsx
<TrackPhasePanel
  requestId={request.id}
  trackStage={(request.trackStage ?? "measuring") as "measuring" | "complete"}
  impactMetric={request.impactMetric}
  impactPrediction={request.impactPrediction}
  impactActual={request.impactActual}
  initialVariancePercent={initialVariancePercent}
/>
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/requests/track-phase-panel.tsx app/(dashboard)/dashboard/requests/[id]/page.tsx
git commit -m "feat: TrackPhasePanel shows variance + calibration label after impact logged"
```

---

## Task 6: PmCalibration — accept optional coaching prop

**Files:**
- Modify: `components/insights/pm-calibration.tsx`

Add `coaching?: PmCoachingNote[]` prop. When provided, skip the `/api/pm/calibration` fetch and use the passed data instead.

- [ ] **Step 1: Update pm-calibration.tsx**

Replace the entire file:

```typescript
// components/insights/pm-calibration.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { PmCoachingNote, RecentPrediction } from "@/lib/digest";

// Re-export types the parent may use
export type { PmCoachingNote };

// Legacy shape from /api/pm/calibration (used when coaching prop is not provided)
interface LegacyCalibration {
  pmId: string;
  fullName: string;
  role: string | null;
  predictionCount: number;
  avgVariancePercent: number;
  trend: "improving" | "worsening" | "stable";
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  recent: RecentPrediction[];
}

interface Props {
  coaching?: PmCoachingNote[];
}

const LABEL_CONFIG: Record<
  "well_calibrated" | "over_optimistic" | "under_optimistic",
  { text: string; style: string; desc: string }
> = {
  well_calibrated: {
    text: "Well-calibrated",
    style: "text-[#2E5339] bg-[#2E5339]/10 border-[#2E5339]/20",
    desc: "Predictions within ±10%",
  },
  over_optimistic: {
    text: "Over-optimistic",
    style: "text-red-600 bg-red-500/10 border-red-500/20",
    desc: "Consistently predicts more than delivered",
  },
  under_optimistic: {
    text: "Under-optimistic",
    style: "text-amber-600 bg-amber-500/10 border-amber-500/20",
    desc: "Consistently delivers more than predicted",
  },
};

const TREND_ICONS = { improving: "↑", worsening: "↓", stable: "→" };
const TREND_COLORS = {
  improving: "text-[#2E5339]",
  worsening: "text-red-600",
  stable: "text-[var(--text-secondary)]",
};

function VariancePill({ v }: { v: number }) {
  const abs = Math.abs(v);
  const color =
    abs <= 10
      ? "text-[#2E5339] bg-[#2E5339]/10 border-[#2E5339]/20"
      : abs <= 25
      ? "text-amber-600 bg-amber-500/10 border-amber-500/20"
      : "text-red-600 bg-red-500/10 border-red-500/20";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${color}`}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

// Normalise LegacyCalibration or PmCoachingNote to a common display shape
type DisplayEntry = {
  pmId: string;
  fullName: string;
  predictionCount: number;
  avgVariancePercent: number;
  trend: "improving" | "worsening" | "stable";
  label: "well_calibrated" | "over_optimistic" | "under_optimistic";
  recent: RecentPrediction[];
  note?: string;
};

function fromCoachingNote(c: PmCoachingNote): DisplayEntry {
  return { ...c, note: c.note };
}

function fromLegacy(c: LegacyCalibration): DisplayEntry {
  return { ...c };
}

export function PmCalibration({ coaching }: Props) {
  const [entries, setEntries] = useState<DisplayEntry[]>(
    coaching ? coaching.map(fromCoachingNote) : []
  );
  const [loading, setLoading] = useState(!coaching);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Only fetch from API when coaching prop is not provided
  useEffect(() => {
    if (coaching) return;
    fetch("/api/pm/calibration")
      .then((r) => r.json())
      .then((d: { calibrations: LegacyCalibration[] }) =>
        setEntries((d.calibrations ?? []).map(fromLegacy))
      )
      .finally(() => setLoading(false));
  }, [coaching]);

  // If coaching prop updates (digest regenerated), sync entries
  useEffect(() => {
    if (!coaching) return;
    setEntries(coaching.map(fromCoachingNote));
    setLoading(false);
  }, [coaching]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="w-3 h-3 border border-[var(--border-strong)] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-[var(--text-tertiary)]">Loading calibration data...</span>
      </div>
    );
  }

  if (!entries.length) {
    return (
      <div className="border border-[var(--border)] rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">No impact data yet</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          PM calibration scores appear after impact is logged on completed requests
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((c) => {
        const cfg = LABEL_CONFIG[c.label];
        const isExpanded = expanded === c.pmId;

        return (
          <div key={c.pmId} className="border border-[var(--border)] rounded-xl overflow-hidden">
            <button
              onClick={() => setExpanded(isExpanded ? null : c.pmId)}
              className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[var(--bg-subtle)] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-[var(--text-primary)] font-medium">{c.fullName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cfg.style}`}>
                    {cfg.text}
                  </span>
                  <span className={`text-xs font-medium ${TREND_COLORS[c.trend]}`}>
                    {TREND_ICONS[c.trend]}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {c.predictionCount} prediction{c.predictionCount !== 1 ? "s" : ""} · {cfg.desc}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <VariancePill v={c.avgVariancePercent} />
                <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">avg variance</p>
              </div>
              <span className="text-[var(--text-tertiary)] text-xs shrink-0">
                {isExpanded ? "▲" : "▼"}
              </span>
            </button>

            {isExpanded && (
              <div className="border-t border-[var(--border)]">
                {/* AI coaching note */}
                {c.note && (
                  <div className="px-5 py-3 bg-[var(--bg-subtle)]">
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1.5">
                      Coaching
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
                      &ldquo;{c.note}&rdquo;
                    </p>
                  </div>
                )}

                {/* Recent predictions */}
                {c.recent.length > 0 && (
                  <div className="divide-y divide-[var(--border)]">
                    {c.recent.map((p) => (
                      <div key={p.requestId} className="px-5 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/dashboard/requests/${p.requestId}`}
                            className="text-xs text-[var(--text-primary)] hover:text-[var(--text-primary)] transition-colors truncate block"
                          >
                            {p.requestTitle}
                          </Link>
                          <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                            Predicted{" "}
                            <span className="text-[var(--text-secondary)]">{p.predictedValue}</span>
                            {" · "}
                            Actual{" "}
                            <span className="text-[var(--text-secondary)]">
                              {p.actualValue ?? "—"}
                            </span>
                          </p>
                        </div>
                        <VariancePill v={p.variancePercent} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[10px] text-[var(--text-tertiary)] text-center pt-1">
        Variance = (actual − predicted) / |predicted| × 100
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add components/insights/pm-calibration.tsx
git commit -m "feat: PmCalibration accepts coaching prop + renders AI coaching notes"
```

---

## Task 7: DigestPanel upgrade + InsightsShell

**Files:**
- Modify: `components/insights/digest-panel.tsx`
- Create: `components/insights/insights-shell.tsx`

`DigestPanel` now accepts `initialDigest` and `onCoachingGenerated` callback. `InsightsShell` is a new client component that lifts the `pmCoaching` state so `DigestPanel` and `PmCalibration` can share it as siblings.

- [ ] **Step 1: Replace digest-panel.tsx**

```typescript
// components/insights/digest-panel.tsx
"use client";

import { useState } from "react";
import type { WeeklyDigest, PmCoachingNote } from "@/lib/digest";

interface Props {
  initialDigest?: WeeklyDigest | null;
  onCoachingGenerated: (notes: PmCoachingNote[]) => void;
}

export function DigestPanel({ initialDigest, onCoachingGenerated }: Props) {
  const [digest, setDigest] = useState<WeeklyDigest | null>(initialDigest ?? null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/digest");
      const data: { digest: WeeklyDigest; pmCoaching: PmCoachingNote[] } = await res.json();
      setDigest(data.digest);
      onCoachingGenerated(data.pmCoaching);
    } finally {
      setLoading(false);
    }
  }

  if (!digest && !loading) {
    return (
      <div className="border border-[var(--border)] rounded-xl p-8 text-center">
        <p className="text-sm text-[var(--text-secondary)] mb-1">
          AI reads your pipeline and writes the digest
        </p>
        <p className="text-xs text-[var(--text-tertiary)] mb-5">
          Shipped this week, cycle times, standout performers, coaching recommendations
        </p>
        <button
          onClick={generate}
          className="bg-[var(--accent)] text-[var(--accent-text)] rounded-lg px-4 py-2 text-sm font-medium transition-colors"
        >
          ✦ Generate digest
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border border-[var(--border)] rounded-xl p-8">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
          <span className="text-sm text-[var(--text-secondary)]">Reading the pipeline…</span>
        </div>
      </div>
    );
  }

  if (!digest) return null;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      {/* Headline */}
      <div className="px-5 py-4 bg-[var(--accent-subtle)] border-b border-[var(--accent)]/15">
        <p className="text-[10px] text-[var(--accent)] uppercase tracking-wide font-medium mb-1">
          ✦ Weekly design digest
        </p>
        <p className="text-sm text-[var(--text-primary)] font-medium leading-snug">
          {digest.headline}
        </p>
      </div>

      <div className="divide-y divide-[var(--border)]">
        <div className="px-5 py-4">
          <p className="text-[10px] text-[#2E5339] uppercase tracking-wide font-medium mb-2">
            🚢 Shipped this week
          </p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
            {digest.shippedThisWeek}
          </p>
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wide font-medium mb-2">
            🧠 Team health
          </p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{digest.teamHealth}</p>
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] text-[#D4A84B] uppercase tracking-wide font-medium mb-2">
            ⭐ Standout
          </p>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{digest.standout}</p>
        </div>

        <div className="px-5 py-4">
          <p className="text-[10px] text-amber-600 uppercase tracking-wide font-medium mb-2">
            💡 Recommendations
          </p>
          <ul className="space-y-1.5">
            {digest.recommendations.map((rec, i) => (
              <li
                key={i}
                className="text-sm text-[var(--text-secondary)] leading-relaxed flex gap-2"
              >
                <span className="text-amber-500/60 shrink-0">{i + 1}.</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="border-t border-[var(--border)] px-5 py-3 flex items-center justify-between">
        <span className="text-[10px] text-[var(--text-tertiary)]">
          Generated by Claude ·{" "}
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
        </span>
        <button
          onClick={generate}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create InsightsShell**

```typescript
// components/insights/insights-shell.tsx
"use client";

import { useState } from "react";
import { DigestPanel } from "./digest-panel";
import { PmCalibration } from "./pm-calibration";
import type { WeeklyDigest, PmCoachingNote } from "@/lib/digest";

interface Props {
  initialDigest?: WeeklyDigest | null;
  initialPmCoaching?: PmCoachingNote[] | null;
}

export function InsightsShell({ initialDigest, initialPmCoaching }: Props) {
  const [pmCoaching, setPmCoaching] = useState<PmCoachingNote[] | null>(
    initialPmCoaching ?? null
  );

  return (
    <>
      {/* Weekly digest */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
          Weekly digest
        </h2>
        <DigestPanel
          initialDigest={initialDigest}
          onCoachingGenerated={setPmCoaching}
        />
      </section>

      {/* PM calibration */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
          PM calibration
        </h2>
        <PmCalibration coaching={pmCoaching ?? undefined} />
      </section>
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add components/insights/digest-panel.tsx components/insights/insights-shell.tsx
git commit -m "feat: DigestPanel + InsightsShell share pmCoaching state"
```

---

## Task 8: Insights page server component

**Files:**
- Modify: `app/(dashboard)/dashboard/insights/page.tsx`

Query `weekly_digests`. Pass stored digest data to `InsightsShell`. New section order: InsightsShell → Pipeline → Team.

- [ ] **Step 1: Replace app/(dashboard)/dashboard/insights/page.tsx**

```typescript
// app/(dashboard)/dashboard/insights/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import {
  profiles,
  requests,
  requestAiAnalysis,
  assignments,
  projects,
  weeklyDigests,
} from "@/db/schema";
import { eq, inArray, count, and, isNull } from "drizzle-orm";
import { InsightsShell } from "@/components/insights/insights-shell";
import type { DigestResponse } from "@/lib/digest";

const STALL_EXEMPT = new Set(["draft", "completed", "shipped", "blocked"]);
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default async function InsightsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  // Fetch stored digest (if fresh enough)
  const [storedDigestRow] = await db
    .select()
    .from(weeklyDigests)
    .where(eq(weeklyDigests.orgId, profile.orgId));

  const isStoredFresh =
    storedDigestRow &&
    Date.now() - new Date(storedDigestRow.generatedAt).getTime() < SEVEN_DAYS_MS;

  const storedDigestData = isStoredFresh
    ? (storedDigestRow.content as DigestResponse)
    : null;

  // Pipeline data
  const members = await db.select().from(profiles).where(eq(profiles.orgId, profile.orgId));
  const orgRequests = await db.select().from(requests).where(eq(requests.orgId, profile.orgId));
  const orgReqIds = orgRequests.map((r) => r.id);

  const triageRows = orgReqIds.length
    ? await db
        .select({
          requestId: requestAiAnalysis.requestId,
          qualityScore: requestAiAnalysis.qualityScore,
        })
        .from(requestAiAnalysis)
        .where(inArray(requestAiAnalysis.requestId, orgReqIds))
    : [];

  const workloadRows = orgReqIds.length
    ? await db
        .select({ assigneeId: assignments.assigneeId, cnt: count() })
        .from(assignments)
        .where(inArray(assignments.requestId, orgReqIds))
        .groupBy(assignments.assigneeId)
    : [];

  const workloadMap = Object.fromEntries(workloadRows.map((w) => [w.assigneeId, Number(w.cnt)]));

  const now = Date.now();
  const stalledCount = orgRequests.filter((r) => {
    if (STALL_EXEMPT.has(r.status)) return false;
    return (now - new Date(r.updatedAt).getTime()) / 86_400_000 >= 5;
  }).length;

  const statusCounts: Record<string, number> = {};
  for (const r of orgRequests) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  const avgQuality = triageRows.length
    ? Math.round(triageRows.reduce((s, t) => s + t.qualityScore, 0) / triageRows.length)
    : null;

  const qualityByPM: Record<string, { total: number; count: number }> = {};
  for (const t of triageRows) {
    const req = orgRequests.find((r) => r.id === t.requestId);
    if (!req) continue;
    if (!qualityByPM[req.requesterId]) qualityByPM[req.requesterId] = { total: 0, count: 0 };
    qualityByPM[req.requesterId].total += t.qualityScore;
    qualityByPM[req.requesterId].count += 1;
  }

  const shippedCount = orgRequests.filter(
    (r) => r.status === "shipped" || r.status === "completed"
  ).length;
  const activeCount = orgRequests.filter(
    (r) => !STALL_EXEMPT.has(r.status) && r.status !== "submitted"
  ).length;

  const STATUS_ORDER = [
    "submitted",
    "triaged",
    "assigned",
    "in_progress",
    "in_review",
    "blocked",
    "completed",
    "shipped",
    "draft",
  ];
  const STATUS_COLORS: Record<string, string> = {
    submitted: "bg-blue-500/60",
    triaged: "bg-[#A394C7]/60",
    assigned: "bg-[#D4A84B]/60",
    in_progress: "bg-[#2E5339]/60",
    in_review: "bg-[#7DA5C4]/60",
    blocked: "bg-red-500/60",
    completed: "bg-[var(--border-strong)]",
    shipped: "bg-[var(--accent)]/40",
    draft: "bg-[var(--bg-hover)]",
  };

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
      {/* Digest + PM calibration (client shell with shared coaching state) */}
      <InsightsShell
        initialDigest={storedDigestData?.digest}
        initialPmCoaching={storedDigestData?.pmCoaching}
      />

      {/* Pipeline metrics */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
          Pipeline
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Metric label="Total requests" value={orgRequests.length} />
          <Metric label="Active" value={activeCount} />
          <Metric
            label="Stalled"
            value={stalledCount}
            color={stalledCount > 0 ? "text-amber-600" : undefined}
          />
          <Metric label="Shipped" value={shippedCount} color="text-[#2E5339]" />
        </div>
      </section>

      {/* Status breakdown */}
      <section>
        <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
          Status breakdown
        </h2>
        <div className="border border-[var(--border)] rounded-xl p-5 space-y-3">
          {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => {
            const cnt = statusCounts[s] ?? 0;
            const pct = Math.round((cnt / orgRequests.length) * 100);
            return (
              <div key={s} className="flex items-center gap-3">
                <span className="text-xs text-[var(--text-secondary)] w-20 capitalize shrink-0">
                  {s.replace(/_/g, " ")}
                </span>
                <div className="flex-1 bg-[var(--bg-hover)] rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${STATUS_COLORS[s]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--text-secondary)] w-6 text-right shrink-0">
                  {cnt}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* PM request quality */}
      {Object.keys(qualityByPM).length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
            PM request quality
          </h2>
          <div className="space-y-2">
            {members
              .filter((m) => qualityByPM[m.id])
              .sort((a, b) => {
                const qa = qualityByPM[a.id];
                const qb = qualityByPM[b.id];
                return qb.total / qb.count - qa.total / qa.count;
              })
              .map((m) => {
                const q = qualityByPM[m.id];
                const avg = Math.round(q.total / q.count);
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 border border-[var(--border)] rounded-xl px-5 py-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{m.fullName}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {q.count} request{q.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-[var(--bg-hover)] rounded-full h-1.5">
                        <div
                          className={`h-full rounded-full ${
                            avg >= 80
                              ? "bg-[#2E5339]/70"
                              : avg >= 50
                              ? "bg-[#D4A84B]/70"
                              : "bg-red-500/70"
                          }`}
                          style={{ width: `${avg}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-mono w-14 text-right ${
                          avg >= 80
                            ? "text-[#2E5339]"
                            : avg >= 50
                            ? "text-[#D4A84B]"
                            : "text-red-600"
                        }`}
                      >
                        {avg}/100
                      </span>
                    </div>
                  </div>
                );
              })}
            {avgQuality !== null && (
              <p className="text-xs text-[var(--text-tertiary)] pt-1">
                Org avg quality score: {avgQuality}/100
              </p>
            )}
          </div>
        </section>
      )}

      {/* Designer workload */}
      {workloadRows.length > 0 && (
        <section>
          <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">
            Designer workload
          </h2>
          <div className="space-y-2">
            {members
              .filter(
                (m) =>
                  (m.role === "designer" || m.role === "lead") &&
                  workloadMap[m.id] !== undefined
              )
              .sort((a, b) => (workloadMap[b.id] ?? 0) - (workloadMap[a.id] ?? 0))
              .map((m) => {
                const load = workloadMap[m.id] ?? 0;
                const maxLoad = Math.max(...Object.values(workloadMap), 1);
                const isOverloaded = load >= 4;
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-3 border border-[var(--border)] rounded-xl px-5 py-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm text-[var(--text-primary)]">{m.fullName}</p>
                      <p className="text-xs text-[var(--text-tertiary)] capitalize">{m.role}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-24 bg-[var(--bg-hover)] rounded-full h-1.5">
                        <div
                          className={`h-full rounded-full ${
                            isOverloaded ? "bg-red-500/70" : "bg-[#D4A84B]/60"
                          }`}
                          style={{ width: `${Math.min((load / maxLoad) * 100, 100)}%` }}
                        />
                      </div>
                      <span
                        className={`text-xs font-mono w-20 text-right ${
                          isOverloaded ? "text-red-600" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {load} active{isOverloaded ? " ⚠" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="border border-[var(--border)] rounded-xl px-5 py-4">
      <p className="text-xs text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${color ?? "text-[var(--text-primary)]"}`}>
        {value}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/dashboard/insights/page.tsx
git commit -m "feat: Insights page queries weekly_digests, new layout with InsightsShell"
```

---

## Task 9: Cleanup — remove ImpactPanel and legacy impact route

**Files:**
- Delete: `components/requests/impact-panel.tsx`
- Delete: `app/api/requests/[id]/impact/route.ts`
- Modify: `app/(dashboard)/dashboard/requests/[id]/page.tsx`

- [ ] **Step 1: Remove ImpactPanel import from request detail page**

In `app/(dashboard)/dashboard/requests/[id]/page.tsx`, delete this line:
```typescript
import { ImpactPanel } from "@/components/requests/impact-panel";
```

Then find any JSX rendering `<ImpactPanel` and remove that block. Search for `ImpactPanel` in the file to confirm it's only used in the import and one render site.

- [ ] **Step 2: Delete the files**

```bash
rm components/requests/impact-panel.tsx
rm app/api/requests/[id]/impact/route.ts
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: 0 errors. If any error references `ImpactPanel` or `/impact`, that's a missed import — remove it.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "cleanup: remove ImpactPanel and legacy /impact route (replaced by TrackPhasePanel)"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: Build completes. Note any warnings but don't fail on them.

- [ ] **Step 3: Manual browser verification checklist**

Open `npm run dev` and verify:

1. `/dashboard/requests/[id]` on a request in **track** phase:
   - "Phase 4 — Track" panel visible
   - After entering actual value and saving: Accuracy block appears with variance % and label
   - Label color: green (±10%), red (over-optimistic), amber (under-optimistic)

2. `/dashboard/insights`:
   - Page loads with Pipeline + Team sections immediately (server-rendered)
   - Digest section shows "Generate digest" button (or stored digest if one exists)
   - Clicking "Generate digest" shows spinner then renders digest
   - PM calibration section appears below digest
   - Expanding a PM card shows coaching note (if PM has impact records)

3. `/api/insights/digest/generate` (GET, no auth in dev):
   - Returns `{ ok: true, firedAt: "...", results: [...] }`
   - Check `weekly_digests` table in Supabase dashboard — row should appear

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Track & Insights v2 complete — variance display, PM coaching, digest cron"
```
