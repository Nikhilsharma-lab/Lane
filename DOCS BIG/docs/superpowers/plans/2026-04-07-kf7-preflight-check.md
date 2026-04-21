# KF7: AI Pre-flight Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Check quality" button to the New Request form that calls AI pre-flight before submit, showing a quality score, flags, suggestions, and duplicate warnings inline.

**Architecture:** New read-only API route `/api/requests/preflight` runs `triageRequest()` on draft data and returns quality fields — nothing written to DB. `NewRequestForm` gets a form ref, "Check quality" button, and a results panel rendered between the fields and footer.

**Tech Stack:** Next.js 14 App Router, Supabase auth, Drizzle ORM, `lib/ai/triage.ts` (Claude 3.5 Haiku), Tailwind CSS + CSS variables

---

## File Map

| File | Action |
|------|--------|
| `app/api/requests/preflight/route.ts` | **Create** — POST handler, auth + triage, no DB writes |
| `components/requests/new-request-form.tsx` | **Modify** — add formRef, preflight state, "Check quality" button, results panel |

---

### Task 1: Create the preflight API route

**Files:**
- Create: `app/api/requests/preflight/route.ts`

Context: The existing `/api/requests/route.ts` (POST) creates a request then runs triage. This route does the same triage call but on draft data — no request is created, nothing is written.

Look at `lib/ai/triage.ts` for the `triageRequest()` signature and return type. Look at `app/api/requests/route.ts` for the auth pattern and existing-requests query to copy.

- [ ] **Step 1: Create the file with auth + input validation**

```typescript
// app/api/requests/preflight/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { requests, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { triageRequest } from "@/lib/ai/triage";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const body = await req.json();
  const { title, description, businessContext, successMetrics, impactMetric, impactPrediction } = body;

  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
  }

  // Fetch existing org requests for duplicate detection
  const existing = await db
    .select({ id: requests.id, title: requests.title, description: requests.description })
    .from(requests)
    .where(eq(requests.orgId, profile.orgId))
    .orderBy(requests.createdAt)
    .limit(40);

  try {
    const result = await triageRequest({
      title: title.trim(),
      description: description.trim(),
      businessContext: businessContext?.trim() || null,
      successMetrics: successMetrics?.trim() || null,
      existingRequests: existing,
    });

    return NextResponse.json({
      qualityScore: result.qualityScore,
      qualityFlags: result.qualityFlags,
      suggestions: result.suggestions,
      potentialDuplicates: result.potentialDuplicates,
    });
  } catch (err) {
    console.error("[preflight] triage failed:", err);
    return NextResponse.json({ error: "preflight_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles clean**

Run: `cd /Users/yashkaushal/Lane && npx tsc --noEmit`
Expected: exit 0, no errors

- [ ] **Step 3: Smoke test the route with curl**

Start the dev server (`npm run dev`) then run:

```bash
curl -s -X POST http://localhost:3001/api/requests/preflight \
  -H "Content-Type: application/json" \
  -d '{"title":"test","description":"test desc"}' | head -c 200
```

Expected: `{"error":"Unauthorized"}` (no session cookie — proves the route is live and auth guard works)

- [ ] **Step 4: Commit**

```bash
git add app/api/requests/preflight/route.ts
git commit -m "feat: add /api/requests/preflight route for KF7 pre-flight check"
```

---

### Task 2: Update NewRequestForm with "Check quality" button and results panel

**Files:**
- Modify: `components/requests/new-request-form.tsx`

Context: The full current file is at `components/requests/new-request-form.tsx`. It's a client component with uncontrolled inputs — `FormData` is read on submit. We add a `formRef` to read values without submitting, plus 3 new state fields and a "Check quality" button.

- [ ] **Step 1: Add the PreflightResult type and new state/ref at the top of the component**

Replace the existing opening of the `NewRequestForm` function (lines 11–14, through `const [error, ...`) with:

```typescript
interface PreflightResult {
  qualityScore: number;
  qualityFlags: string[];
  suggestions: string[];
  potentialDuplicates: Array<{ id: string; title: string; reason: string }>;
}

export function NewRequestForm({ onClose, projects }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
```

Also add `useRef` to the existing import at the top of the file:
```typescript
import { useState, useRef } from "react";
```

- [ ] **Step 2: Add the handlePreflight function after handleSubmit**

Insert this function after the closing `}` of `handleSubmit`:

```typescript
  async function handlePreflight() {
    if (!formRef.current) return;
    const form = new FormData(formRef.current);
    const title = (form.get("title") as string) ?? "";
    const description = (form.get("description") as string) ?? "";

    if (!title.trim() || !description.trim()) {
      setPreflightError("Add a title and description first");
      return;
    }

    setPreflightLoading(true);
    setPreflightError(null);
    setPreflight(null);

    try {
      const res = await fetch("/api/requests/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          businessContext: (form.get("businessContext") as string) || undefined,
          successMetrics: (form.get("successMetrics") as string) || undefined,
          impactMetric: (form.get("impactMetric") as string) || undefined,
          impactPrediction: (form.get("impactPrediction") as string) || undefined,
        }),
      });

      if (!res.ok) throw new Error("preflight_failed");
      const data: PreflightResult = await res.json();
      setPreflight(data);
    } catch {
      setPreflightError("Quality check failed — you can still submit");
    } finally {
      setPreflightLoading(false);
    }
  }
