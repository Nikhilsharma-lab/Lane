# Track & Insights v2 — Unified Redesign

**Date:** 2026-04-04  
**Status:** Approved — ready for implementation  
**Scope:** Track phase panel, PM calibration with AI coaching, digest upgrade (data + cron), Insights page layout

---

## Problem

Three features exist in the codebase but are incomplete as a user experience:

1. **Track phase** — variance is calculated and stored but never shown to the PM. The feedback loop is broken.
2. **PM calibration** — works as data, but has no AI coaching note. Just a label ("over-optimistic") with no actionable guidance.
3. **AI weekly digest** — doesn't include actual impact data from `impact_records`. Cron is a stub.

Additionally, a legacy `/api/requests/[id]/impact` route and `ImpactPanel` component exist alongside the correct `TrackPhasePanel` and `/api/requests/[id]/impact-record` — creating confusion. These are unified in this redesign.

---

## Approach: Unified "Track & Insights v2"

Treat variance display, calibration coaching, and the digest as one cohesive UI system. One generate action on the Insights page populates all AI-generated content (digest + PM coaching notes) in a single Claude call.

---

## Section 1: Track Phase Panel

**File:** `components/requests/track-phase-panel.tsx`

### Before impact is logged
No change to the logging form — metric display, predicted value, text input, Save button.

### After impact is logged (new)
Display variance inline immediately after save. The API already returns `variancePercent` — the panel just needs to render it.

```
ACTUAL RESULT · Apr 4
+4.2% retention

ACCURACY
─────────────────────────
Predicted  +5%
Actual     +4.2%
Variance   −16.0%

[Over-optimistic]   → stable
```

**Variance label color system** (matches existing `PmCalibration` component):
- `|variance| ≤ 10%` → green / `well_calibrated`
- `variance < −10%` → red / `over_optimistic`  
- `variance > +10%` → amber / `under_optimistic`

**State change:** After `handleSave()` resolves, store `variancePercent` and `label` in local component state and render the accuracy block. No extra fetch needed — the POST response already includes `variancePercent`.

### Legacy cleanup
- `ImpactPanel` (`components/requests/impact-panel.tsx`) — **remove**. All impact logging flows through `TrackPhasePanel`.
- `/api/requests/[id]/impact` (`app/api/requests/[id]/impact/route.ts`) — **remove**. The structured route `/api/requests/[id]/impact-record` is the sole impact endpoint.
- Remove `ImpactPanel` import from `app/(dashboard)/dashboard/requests/[id]/page.tsx`.

---

## Section 2: PM Calibration with AI Coaching

**Files:** `components/insights/pm-calibration.tsx`, `app/api/digest/route.ts`

### Coaching note per PM
Each PM calibration card expands to show a 1–3 sentence AI-generated coaching note. Displayed below the label/trend line, above the recent predictions list.

```
Yash Kaushal          [Over-optimistic]  ↓ worsening
12 predictions · Consistently predicts more than delivered

💬 "Your last 5 predictions averaged −22% variance.
    Try anchoring to your worst-case scenario — not
    your best-case. Start with what's measurable in
    30 days."

  Recent predictions:
  Dark Mode      +5% → +4.2%   [−16.0%]
```

### Storage
Coaching notes are **ephemeral** — not stored in the database. They are generated on-demand alongside the digest and held in client state until the page is closed or regenerated.

### Generation
Coaching notes are generated in the same API call as the digest (see Section 4). The `PmCalibration` component receives coaching notes as a prop from the parent `InsightsPage` client wrapper — it does not fetch them independently.

---

## Section 3: AI Weekly Digest Upgrade

**Files:** `app/api/digest/route.ts`, `db/schema/`, `app/api/insights/digest/generate/route.ts`

### Data upgrade — actual impact in prompt

Join `impact_records` in the digest query. For each shipped request, pass:
- Predicted value (from `requests.impactPrediction`)
- Actual value (from `impact_records.actualValue`, if exists)
- Variance (from `impact_records.variancePercent`, if exists)

Prompt format for shipped items:
```
• "Dark Mode" (Ananya) — 5 days
  Predicted +5% retention → Actual +4.2% (−16%)
• "Checkout flow" (Raj) — 8 days
  Predicted +8% conversion → impact not yet logged
```

### New table: `weekly_digests`

```ts
// db/schema/weekly_digests.ts
{
  id: uuid, primaryKey
  orgId: uuid, notNull, references organizations(id)
  generatedAt: timestamp, notNull
  content: jsonb, notNull  // full digest object (same shape as WeeklyDigest type)
}
```

