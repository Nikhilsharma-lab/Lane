# KF5 Impact Intelligence — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three AI-powered impact features — prediction confidence scoring before the bet, design ROI by request type on the insights page, and a retrospective brief after impact is logged.

**Architecture:** Three independent sub-features (SA1, SA2, SA3). SA1 and SA2 run in parallel after the migration. SA3 runs after SA1 completes (it reads SA1's schema in track-phase-panel). Each follows the established lazy-generation pattern: POST on first mount, cached in DB forever via `onConflictDoNothing`, silent fail.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM (Supabase/Postgres), Claude Haiku via Vercel AI SDK (`generateObject` + Zod), Tailwind CSS tokens from DESIGN.md.

---

## File Map

### Created by SA1
- `db/schema/prediction_confidence.ts` — Drizzle table + exported types
- `lib/ai/prediction-confidence.ts` — `generatePredictionConfidence()` function
- `app/api/requests/[id]/prediction-confidence/route.ts` — POST (generate + cache) + GET (fetch)
- `components/requests/prediction-confidence-panel.tsx` — UI: score ring, label, rationale, red flags

### Modified by SA1
- `db/schema/index.ts` — add `prediction_confidence` export
- `components/requests/predesign-panel.tsx` — add 3 new props; render panel at shape stage
- `app/(dashboard)/dashboard/requests/[id]/page.tsx` — fetch confidence record; pass to PredesignPanel

### Created by SA2 (parallel with SA1)
- `app/api/insights/design-roi/route.ts` — GET aggregation query
- `components/insights/design-roi.tsx` — compact table UI

### Modified by SA2
- `app/(dashboard)/dashboard/insights/page.tsx` — add `<DesignRoi />` after PM Calibration section

### Created by SA3 (after SA1)
- `db/schema/impact_retrospectives.ts` — Drizzle table + exported types
- `lib/ai/impact-retrospective.ts` — `generateImpactRetrospective()` function
- `app/api/requests/[id]/impact-retrospective/route.ts` — POST (generate + cache) + GET (fetch)
- `components/requests/impact-retrospective-panel.tsx` — UI: headline, what happened, reasons, suggestion, celebrate

### Modified by SA3
- `db/schema/index.ts` — add `impact_retrospectives` export
- `components/requests/track-phase-panel.tsx` — add 3 new props; render confidence badge + retrospective panel
- `app/(dashboard)/dashboard/requests/[id]/page.tsx` — fetch both confidence + retrospective records; pass to TrackPhasePanel

---

## Task 0: DB Migration (run before SA1 and SA3)

**Files:**
- Create: `db/migrations/0008_kf5_impact_intelligence.sql` (or use drizzle-kit push)

- [ ] **Step 1: Create `db/schema/prediction_confidence.ts`**

```ts
// db/schema/prediction_confidence.ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const predictionConfidence = pgTable("prediction_confidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  label: text("label").notNull(),     // realistic | optimistic | vague | unmeasurable
  rationale: text("rationale").notNull(),
  redFlags: jsonb("red_flags").$type<string[]>().notNull().default([]),
  suggestion: text("suggestion"),
  aiModel: text("ai_model"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PredictionConfidence = typeof predictionConfidence.$inferSelect;
export type NewPredictionConfidence = typeof predictionConfidence.$inferInsert;
```

- [ ] **Step 2: Create `db/schema/impact_retrospectives.ts`**

```ts
// db/schema/impact_retrospectives.ts
import { pgTable, uuid, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { requests } from "./requests";

export const impactRetrospectives = pgTable("impact_retrospectives", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .unique()
    .references(() => requests.id, { onDelete: "cascade" }),
  headline: text("headline").notNull(),
  whatHappened: text("what_happened").notNull(),
  likelyReasons: jsonb("likely_reasons").$type<string[]>().notNull().default([]),
  nextTimeSuggestion: text("next_time_suggestion").notNull(),
  celebrate: text("celebrate"),
  aiModel: text("ai_model"),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ImpactRetrospective = typeof impactRetrospectives.$inferSelect;
export type NewImpactRetrospective = typeof impactRetrospectives.$inferInsert;
```

- [ ] **Step 3: Add exports to `db/schema/index.ts`**

Add these two lines to the existing exports in `db/schema/index.ts`:
```ts
export * from "./prediction_confidence";
export * from "./impact_retrospectives";
```

- [ ] **Step 4: Push schema to database**

```bash
cd ~/Lane && npx drizzle-kit push
```

Expected: two new tables created — `prediction_confidence` and `impact_retrospectives`. No errors.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add db/schema/prediction_confidence.ts db/schema/impact_retrospectives.ts db/schema/index.ts
git commit -m "feat: add prediction_confidence and impact_retrospectives schema tables (KF5)"
```

---

## Task 1: SA1 — Prediction Confidence Score

**Files:**
- Create: `lib/ai/prediction-confidence.ts`
- Create: `app/api/requests/[id]/prediction-confidence/route.ts`
- Create: `components/requests/prediction-confidence-panel.tsx`
- Modify: `components/requests/predesign-panel.tsx`
- Modify: `app/(dashboard)/dashboard/requests/[id]/page.tsx`

- [ ] **Step 1: Create `lib/ai/prediction-confidence.ts`**

```ts
// lib/ai/prediction-confidence.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const predictionConfidenceSchema = z.object({
  score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe(
      "0-100 confidence that this prediction will be measurable and approximately correct. 70+ = realistic, 40-69 = optimistic, 20-39 = vague, 0-19 = unmeasurable."
    ),
  label: z
    .enum(["realistic", "optimistic", "vague", "unmeasurable"])
    .describe(
      "realistic: specific, grounded, achievable. optimistic: directionally right but overstated. vague: metric or value too fuzzy to measure. unmeasurable: no clear metric that could be measured post-ship."
    ),
  rationale: z
    .string()
    .describe(
      "2-3 sentences explaining the score. Reference specific words or numbers from the prediction. Be direct — this is a coaching note for the PM, not a generic disclaimer."
    ),
  redFlags: z
    .array(z.string())
    .describe(
      "0-3 specific problems with this prediction. Each item should name the concrete issue (e.g. 'No baseline provided — +5% of what?', 'Retention is not directly measurable from this feature'). Empty array if the prediction is solid."
    ),
  suggestion: z
    .string()
    .describe(
      "One actionable sentence: what the PM should change to make this prediction more credible. Skip if the prediction is already realistic."
    ),
});

