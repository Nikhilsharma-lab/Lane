# KF5 Impact Intelligence — Design Spec

**Date:** 2026-04-04
**Status:** Approved
**Feature:** Killer Feature 5 — Impact Intelligence
**Build strategy:** SA1 + SA2 in parallel; SA3 after SA1 completes

---

## Overview

Three sub-features that make impact measurement intelligent rather than just data entry:

1. **Prediction Confidence Score** — AI grades PM's impact prediction at the shape stage, before the bet
2. **Design ROI** — Aggregate view of which request types actually move metrics (pure SQL, no AI)
3. **"What We Learned" Brief** — AI retrospective generated after PM logs actual impact

All three extend what's already built: the Track phase panel, the PM Calibration system on the Insights page, and the existing `impactRecords` + `requests` schema.

---

## Sub-feature 1: Prediction Confidence Score

### What it does

When a PM enters `impactMetric` + `impactPrediction` on a request, AI grades the prediction's realism. This surfaces at the **shape stage** of the predesign phase — exactly when the Design Head is about to place the bet. A weak or vague prediction gets flagged before resources are committed.

The same cached score also appears as a read-only badge in the Track phase panel, giving retrospective context alongside the actual variance ("AI confidence was 64%, actual variance was −22%").

### When it generates

Lazy — on first open of the shape stage when both `impactMetric` and `impactPrediction` are non-empty. Same pattern as context brief and handoff brief: generated once, cached forever, silent fail if AI is down. No regenerate button.

### Why shape stage (not intake)

At intake, the prediction may be incomplete or placeholder. By shape stage the request is fully formed and the Design Head is actively reviewing before betting. That's the highest-value moment to surface a coaching signal.

### AI input

- `title`, `description`, `businessContext`, `successMetrics`
- `impactMetric`, `impactPrediction`
- `requestType`, `priority`

### AI output (Zod schema)

```ts
z.object({
  score: z.number().int().min(0).max(100),
  label: z.enum(["realistic", "optimistic", "vague", "unmeasurable"]),
  rationale: z.string(),       // 2–3 sentences explaining the score
  redFlags: z.array(z.string()), // 0–3 specific problems; empty array if none
  suggestion: z.string(),      // one sentence: how to make the prediction stronger
})
```

**Label semantics:**
- `realistic` — prediction is specific, grounded, achievable (score 70–100)
- `optimistic` — directionally right but overstated (score 40–69)
- `vague` — metric or value too fuzzy to measure (score 20–39)
- `unmeasurable` — no clear metric that could be measured after ship (score 0–19)

### DB schema

```sql
CREATE TABLE prediction_confidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requestId   uuid UNIQUE NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  score       integer NOT NULL,
  label       text NOT NULL,
  rationale   text NOT NULL,
  redFlags    jsonb,
  suggestion  text,
  aiModel     text,
  tokensUsed  integer,
  createdAt   timestamp with time zone DEFAULT now()
);
```

### Files

**Create:**
- `db/schema/prediction_confidence.ts` — Drizzle table definition + exported types
- `lib/ai/prediction-confidence.ts` — `generatePredictionConfidence()` using Haiku + `generateObject` + Zod
- `app/api/requests/[id]/prediction-confidence/route.ts` — POST: auth + org guard + `onConflictDoNothing` + return; GET: fetch cached record
- `components/requests/prediction-confidence-panel.tsx` — score ring (green ≥70 / amber 40–69 / red <40), label badge, rationale, red flags list, suggestion line; skeleton on first load

**Modify:**
- `db/schema/index.ts` — export `prediction_confidence`
- `components/requests/predesign-panel.tsx` — render `PredictionConfidencePanel` at shape stage when `impactMetric` + `impactPrediction` are set; POST to generate on mount if no cached record
- `app/(dashboard)/dashboard/requests/[id]/page.tsx` — fetch prediction confidence record; pass to predesign panel

### Track phase integration (handled by SA3)

SA3 reads the cached `prediction_confidence` record and renders a small read-only badge inside `TrackPhasePanel` alongside the prediction display. No re-generation — just a read from the existing table.

---

## Sub-feature 2: Design ROI

### What it does

A new section on the Insights page (below PM Calibration) showing per-request-type impact performance. Answers: do feature requests move metrics more than bug fixes? Which types are chronically over-promised?

### No AI, no new table

Pure SQL: join `impactRecords` with `requests`, group by `requestType`, compute avg variance and count. Same approach as the existing PM Calibration API.

### Data shape (per type)

```ts
{
  requestType: string,          // "feature" | "bug" | "research" | etc.
  count: number,                // requests with measured impact
  avgVariancePercent: number,   // positive = over-delivered, negative = under-delivered
  direction: "positive" | "negative" | "mixed",
}
```

Only include request types with at least one completed impact record. Sort by `count` descending.

### Files

**Create:**
- `app/api/insights/design-roi/route.ts` — GET: auth + org guard; join `impactRecords` with `requests` grouped by `requestType`; return array sorted by count desc
- `components/insights/design-roi.tsx` — client component; fetches on mount; compact table: type name, count, avg variance pill (reuses existing `VariancePill` from `pm-calibration.tsx`), direction indicator; same visual style as `PmCalibration`