One row per org. Upserted each time a digest is generated (not appended — we only keep the latest).

### Cron — actually functional

**File:** `app/api/insights/digest/generate/route.ts`

Replace the stub with a real implementation:
1. Fetch all org IDs from the `organizations` table
2. For each org, call `generateDigestForOrg(orgId)` — a shared function extracted from `/api/digest` into `lib/digest.ts`
3. Upsert result into `weekly_digests`

Secured with `CRON_SECRET` env var (already in place).

### Insights page load behavior

On Insights page load (server component), check `weekly_digests` for this org:
- **Row exists and `generatedAt` < 7 days ago** → pass stored digest to `DigestPanel` as initial data. Renders immediately, no button click.
- **No row, or row older than 7 days** → `DigestPanel` shows "Generate digest" button as today.

---

## Section 4: Unified Generate Action

**File:** `app/api/digest/route.ts`

### Single API call for digest + coaching notes

The GET `/api/digest` response is extended to include PM coaching notes:

```ts
// Extended response shape
{
  digest: {
    headline: string,
    shippedThisWeek: string,
    teamHealth: string,
    standout: string,
    recommendations: string[]
  },
  pmCoaching: {
    pmId: string,
    fullName: string,
    note: string,          // 1–3 sentence coaching note
    avgVariancePercent: number,
    label: "well_calibrated" | "over_optimistic" | "under_optimistic",
    trend: "improving" | "worsening" | "stable"
  }[]
}
```

### Claude call structure

Use `generateObject` with a schema that includes both `digest` and `pmCoaching` fields. Prompt passes:
- All existing digest data (shipped, workload, stalled)
- Per-PM variance history for coaching note generation

One call, one model invocation, structured output.

---

## Section 5: Insights Page Layout

**File:** `app/(dashboard)/dashboard/insights/page.tsx`

### New visual hierarchy

```
INSIGHTS

─── Weekly digest ────────────────────────────────
[DigestPanel — renders stored digest instantly, or shows generate button]

─── PM calibration ───────────────────────────────
[PmCalibration — receives coaching notes from DigestPanel state]

─── Pipeline ─────────────────────────────────────
[4 metric tiles: Total / Active / Stalled / Shipped]
[Status breakdown bar chart]

─── Team ─────────────────────────────────────────
[PM request quality]
[Designer workload]
```

**Key architectural note:** `DigestPanel` is upgraded to manage state for both `digest` and `pmCoaching`. After the API call resolves, it passes `pmCoaching` to `PmCalibration` via a prop: `PmCalibration` accepts an optional `coaching?: PmCoachingNote[]` prop. When provided, it skips its own `/api/pm/calibration` fetch and uses the passed data instead. When not provided (no digest generated yet), it fetches from `/api/pm/calibration` as today.

The bottom two sections (Pipeline, Team) remain server-rendered — no loading state, always visible.

---

## Files Changed

### New files
- `db/schema/weekly_digests.ts` — new table schema
- `lib/digest.ts` — `generateDigestForOrg(orgId)` shared function (extracted from `/api/digest`)
- (migration via `db:push`)

### Modified files
- `app/api/digest/route.ts` — add impact_records join, add pmCoaching to output schema, add `generateDigestForOrg()` shared function
- `app/api/insights/digest/generate/route.ts` — replace stub with real cron logic
- `components/requests/track-phase-panel.tsx` — render variance + label after save
- `components/insights/digest-panel.tsx` — manage pmCoaching state, pass to PmCalibration, accept initialData prop for stored digest
- `components/insights/pm-calibration.tsx` — accept optional `coaching` prop, render coaching note in expanded card
- `app/(dashboard)/dashboard/insights/page.tsx` — query weekly_digests, pass to DigestPanel; reorder sections per new layout
- `app/(dashboard)/dashboard/requests/[id]/page.tsx` — remove ImpactPanel import

### Deleted files
- `components/requests/impact-panel.tsx`
- `app/api/requests/[id]/impact/route.ts`

---

## What's Not Built (Deferred)

- **Per-PM calibration view** — PM seeing their own score on their profile. Deferred; design head view on Insights covers MVP.
- **Digest history** — viewing last week's vs this week's digest. Only latest is stored.
- **Email digest** — still deferred to Phase 2.

---

## Environment Variables

No new env vars required. `CRON_SECRET` already exists for the cron endpoint.