export type PredictionConfidenceResult = z.infer<typeof predictionConfidenceSchema>;

export async function generatePredictionConfidence(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  successMetrics?: string | null;
  impactMetric: string;
  impactPrediction: string;
  requestType?: string | null;
  priority?: string | null;
}): Promise<PredictionConfidenceResult> {
  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: predictionConfidenceSchema,
    prompt: `You are a senior product strategist reviewing a PM's impact prediction before the Design Head places a bet. Your job is to rate how realistic the prediction is — not whether the feature is good, but whether the impact claim is credible and measurable.

---
REQUEST TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}
${input.successMetrics ? `SUCCESS METRICS:\n${input.successMetrics}\n` : ""}
${input.requestType ? `REQUEST TYPE: ${input.requestType}\n` : ""}
${input.priority ? `PRIORITY: ${input.priority}\n` : ""}

IMPACT METRIC: ${input.impactMetric}
IMPACT PREDICTION: ${input.impactPrediction}
---

Common failure modes to check:
- Prediction is directionally correct but the magnitude is unsupported ("10% improvement" with no baseline)
- Metric cannot be attributed to this specific feature (e.g. "increase revenue" for a UI polish task)
- Metric is not measurable post-ship (e.g. "improve team morale")
- Vague language that makes the claim unfalsifiable ("better user experience")
- Overconfident number on a research-stage feature

Rate the prediction honestly. A realistic prediction is specific, grounded, and provably achievable.`,
  });

  return object;
}
```

- [ ] **Step 2: Create `app/api/requests/[id]/prediction-confidence/route.ts`**

```ts
// app/api/requests/[id]/prediction-confidence/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, predictionConfidence } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generatePredictionConfidence } from "@/lib/ai/prediction-confidence";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const [record] = await db
    .select()
    .from(predictionConfidence)
    .where(eq(predictionConfidence.requestId, requestId));

  return NextResponse.json({ confidence: record ?? null });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Return cached record if already generated
  const [existing] = await db
    .select()
    .from(predictionConfidence)
    .where(eq(predictionConfidence.requestId, requestId));
  if (existing) return NextResponse.json({ confidence: existing });

  // Guard: needs both fields to generate
  if (!request.impactMetric || !request.impactPrediction) {
    return NextResponse.json({ error: "Missing impactMetric or impactPrediction" }, { status: 400 });
  }

  try {
    const result = await generatePredictionConfidence({
      title: request.title,
      description: request.description,
      businessContext: request.businessContext,
      successMetrics: request.successMetrics,
      impactMetric: request.impactMetric,
      impactPrediction: request.impactPrediction,
      requestType: request.requestType,
      priority: request.priority,
    });

    const inserted = await db
      .insert(predictionConfidence)
      .values({
        requestId,
        score: result.score,
        label: result.label,
        rationale: result.rationale,
        redFlags: result.redFlags,
        suggestion: result.suggestion,
        aiModel: "claude-3-5-haiku-20241022",
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) {
      const [race] = await db
        .select()
        .from(predictionConfidence)
        .where(eq(predictionConfidence.requestId, requestId));
      return NextResponse.json({ confidence: race });
    }

    return NextResponse.json({ confidence: inserted[0] });
  } catch (err) {
    console.error("[prediction-confidence] AI error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Create `components/requests/prediction-confidence-panel.tsx`**

```tsx
// components/requests/prediction-confidence-panel.tsx
"use client";

import { useEffect, useState } from "react";
import type { PredictionConfidence } from "@/db/schema";

type Props = {
  requestId: string;
  existingConfidence: PredictionConfidence | null;
};

const LABEL_CONFIG: Record<
  string,
  { text: string; ringColor: string; textColor: string; bgColor: string }
> = {
  realistic:     { text: "Realistic prediction",  ringColor: "stroke-green-400",   textColor: "text-green-400",   bgColor: "bg-green-500/5 border-green-500/15" },
  optimistic:    { text: "Over-optimistic",        ringColor: "stroke-amber-400",   textColor: "text-amber-400",   bgColor: "bg-amber-500/5 border-amber-500/15" },
  vague:         { text: "Vague metric",           ringColor: "stroke-orange-400",  textColor: "text-orange-400",  bgColor: "bg-orange-500/5 border-orange-500/15" },
  unmeasurable:  { text: "Unmeasurable",           ringColor: "stroke-red-400",     textColor: "text-red-400",     bgColor: "bg-red-500/5 border-red-500/15" },
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  const cfg = LABEL_CONFIG[label] ?? LABEL_CONFIG.vague;
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const dash = (score / 100) * circumference;

  return (
    <div className="flex items-center gap-3 shrink-0">
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        <circle cx="26" cy="26" r={r} fill="none" stroke="var(--bg-hover)" strokeWidth="4" />
        <circle
          cx="26" cy="26" r={r} fill="none"
          className={cfg.ringColor}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <div>
        <p className={`text-lg font-semibold font-mono leading-none ${cfg.textColor}`}>{score}</p>
        <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">/ 100</p>
      </div>
    </div>
  );
}

export function PredictionConfidencePanel({ requestId, existingConfidence }: Props) {
  const [confidence, setConfidence] = useState<PredictionConfidence | null>(existingConfidence);
  const [loading, setLoading] = useState(existingConfidence === null);

  useEffect(() => {
    if (existingConfidence !== null) return;

    fetch(`/api/requests/${requestId}/prediction-confidence`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => { if (data.confidence) setConfidence(data.confidence); })
      .catch(() => { /* silent fail */ })
      .finally(() => setLoading(false));
  }, [requestId, existingConfidence]);

  if (loading) {
    return (
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            Prediction Confidence
          </span>
        </div>
        <div className="p-4 space-y-3 animate-pulse">
          <div className="flex gap-3">
            <div className="w-13 h-13 rounded-full bg-[var(--bg-hover)]" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-[var(--bg-hover)] rounded w-1/2" />
              <div className="h-3 bg-[var(--bg-hover)] rounded w-3/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!confidence) return null;

  const cfg = LABEL_CONFIG[confidence.label] ?? LABEL_CONFIG.vague;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          Prediction Confidence
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{confidence.aiModel}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Score ring + label */}
        <div className="flex items-center gap-4">
          <ScoreRing score={confidence.score} label={confidence.label} />
          <div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded border ${cfg.bgColor} ${cfg.textColor}`}>
              {cfg.text}
            </span>
            <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">{confidence.rationale}</p>
          </div>
        </div>

        {/* Red flags */}
        {confidence.redFlags.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Issues</div>
            <ul className="space-y-1.5">
              {confidence.redFlags.map((flag, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-red-400 shrink-0">!</span>
                  {flag}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggestion */}
        {confidence.suggestion && (
          <p className="text-xs text-[var(--text-tertiary)] border-t border-[var(--border)] pt-3">
            {confidence.suggestion}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Modify `components/requests/predesign-panel.tsx` — add 3 new props and render panel at shape/bet stages**

Add `impactMetric`, `impactPrediction`, and `existingConfidence` to the `Props` interface and the function signature. Then render `PredictionConfidencePanel` in the panel body when the stage is `shape` or `bet` and both impact fields are set.

Find the `interface Props` block (around line 14) and replace it:

```ts
// OLD
interface Props {
  requestId: string;
  currentStage: PredesignStage;
  description: string | null;
  businessContext: string | null;
  successMetrics: string | null;
  profileRole: string;
}

// NEW
interface Props {
  requestId: string;
  currentStage: PredesignStage;
  description: string | null;
  businessContext: string | null;
  successMetrics: string | null;
  profileRole: string;
  impactMetric: string | null;
  impactPrediction: string | null;
  existingConfidence: import("@/db/schema").PredictionConfidence | null;
}
```

Find the `export function PredesignPanel({` destructuring and add the three new props:

```ts
// OLD
export function PredesignPanel({
  requestId,
  currentStage,
  description,
  businessContext,
  successMetrics,
  profileRole,
}: Props) {

// NEW
export function PredesignPanel({
  requestId,
  currentStage,
  description,
  businessContext,
  successMetrics,
  profileRole,
  impactMetric,
  impactPrediction,
  existingConfidence,
}: Props) {
```

Add the import at the top of the file (after the existing imports):

```ts
import { PredictionConfidencePanel } from "@/components/requests/prediction-confidence-panel";
```

In the JSX, find the `{/* Current stage details */}` section. After the existing stage content div (which ends around `</div>`) and before the gate/advance button block, add:

```tsx
{/* Prediction Confidence — shown at shape and bet stages when prediction is set */}
{(optimisticStage === "shape" || optimisticStage === "bet") &&
  impactMetric &&
  impactPrediction && (
    <PredictionConfidencePanel
      requestId={requestId}
      existingConfidence={existingConfidence}
    />
  )}
```

- [ ] **Step 6: Modify `app/(dashboard)/dashboard/requests/[id]/page.tsx` — fetch confidence + pass to PredesignPanel**

Add `predictionConfidence` to the import line that already imports `requestHandoffBriefs`:

```ts
// Find this import at the top:
import { requestHandoffBriefs } from "@/db/schema";

// Replace with:
import { requestHandoffBriefs, predictionConfidence as predictionConfidenceTable } from "@/db/schema";
```

Add a fetch block after the `existingHandoffBrief` block (around line 210):

```ts
let existingConfidence: (typeof predictionConfidenceTable.$inferSelect) | null = null;
try {
  const [confRow] = await db
    .select()
    .from(predictionConfidenceTable)
    .where(eq(predictionConfidenceTable.requestId, id));
  existingConfidence = confRow ?? null;
} catch {
  // confidence query failed silently
}
```

Find the `<PredesignPanel` JSX (around line 468) and add the three new props:

```tsx
// OLD
<PredesignPanel
  requestId={request.id}
  currentStage={(request.predesignStage ?? request.stage) as "intake" | "context" | "shape" | "bet"}
  description={request.description}
  businessContext={request.businessContext}
  successMetrics={request.successMetrics}
  profileRole={profile.role ?? "member"}
/>

// NEW
<PredesignPanel
  requestId={request.id}
  currentStage={(request.predesignStage ?? request.stage) as "intake" | "context" | "shape" | "bet"}
  description={request.description}
  businessContext={request.businessContext}
  successMetrics={request.successMetrics}
  profileRole={profile.role ?? "member"}
  impactMetric={request.impactMetric}
  impactPrediction={request.impactPrediction}
  existingConfidence={existingConfidence}
/>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Smoke test in browser**

Start dev server: `npm run dev`

1. Open any request in the predesign phase that has `impactMetric` + `impactPrediction` set
2. Advance to the shape stage
3. Confirm the Prediction Confidence panel appears with a skeleton, then resolves to a score ring + rationale
4. Reload the page — confirm the cached score loads instantly (no spinner)
5. Open a request at shape stage WITHOUT a prediction — confirm the panel does not appear

- [ ] **Step 9: Commit**

```bash
git add lib/ai/prediction-confidence.ts \
  app/api/requests/[id]/prediction-confidence/route.ts \
  components/requests/prediction-confidence-panel.tsx \
  components/requests/predesign-panel.tsx \
  app/(dashboard)/dashboard/requests/[id]/page.tsx
git commit -m "feat(kf5): prediction confidence score — AI grades PM predictions at shape stage"
```

---

## Task 2: SA2 — Design ROI (parallel with Task 1)

**Files:**
- Create: `app/api/insights/design-roi/route.ts`
- Create: `components/insights/design-roi.tsx`
- Modify: `app/(dashboard)/dashboard/insights/page.tsx`

- [ ] **Step 1: Create `app/api/insights/design-roi/route.ts`**

```ts
// app/api/insights/design-roi/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, impactRecords, requests } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const orgRequests = await db
    .select()
    .from(requests)
    .where(eq(requests.orgId, profile.orgId));

  const orgReqIds = orgRequests.map((r) => r.id);
  if (!orgReqIds.length) return NextResponse.json({ roi: [] });

  const allRecords = await db
    .select()
    .from(impactRecords)
    .where(inArray(impactRecords.requestId, orgReqIds));

  const measured = allRecords.filter(
    (r) => r.actualValue && r.variancePercent !== null
  );
  if (!measured.length) return NextResponse.json({ roi: [] });

  // Group by requestType
  const byType: Record<string, number[]> = {};
  for (const rec of measured) {
    const req = orgRequests.find((r) => r.id === rec.requestId);
    const type = req?.requestType ?? "other";
    if (!byType[type]) byType[type] = [];
    byType[type].push(parseFloat(rec.variancePercent as string));
  }

  const roi = Object.entries(byType)
    .map(([requestType, variances]) => {
      const avgVariancePercent =
        Math.round(
          (variances.reduce((s, v) => s + v, 0) / variances.length) * 10
        ) / 10;
      const positive = variances.filter((v) => v >= 0).length;
      const negative = variances.filter((v) => v < 0).length;
      const direction: "positive" | "negative" | "mixed" =
        positive === variances.length
          ? "positive"
          : negative === variances.length
          ? "negative"
          : "mixed";

      return {
        requestType,
        count: variances.length,
        avgVariancePercent,
        direction,
      };
    })
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ roi });
}
```

- [ ] **Step 2: Create `components/insights/design-roi.tsx`**

```tsx
// components/insights/design-roi.tsx
"use client";

import { useEffect, useState } from "react";

interface RoiRow {
  requestType: string;
  count: number;
  avgVariancePercent: number;
  direction: "positive" | "negative" | "mixed";
}

function VariancePill({ v }: { v: number }) {
  const abs = Math.abs(v);
  const color =
    abs <= 10
      ? "text-green-400 bg-green-500/10 border-green-500/20"
      : abs <= 25
      ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
      : "text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${color}`}>
      {v > 0 ? "+" : ""}
      {v.toFixed(1)}%
    </span>
  );
}

const TYPE_LABELS: Record<string, string> = {
  feature: "Feature",
  bug: "Bug fix",
  research: "Research",
  content: "Content",
  infra: "Infra",
  process: "Process",
  other: "Other",
};

const DIRECTION_ICONS: Record<RoiRow["direction"], string> = {
  positive: "↑",
  negative: "↓",
  mixed: "↔",
};

const DIRECTION_COLORS: Record<RoiRow["direction"], string> = {
  positive: "text-green-400",
  negative: "text-red-400",
  mixed: "text-[var(--text-tertiary)]",
};

export function DesignRoi() {
  const [roi, setRoi] = useState<RoiRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights/design-roi")
      .then((r) => r.json())
      .then((d) => setRoi(d.roi ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="border border-[var(--border)] rounded-xl p-5 space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="h-3 bg-[var(--bg-hover)] rounded w-20" />
            <div className="h-3 bg-[var(--bg-hover)] rounded w-12" />
            <div className="h-3 bg-[var(--bg-hover)] rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (!roi.length) {
    return (
      <div className="border border-[var(--border)] rounded-xl px-5 py-8 text-center">
        <p className="text-sm text-[var(--text-tertiary)]">No impact data yet</p>
        <p className="text-xs text-[var(--text-tertiary)] mt-1">
          Design ROI appears after impact is logged on completed requests
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="grid grid-cols-[1fr_auto_auto_auto] text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide px-5 py-2.5 border-b border-[var(--border)] bg-[var(--bg-subtle)] gap-4">
        <span>Type</span>
        <span className="text-right">Requests</span>
        <span className="text-right">Avg variance</span>
        <span className="text-right">Direction</span>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {roi.map((row) => (
          <div
            key={row.requestType}
            className="grid grid-cols-[1fr_auto_auto_auto] items-center px-5 py-3 gap-4"
          >
            <span className="text-sm text-[var(--text-primary)]">
              {TYPE_LABELS[row.requestType] ?? row.requestType}
            </span>
            <span className="text-xs text-[var(--text-secondary)] text-right font-mono">
              {row.count}
            </span>
            <div className="flex justify-end">
              <VariancePill v={row.avgVariancePercent} />
            </div>
            <span
              className={`text-xs font-medium text-right ${DIRECTION_COLORS[row.direction]}`}
            >
              {DIRECTION_ICONS[row.direction]}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] px-5 py-2.5 border-t border-[var(--border)]">
        Variance = (actual − predicted) / |predicted| × 100
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Modify `app/(dashboard)/dashboard/insights/page.tsx` — add DesignRoi import and section**

Add import at the top (with existing imports):
```ts
import { DesignRoi } from "@/components/insights/design-roi";
```

Find the PM Calibration section (around line 173):
```tsx
{/* PM Calibration */}
<section>
  <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">PM calibration</h2>
  <PmCalibration />
</section>
```

Add the Design ROI section immediately after it:
```tsx
{/* Design ROI */}
<section>
  <h2 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide mb-4">Design ROI by request type</h2>
  <DesignRoi />
</section>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke test in browser**

1. Navigate to `/dashboard/insights`
2. Confirm a "Design ROI by request type" section appears below PM Calibration
3. If the org has impact records with measured actuals, confirm rows appear with type names, counts, variance pills, and direction arrows
4. If no impact records exist, confirm the empty state message shows

- [ ] **Step 6: Commit**

```bash
git add app/api/insights/design-roi/route.ts \
  components/insights/design-roi.tsx \
  app/(dashboard)/dashboard/insights/page.tsx
git commit -m "feat(kf5): design ROI by request type on insights page"
```

---

## Task 3: SA3 — "What We Learned" Brief (after Task 1 completes)

**Files:**
- Create: `lib/ai/impact-retrospective.ts`
- Create: `app/api/requests/[id]/impact-retrospective/route.ts`
- Create: `components/requests/impact-retrospective-panel.tsx`
- Modify: `components/requests/track-phase-panel.tsx`
- Modify: `app/(dashboard)/dashboard/requests/[id]/page.tsx`

Note: `db/schema/impact_retrospectives.ts` and its index export were created in Task 0.

- [ ] **Step 1: Create `lib/ai/impact-retrospective.ts`**

```ts
// lib/ai/impact-retrospective.ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const retrospectiveSchema = z.object({
  headline: z
    .string()
    .describe(
      "3-5 words summarising the outcome. Examples: 'Delivered as predicted', 'Significantly over-delivered', 'Missed target — 40% off', 'Impact unmeasured'. Be direct."
    ),
  whatHappened: z
    .string()
    .describe(
      "2-3 sentences: what was predicted, what actually happened, and the magnitude of the gap. Use the numbers. Do not editorialize — just state the facts clearly."
    ),
  likelyReasons: z
    .array(z.string())
    .describe(
      "2-3 plausible hypotheses for why the prediction was accurate, too high, or too low. Ground these in the request context — avoid generic explanations. Each should be a complete sentence."
    ),
  nextTimeSuggestion: z
    .string()
    .describe(
      "One concrete, actionable sentence: what the team should do differently next time (or keep doing if it worked). Make it specific to this type of feature, not generic advice."
    ),
  celebrate: z
    .string()
    .nullable()
    .describe(
      "If the request over-delivered (positive variance > 10%), write a one-sentence recognition line naming what went well. Otherwise return null — do not force celebration on a miss or neutral outcome."
    ),
});

export type ImpactRetrospectiveResult = z.infer<typeof retrospectiveSchema>;

export async function generateImpactRetrospective(input: {
  title: string;
  description: string;
  businessContext?: string | null;
  impactMetric: string;
  impactPrediction: string;
  impactActual: string;
  variancePercent: number | null;
  comments: Array<{ body: string; authorName: string }>;
}): Promise<ImpactRetrospectiveResult> {
  const commentsBlock =
    input.comments.length > 0
      ? `\nCOMMENT THREAD (${input.comments.length} comments):\n${input.comments
          .map((c, i) => `${i + 1}. ${c.authorName}: ${c.body.slice(0, 300)}`)
          .join("\n")}\n`
      : "\nCOMMENT THREAD: None\n";

  const varianceLine =
    input.variancePercent !== null
      ? `VARIANCE: ${input.variancePercent > 0 ? "+" : ""}${input.variancePercent.toFixed(1)}% (${input.variancePercent > 0 ? "over-delivered" : "under-delivered"})`
      : "VARIANCE: Not calculable";

  const { object } = await generateObject({
    model: anthropic("claude-3-5-haiku-20241022"),
    schema: retrospectiveSchema,
    prompt: `You are a senior product strategist writing a post-launch retrospective for a design request. The PM has logged the actual impact. Your job is to produce a concise, honest retrospective that helps the team learn — not a celebration or a post-mortem, just a clear-eyed look at what happened.

---
TITLE: ${input.title}

DESCRIPTION:
${input.description}

${input.businessContext ? `BUSINESS CONTEXT:\n${input.businessContext}\n` : ""}

IMPACT METRIC: ${input.impactMetric}
PREDICTED: ${input.impactPrediction}
ACTUAL: ${input.impactActual}
${varianceLine}
---
${commentsBlock}

Write the retrospective honestly. If the prediction was accurate, say so. If it missed, explain why without assigning blame. The likelyReasons should be plausible given the request context — not generic filler like "scope changed" unless there's evidence of that in the comments.`,
  });

  return object;
}
```

- [ ] **Step 2: Create `app/api/requests/[id]/impact-retrospective/route.ts`**

```ts
// app/api/requests/[id]/impact-retrospective/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles, comments, impactRecords, impactRetrospectives } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateImpactRetrospective } from "@/lib/ai/impact-retrospective";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const [record] = await db
    .select()
    .from(impactRetrospectives)
    .where(eq(impactRetrospectives.requestId, requestId));

  return NextResponse.json({ retrospective: record ?? null });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: requestId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const [request] = await db.select().from(requests).where(eq(requests.id, requestId));
  if (!request || request.orgId !== profile.orgId) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Return cached record if already generated
  const [existing] = await db
    .select()
    .from(impactRetrospectives)
    .where(eq(impactRetrospectives.requestId, requestId));
  if (existing) return NextResponse.json({ retrospective: existing });

  // Guard: needs actual impact logged and track stage complete
  if (!request.impactActual || !request.impactMetric || !request.impactPrediction) {
    return NextResponse.json(
      { error: "Requires impactMetric, impactPrediction, and impactActual" },
      { status: 400 }
    );
  }
  if (request.trackStage !== "complete") {
    return NextResponse.json(
      { error: "Track stage must be complete before generating retrospective" },
      { status: 400 }
    );
  }

  // Fetch variance from impact_records
  const [impactRecord] = await db
    .select()
    .from(impactRecords)
    .where(eq(impactRecords.requestId, requestId));

  const variancePercent =
    impactRecord?.variancePercent !== null && impactRecord?.variancePercent !== undefined
      ? parseFloat(impactRecord.variancePercent as string)
      : null;

  // Fetch comments
  const rawComments = await db
    .select()
    .from(comments)
    .where(and(eq(comments.requestId, requestId), eq(comments.isSystem, false)));

  const authorIds = [
    ...new Set(rawComments.map((c) => c.authorId).filter(Boolean)),
  ] as string[];

  const authorLookup: Record<string, string> = {};
  if (authorIds.length) {
    const authorProfiles = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)
      .where(inArray(profiles.id, authorIds));
    for (const p of authorProfiles) {
      if (p.id) authorLookup[p.id] = p.fullName ?? "Unknown";
    }
  }

  const formattedComments = rawComments.map((c) => ({
    body: c.body,
    authorName: c.authorId ? (authorLookup[c.authorId] ?? "Unknown") : "Unknown",
  }));

  try {
    const result = await generateImpactRetrospective({
      title: request.title,
      description: request.description,
      businessContext: request.businessContext,
      impactMetric: request.impactMetric,
      impactPrediction: request.impactPrediction,
      impactActual: request.impactActual,
      variancePercent,
      comments: formattedComments,
    });

    const inserted = await db
      .insert(impactRetrospectives)
      .values({
        requestId,
        headline: result.headline,
        whatHappened: result.whatHappened,
        likelyReasons: result.likelyReasons,
        nextTimeSuggestion: result.nextTimeSuggestion,
        celebrate: result.celebrate ?? null,
        aiModel: "claude-3-5-haiku-20241022",
      })
      .onConflictDoNothing()
      .returning();

    if (inserted.length === 0) {
      const [race] = await db
        .select()
        .from(impactRetrospectives)
        .where(eq(impactRetrospectives.requestId, requestId));
      return NextResponse.json({ retrospective: race });
    }

    return NextResponse.json({ retrospective: inserted[0] });
  } catch (err) {
    console.error("[impact-retrospective] AI error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `components/requests/impact-retrospective-panel.tsx`**

```tsx
// components/requests/impact-retrospective-panel.tsx
"use client";

import { useEffect, useState } from "react";
import type { ImpactRetrospective } from "@/db/schema";

type Props = {
  requestId: string;
  existingRetrospective: ImpactRetrospective | null;
};

export function ImpactRetrospectivePanel({ requestId, existingRetrospective }: Props) {
  const [retro, setRetro] = useState<ImpactRetrospective | null>(existingRetrospective);
  const [loading, setLoading] = useState(existingRetrospective === null);

  useEffect(() => {
    if (existingRetrospective !== null) return;

    fetch(`/api/requests/${requestId}/impact-retrospective`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => { if (data.retrospective) setRetro(data.retrospective); })
      .catch(() => { /* silent fail */ })
      .finally(() => setLoading(false));
  }, [requestId, existingRetrospective]);

  if (loading) {
    return (
      <div className="border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
          <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
            What We Learned
          </span>
        </div>
        <div className="p-4 space-y-3 animate-pulse">
          <div className="h-4 bg-[var(--bg-hover)] rounded w-1/2" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-full" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-3/4" />
          <div className="h-3 bg-[var(--bg-hover)] rounded w-5/6" />
        </div>
      </div>
    );
  }

  if (!retro) return null;

  return (
    <div className="border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-subtle)] flex items-center justify-between">
        <span className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
          What We Learned
        </span>
        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{retro.aiModel}</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Celebrate callout (over-delivered only) */}
        {retro.celebrate && (
          <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2.5 flex items-start gap-2">
            <span className="text-green-400 text-xs mt-0.5">★</span>
            <p className="text-xs text-green-400/90 leading-relaxed">{retro.celebrate}</p>
          </div>
        )}

        {/* Headline */}
        <p className="text-sm font-medium text-[var(--text-primary)]">{retro.headline}</p>

        {/* What happened */}
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{retro.whatHappened}</p>

        {/* Likely reasons */}
        {retro.likelyReasons.length > 0 && (
          <div>
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Likely reasons</div>
            <ul className="space-y-1.5">
              {retro.likelyReasons.map((reason, i) => (
                <li key={i} className="text-xs text-[var(--text-secondary)] flex gap-2">
                  <span className="text-[var(--text-tertiary)] shrink-0">—</span>
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next time suggestion */}
        <p className="text-xs text-[var(--text-tertiary)] border-t border-[var(--border)] pt-3 leading-relaxed">
          <span className="text-[var(--accent)] font-medium">Next time:</span>{" "}
          {retro.nextTimeSuggestion}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Modify `components/requests/track-phase-panel.tsx` — add 3 new props**

Replace the current Props interface:

```ts
// OLD
interface Props {
  requestId: string;
  trackStage: "measuring" | "complete";
  impactMetric: string | null;
  impactPrediction: string | null;
  impactActual: string | null;
}

// NEW
interface Props {
  requestId: string;
  trackStage: "measuring" | "complete";
  impactMetric: string | null;
  impactPrediction: string | null;
  impactActual: string | null;
  predictionScore: number | null;
  predictionLabel: string | null;
  existingRetrospective: import("@/db/schema").ImpactRetrospective | null;
}
```

Add the three new props to the function destructuring:

```ts
// OLD
export function TrackPhasePanel({
  requestId,
  trackStage,
  impactMetric,
  impactPrediction,
  impactActual,
}: Props) {

// NEW
export function TrackPhasePanel({
  requestId,
  trackStage,
  impactMetric,
  impactPrediction,
  impactActual,
  predictionScore,
  predictionLabel,
  existingRetrospective,
}: Props) {
```

Add import at the top:
```ts
import { ImpactRetrospectivePanel } from "@/components/requests/impact-retrospective-panel";
```

In the JSX, find the `{impactPrediction && (` block and add a prediction confidence badge inline. Replace the existing prediction display:

```tsx
// Find: {impactPrediction && (
//   <div>
//     <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Predicted</p>
//     <p className="text-xs text-[var(--text-secondary)]">{impactPrediction}</p>
//   </div>
// )}

// Replace with:
{impactPrediction && (
  <div>
    <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Predicted</p>
    <div className="flex items-center gap-2 flex-wrap">
      <p className="text-xs text-[var(--text-secondary)]">{impactPrediction}</p>
      {predictionScore !== null && predictionLabel && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${
          predictionScore >= 70
            ? "text-green-400 bg-green-500/10 border-green-500/20"
            : predictionScore >= 40
            ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
            : "text-red-400 bg-red-500/10 border-red-500/20"
        }`}>
          {predictionScore}/100 confidence
        </span>
      )}
    </div>
  </div>
)}
```

Find the `{isComplete && (` block (the "Impact recorded" confirmation) and add the retrospective panel after it:

```tsx
// Find:
{isComplete && (
  <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
    <span className="text-green-400 text-xs">✓</span>
    <p className="text-[11px] text-green-400/80">Impact recorded — request complete</p>
  </div>
)}

// Replace with:
{isComplete && (
  <>
    <div className="bg-green-500/5 border border-green-500/15 rounded-lg px-3 py-2 flex items-center gap-2">
      <span className="text-green-400 text-xs">✓</span>
      <p className="text-[11px] text-green-400/80">Impact recorded — request complete</p>
    </div>
    <ImpactRetrospectivePanel
      requestId={requestId}
      existingRetrospective={existingRetrospective}
    />
  </>
)}
```

- [ ] **Step 5: Modify `app/(dashboard)/dashboard/requests/[id]/page.tsx` — fetch retrospective + confidence for track phase**

Note: `predictionConfidenceTable` was already imported in Task 1. If SA3 runs in a separate session, add it now:

```ts
// Ensure this import exists (add if not present from Task 1):
import { requestHandoffBriefs, predictionConfidence as predictionConfidenceTable, impactRetrospectives } from "@/db/schema";
```

Add fetch block after `existingHandoffBrief` (or after `existingConfidence` if Task 1 already added it):

```ts
let existingRetrospective: (typeof impactRetrospectives.$inferSelect) | null = null;
try {
  const [retroRow] = await db
    .select()
    .from(impactRetrospectives)
    .where(eq(impactRetrospectives.requestId, id));
  existingRetrospective = retroRow ?? null;
} catch {
  // retrospective query failed silently
}
```

If Task 1 has NOT already added the confidence fetch (check the file), add it too:
```ts
let existingConfidence: (typeof predictionConfidenceTable.$inferSelect) | null = null;
try {
  const [confRow] = await db
    .select()
    .from(predictionConfidenceTable)
    .where(eq(predictionConfidenceTable.requestId, id));
  existingConfidence = confRow ?? null;
} catch {
  // confidence query failed silently
}
```

Find the `<TrackPhasePanel` JSX (around line 499) and add the three new props:

```tsx
// OLD
<TrackPhasePanel
  requestId={request.id}
  trackStage={(request.trackStage ?? "measuring") as "measuring" | "complete"}
  impactMetric={request.impactMetric}
  impactPrediction={request.impactPrediction}
  impactActual={request.impactActual}
/>

// NEW
<TrackPhasePanel
  requestId={request.id}
  trackStage={(request.trackStage ?? "measuring") as "measuring" | "complete"}
  impactMetric={request.impactMetric}
  impactPrediction={request.impactPrediction}
  impactActual={request.impactActual}
  predictionScore={existingConfidence?.score ?? null}
  predictionLabel={existingConfidence?.label ?? null}
  existingRetrospective={existingRetrospective}
/>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Smoke test in browser**

1. Open a request in the track phase with `trackStage === "complete"` and `impactActual` set
2. Confirm the "What We Learned" panel appears below the "Impact recorded" confirmation — skeleton first, then content
3. Reload — confirm the cached retrospective loads instantly
4. Confirm the prediction confidence badge appears inline next to the prediction (if the request had a prediction confidence scored by SA1)
5. Open a request in the track phase with `trackStage === "measuring"` — confirm no retrospective panel appears

- [ ] **Step 8: Commit**

```bash
git add lib/ai/impact-retrospective.ts \
  app/api/requests/[id]/impact-retrospective/route.ts \
  components/requests/impact-retrospective-panel.tsx \
  components/requests/track-phase-panel.tsx \
  app/(dashboard)/dashboard/requests/[id]/page.tsx
git commit -m "feat(kf5): 'what we learned' retrospective brief after impact logged"
```

---

## Self-Review

**Spec coverage:**
- Prediction Confidence Score at shape stage: Task 1 ✓
- Confidence badge in Track phase: Task 3, Step 4 ✓
- Design ROI by request type on insights page: Task 2 ✓
- "What We Learned" brief after impact logged: Task 3 ✓
- Lazy generation + cache + silent fail pattern: all three ✓
- `onConflictDoNothing` race condition handling: all API routes ✓
- SA1+SA2 parallel, SA3 after SA1: reflected in task ordering ✓

**Placeholder scan:** No TBDs, all code is complete, all file paths are exact.

**Type consistency:**
- `PredictionConfidence` type: defined in `db/schema/prediction_confidence.ts`, used in predesign-panel props and track-phase-panel props ✓
- `ImpactRetrospective` type: defined in `db/schema/impact_retrospectives.ts`, used in track-phase-panel props ✓
- `predictionConfidenceTable` import alias: consistent across Tasks 1 and 3 ✓
- `impactRetrospectives` table name: consistent between schema, API route imports, and page.tsx ✓