**Modify:**
- `app/(dashboard)/dashboard/insights/page.tsx` — add `<DesignRoi />` section below `<PmCalibration />`

---

## Sub-feature 3: "What We Learned" Brief

### What it does

After PM logs actual impact and marks the request complete (`trackStage === "complete"`), a retrospective brief is generated and shown below the "Impact recorded" confirmation in `TrackPhasePanel`. One button, one AI call, cached forever.

### When it generates

Lazy — on first open of the track phase when `trackStage === "complete"` AND `impactActual` is set. Silent fail. Skeleton while generating.

### AI input

- `title`, `description`, `businessContext`
- `impactMetric`, `impactPrediction`, `impactActual`
- `variancePercent` (from `impactRecords`)
- All non-system comments (full thread, same as handoff brief)

### AI output (Zod schema)

```ts
z.object({
  headline: z.string(),          // "Over-delivered", "Delivered as predicted", "Missed target"
  whatHappened: z.string(),      // 2–3 sentences: what was predicted, what happened, gap magnitude
  likelyReasons: z.array(z.string()), // 2–3 hypotheses for the gap (or the success)
  nextTimeSuggestion: z.string(), // one concrete thing: change next time, or keep doing this
  celebrate: z.string().nullable(), // recognition line if over-delivered; null if missed/neutral
})
```

### DB schema

```sql
CREATE TABLE impact_retrospectives (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requestId           uuid UNIQUE NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  headline            text NOT NULL,
  whatHappened        text NOT NULL,
  likelyReasons       jsonb NOT NULL,
  nextTimeSuggestion  text NOT NULL,
  celebrate           text,
  aiModel             text,
  tokensUsed          integer,
  createdAt           timestamp with time zone DEFAULT now()
);
```

### Files

**Create:**
- `db/schema/impact_retrospectives.ts` — Drizzle table definition + exported types
- `lib/ai/impact-retrospective.ts` — `generateImpactRetrospective()` using Haiku + `generateObject` + Zod
- `app/api/requests/[id]/impact-retrospective/route.ts` — POST: generate + cache with `onConflictDoNothing`; GET: fetch cached record
- `components/requests/impact-retrospective-panel.tsx` — headline (colored by outcome), what happened paragraph, likely reasons bullets, next-time suggestion, celebrate callout (green) if present; skeleton on first load

**Modify:**
- `db/schema/index.ts` — export `impact_retrospectives`
- `components/requests/track-phase-panel.tsx` — two additions:
  1. Read-only confidence badge alongside the prediction display (using `predictionConfidence` prop passed from page)
  2. Render `ImpactRetrospectivePanel` below the "Impact recorded" state; POST to generate on mount if no cached record
- `app/(dashboard)/dashboard/requests/[id]/page.tsx` — fetch `predictionConfidence` record + `impactRetrospective` record; pass both to the track phase section

---

## DB Migration

Run before any subagents:

```sql
CREATE TABLE prediction_confidence (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requestId   uuid UNIQUE NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  score       integer NOT NULL,
  label       text NOT NULL,
  rationale   text NOT NULL,
  redFlags    jsonb,
  suggestion  text,
  aiModel     text,
  tokensUsed  integer,
  createdAt   timestamp with time zone DEFAULT now()
);

CREATE TABLE impact_retrospectives (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requestId           uuid UNIQUE NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  headline            text NOT NULL,
  whatHappened        text NOT NULL,
  likelyReasons       jsonb NOT NULL,
  nextTimeSuggestion  text NOT NULL,
  celebrate           text,
  aiModel             text,
  tokensUsed          integer,
  createdAt           timestamp with time zone DEFAULT now()
);
```

Push via `npx drizzle-kit push`.

---

## Subagent Execution Plan

**SA1 and SA2 run in parallel. SA3 runs after SA1 completes** (SA3 reads SA1's schema in `track-phase-panel`).

| Subagent | Owns | Shared file risk |
|---|---|---|
| SA1 — Confidence Score | `prediction_confidence` schema, `lib/ai/prediction-confidence.ts`, API route, panel component, predesign-panel integration, page.tsx (confidence fetch for predesign) | None — SA3 reads its schema but runs after |
| SA2 — Design ROI | `design-roi` API route, `design-roi.tsx` component, insights page | None |
| SA3 — What We Learned | `impact_retrospectives` schema, `lib/ai/impact-retrospective.ts`, API route, panel component, `track-phase-panel.tsx` (both retrospective + confidence badge), `page.tsx` (both data fetches for track phase) | Runs after SA1; touches page.tsx for track-phase section only |

---

## Key Decisions

- **Shape stage, not intake** — prediction is complete by shape; Design Head is the target audience at bet time
- **Confidence score is read-only in Track phase** — it's historical context, not re-evaluated after the fact
- **Design ROI has no AI** — it's already data; adding AI would add cost without insight
- **Retrospective generates after `complete`** — not after first `impactActual` save; PM should fully finalize before AI generates the brief
- **`celebrate` is nullable** — forced celebration on a miss is worse than silence
- **No regenerate buttons on any brief** — YAGNI; cached state at generation time is the point-in-time record
- **SA3 runs after SA1** — SA3 renders the confidence badge in track-phase-panel using the schema SA1 creates; sequential avoids file conflicts on `page.tsx` and `track-phase-panel.tsx`