```

- [ ] **Step 3: Add ref to the form element**

Find the line:
```tsx
        <form onSubmit={handleSubmit} className="px-6 py-5">
```

Replace with:
```tsx
        <form ref={formRef} onSubmit={handleSubmit} className="px-6 py-5">
```

- [ ] **Step 4: Add the pre-flight results panel + "Check quality" button**

Find the existing footer section (the `{error && ...}` block and the buttons div). Replace it with:

```tsx
          {/* Pre-flight results panel */}
          {(preflight || preflightError) && (
            <div
              className="mt-4 rounded-xl border p-4 space-y-3"
              style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
            >
              {preflightError ? (
                <p className="text-xs text-red-400">{preflightError}</p>
              ) : preflight && (
                <>
                  {/* Score */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Quality score</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background:
                          preflight.qualityScore >= 80
                            ? "rgba(46,83,57,0.12)"
                            : preflight.qualityScore >= 50
                            ? "rgba(212,168,75,0.12)"
                            : "rgba(239,68,68,0.12)",
                        color:
                          preflight.qualityScore >= 80
                            ? "var(--accent)"
                            : preflight.qualityScore >= 50
                            ? "#D4A84B"
                            : "#ef4444",
                      }}
                    >
                      {preflight.qualityScore}/100
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {preflight.qualityScore >= 80
                        ? "Good to go"
                        : preflight.qualityScore >= 50
                        ? "Could be stronger"
                        : "Needs more detail"}
                    </span>
                  </div>

                  {/* Flags */}
                  {preflight.qualityFlags.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Issues</p>
                      <ul className="space-y-0.5">
                        {preflight.qualityFlags.map((flag, i) => (
                          <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5">·</span>
                            {flag}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Suggestions */}
                  {preflight.suggestions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Suggestions</p>
                      <ol className="space-y-0.5 list-none">
                        {preflight.suggestions.map((s, i) => (
                          <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                            <span className="font-mono text-[var(--text-tertiary)]">{i + 1}.</span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Duplicates */}
                  {preflight.potentialDuplicates.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Possible duplicates</p>
                      <ul className="space-y-1">
                        {preflight.potentialDuplicates.map((d) => (
                          <li key={d.id} className="text-xs text-[var(--text-secondary)]">
                            <span className="font-medium text-[var(--text-primary)]">{d.title}</span>
                            <span className="text-[var(--text-tertiary)]"> — {d.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePreflight}
              disabled={preflightLoading}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-base)" }}
            >
              {preflightLoading ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-[var(--border-strong)] border-t-[var(--accent)] rounded-full animate-spin" />
                  Checking…
                </>
              ) : (
                "Check quality"
              )}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-[var(--accent)] text-[var(--accent-text)] rounded-lg px-5 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--accent-text)]/40 border-t-[var(--accent-text)] rounded-full animate-spin" />
                  Triaging…
                </>
              ) : (
                "Submit & triage"
              )}
            </button>
          </div>
```

- [ ] **Step 5: Verify TypeScript compiles clean**

Run: `cd /Users/yashkaushal/Lane && npx tsc --noEmit`
Expected: exit 0, no errors

- [ ] **Step 6: Manual UI verification**

1. Open `http://localhost:3001/dashboard`
2. Log in and click "New Request"
3. Fill in only the title and description
4. Click "Check quality" — spinner shows, then results panel appears with score + suggestions
5. Fill in a weak description with no metrics — score should be low (red), flags should mention missing metrics
6. Fill in all fields with detail — score should be high (green)
7. Click "Submit & triage" — form still submits and closes normally

- [ ] **Step 7: Commit**

```bash
git add components/requests/new-request-form.tsx
git commit -m "feat: add AI pre-flight quality check to NewRequestForm (KF7)"
```

---

## Done

After both tasks: push to main.

```bash
git push origin main
```

KF7 complete. PMs see quality feedback before they submit, not after triage.
