# KF7: AI Pre-flight Check — Design Spec

**Date:** 2026-04-07
**Status:** Approved

---

## Goal

Show PMs an AI quality score and improvement suggestions for their request *before* they submit — not after triage. PM sees the feedback, improves if they want, then submits. No blocking.

---

## Architecture

### New API route: `POST /api/requests/preflight`

- Auth: requires authenticated user (same as `/api/requests`)
- Input (JSON body):
  ```ts
  {
    title: string
    description: string
    businessContext?: string
    successMetrics?: string
    impactMetric?: string
    impactPrediction?: string
  }
  ```
- Logic:
  1. Validate `title` and `description` are non-empty, return 400 otherwise
  2. Fetch recent org requests (up to 40) for duplicate detection — same query as `/api/requests` POST
  3. Call `triageRequest()` from `lib/ai/triage.ts` with the draft data
  4. Return only pre-flight-relevant fields — **nothing is written to the DB**
- Output (JSON):
  ```ts
  {
    qualityScore: number         // 0–100
    qualityFlags: string[]       // e.g. ["Missing success metrics"]
    suggestions: string[]        // concrete improvements
    potentialDuplicates: Array<{ id: string; title: string; reason: string }>
  }
  ```
- Error handling: if `triageRequest()` throws, return `{ error: "preflight_failed" }` with 500

### No DB changes

The preflight route is read-only. No new table, no new schema, no migration needed. The existing `requestAiAnalysis` table is only written after actual submission.

### Post-submit triage unchanged

`/api/requests` POST still runs the full triage after submission (priority, complexity, requestType, status → "triaged"). Pre-flight results are not reused — Claude reruns on submit to get the authoritative analysis.

---

## UI: `components/requests/new-request-form.tsx`

### State additions
```ts
const [preflight, setPreflight] = useState<PreflightResult | null>(null)
const [preflightLoading, setPreflightLoading] = useState(false)
const [preflightError, setPreflightError] = useState<string | null>(null)
```

Where `PreflightResult` matches the API output shape above.

### "Check quality" button

- Placed in the footer row, to the LEFT of "Submit & triage"
- Label: "Check quality" (idle) / spinner + "Checking…" (loading)
- On click: reads current form values via a ref or controlled state, POSTs to `/api/requests/preflight`
- On success: sets `preflight` state, clears `preflightError`
- On failure: sets `preflightError` to "Quality check failed — you can still submit"

### Pre-flight results panel

Rendered between the form grid and the footer buttons, only when `preflight !== null`.

Layout:
```
┌─────────────────────────────────────────────┐
│ Quality score: [●82 Good]                   │
│                                             │
│ Issues (if any):                            │
│  · Missing success metrics                  │
│  · Impact prediction is vague               │
│                                             │
│ Suggestions:                                │
│  1. Add a specific metric (e.g. conversion) │
│  2. Quantify the predicted improvement      │
│                                             │
│ Possible duplicates (if any):               │
│  · "Redesign checkout" — overlaps in scope  │
└─────────────────────────────────────────────┘
```

Score pill colors:
- Green (`var(--accent)`): score ≥ 80
- Amber (`#D4A84B`): score 50–79
- Red (`#ef4444`): score < 50

### "Submit & triage" always enabled

No minimum score required. PM can submit at any score.

### Form reset

When `onClose()` is called, `preflight` state resets to null (happens naturally since the component unmounts).

---

## Files touched

| File | Change |
|------|--------|
| `app/api/requests/preflight/route.ts` | Create — new POST handler |
| `components/requests/new-request-form.tsx` | Add "Check quality" button + results panel |

No other files touched. No DB changes. No schema changes.

---

## Out of scope

- Saving pre-flight scores to the DB (not needed — full triage runs on submit)
- Blocking submission based on score (PM always decides)
- Pre-flight for request edits (edit flow is separate, not in scope)
- Rate limiting the preflight endpoint (deferred — low traffic for now)
