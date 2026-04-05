# Billing UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the existing `/settings/plan` page into a full billing hub with seat usage tracking, plan upgrade/downgrade scaffolding (Stripe deferred, "coming soon" at checkout), and a billing history UI shell.

**Architecture:** Two files change — `components/settings/plan-display.tsx` gains three new inline sections and becomes a client component (needs modal state), and `app/(settings)/settings/plan/page.tsx` gains a seat count query. No new DB tables, no new server actions, no new files.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Tailwind CSS + shadcn/ui. No test framework in this repo — verification is via `npx tsc --noEmit` + manual browser check.

---

## File Map

| File | Change |
|---|---|
| `components/settings/plan-display.tsx` | Add `"use client"`, `seatCount` prop, `PLAN_LIMITS` constant, `SeatUsage` section, `PlanCards` section with upgrade modal, `BillingHistory` section |
| `app/(settings)/settings/plan/page.tsx` | Add seat count query, pass `seatCount` to `<PlanDisplay>` |

---

### Task 1: Add `"use client"`, `PLAN_LIMITS`, and `seatCount` prop to `plan-display.tsx`

**Files:**
- Modify: `components/settings/plan-display.tsx`

The component currently has no directive and no `seatCount` prop. We need to add `"use client"` (required for modal `useState` in Task 3), add the `PLAN_LIMITS` constant, and expand the `Props` type.

- [ ] **Step 1: Open `components/settings/plan-display.tsx` and replace the top of the file**

Replace everything from the top of the file up to and including the `export function PlanDisplay` signature with this:

```tsx
"use client";

import { useState } from "react";

interface Props {
  plan: "free" | "pro" | "enterprise";
  seatCount: number;
}

const PLAN_LABELS: Record<string, string> = { free: "Free", pro: "Pro", enterprise: "Enterprise" };
const PLAN_PRICE: Record<string, string> = { free: "$99/month", pro: "$299/month", enterprise: "Custom" };
const MEMBER_LIMITS: Record<string, string> = { free: "Up to 3 members", pro: "Up to 10 members", enterprise: "Unlimited members" };
const PLAN_LIMITS: Record<string, number> = { free: 3, pro: 10, enterprise: Infinity };

type Feature = { label: string; free: boolean; pro: boolean; enterprise: boolean };
const FEATURES: Feature[] = [
  { label: "Unlimited requests", free: false, pro: true, enterprise: true },
  { label: "AI triage", free: true, pro: true, enterprise: true },
  { label: "Figma sync", free: false, pro: true, enterprise: true },
  { label: "AI weekly digest", free: false, pro: true, enterprise: true },
  { label: "Email notifications", free: false, pro: true, enterprise: true },
  { label: "Linear integration", free: false, pro: false, enterprise: true },
  { label: "SLA", free: false, pro: false, enterprise: true },
];

export function PlanDisplay({ plan, seatCount }: Props) {
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors introduced. Pre-existing errors in `global-shortcuts-provider.tsx` are fine to ignore.

- [ ] **Step 3: Commit**

```bash
git add components/settings/plan-display.tsx
git commit -m "refactor: convert PlanDisplay to client component, add PLAN_LIMITS + seatCount prop"
```

---

### Task 2: Add SeatUsage section to `plan-display.tsx`

**Files:**
- Modify: `components/settings/plan-display.tsx`

Add the seat usage bar directly below the existing plan card (the `<div className="border border-zinc-800 rounded-xl px-6 py-5">` block). Enterprise users see "Unlimited seats" text instead of a bar.

- [ ] **Step 1: Add `SeatUsage` below the plan card**

In `plan-display.tsx`, find the closing `</div>` of the plan card block (after `<p className="text-xs text-zinc-600 ml-5">Annual prepay</p>`). Insert the following immediately after that closing `</div>`:

```tsx
      {/* Seat Usage */}
      {plan === "enterprise" ? (
        <p className="text-sm text-zinc-400">Unlimited seats</p>
      ) : (
        <div className="border border-zinc-800 rounded-xl px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">Seats</span>
            <span className="text-sm text-zinc-500">
              {seatCount} of {PLAN_LIMITS[plan]} used &nbsp;&middot;&nbsp;{" "}
              {Math.max(0, PLAN_LIMITS[plan] - seatCount)} available
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                seatCount / PLAN_LIMITS[plan] >= 1
                  ? "bg-red-500"
                  : seatCount / PLAN_LIMITS[plan] >= 0.8
                  ? "bg-amber-400"
                  : "bg-green-400"
              }`}
              style={{ width: `${Math.min(100, (seatCount / PLAN_LIMITS[plan]) * 100)}%` }}
            />
          </div>
          {seatCount >= PLAN_LIMITS[plan] && (
            <p className="text-xs text-red-400">Seat limit reached. Remove a member or upgrade your plan.</p>
          )}
        </div>
      )}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/plan-display.tsx
git commit -m "feat: add seat usage bar to plan page"
```

---

### Task 3: Add PlanCards section with upgrade/downgrade modal to `plan-display.tsx`

**Files:**
- Modify: `components/settings/plan-display.tsx`

Add modal state at the top of the component function body, then add the plan cards section between the features table and the existing "Need more?" Enterprise CTA block.

The modal has two stages: `"confirm"` (shows the plan switch details) and `"comingsoon"` (shows the "email us" message after clicking "Proceed to checkout").

- [ ] **Step 1: Add modal state inside the `PlanDisplay` function body**

Inside `export function PlanDisplay({ plan, seatCount }: Props) {`, add this as the first line of the function body:

```tsx
  const [modal, setModal] = useState<{
    targetPlan: "free" | "pro" | "enterprise";
    stage: "confirm" | "comingsoon";
  } | null>(null);
```

- [ ] **Step 2: Add the `PlanCards` section**

In `plan-display.tsx`, find `{plan !== "enterprise" && (` — the existing Enterprise CTA block. Insert the following plan cards section **directly before** that block:

```tsx
      {/* Plan Cards */}
      <div>
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">All plans</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["free", "pro", "enterprise"] as const).map((p) => {
            const isCurrent = plan === p;
            const isUpgrade = p === "enterprise" || (plan === "free" && p === "pro");
            return (
              <div
                key={p}
                className={`border rounded-xl px-5 py-4 flex flex-col gap-3 ${
                  isCurrent ? "border-white/20 bg-zinc-900" : "border-zinc-800"
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-white">{PLAN_LABELS[p]}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{PLAN_PRICE[p]}</p>
                  <p className="text-xs text-zinc-600 mt-1">{MEMBER_LIMITS[p]}</p>
                </div>
                {isCurrent ? (
                  <span className="text-xs text-zinc-500 border border-zinc-700 rounded px-2 py-1 w-fit">
                    Current plan
                  </span>
                ) : p === "enterprise" ? (
                  <a
                    href="mailto:yash@lane.io?subject=Enterprise%20inquiry"
                    className="text-xs text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded px-3 py-1.5 transition-colors w-fit"
                  >
                    Contact us &rarr;
                  </a>
                ) : (
                  <button
                    onClick={() => setModal({ targetPlan: p, stage: "confirm" })}
                    className="text-xs text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded px-3 py-1.5 transition-colors w-fit"
                  >
                    {isUpgrade ? "Upgrade" : "Downgrade"} to {PLAN_LABELS[p]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
```

- [ ] **Step 3: Add the modal overlay**

At the very end of the `return (...)` block, just before the outermost closing `</div>`, add:

```tsx
      {/* Upgrade / Downgrade Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md mx-4 space-y-4">
            {modal.stage === "confirm" ? (
              <>
                <h3 className="text-base font-semibold text-white">
                  {modal.targetPlan === "free" ? "Downgrade" : "Upgrade"} to {PLAN_LABELS[modal.targetPlan]}
                </h3>
                <p className="text-sm text-zinc-400">
                  You&apos;re switching from <span className="text-white">{PLAN_LABELS[plan]}</span> →{" "}
                  <span className="text-white">{PLAN_LABELS[modal.targetPlan]}</span> ({PLAN_PRICE[modal.targetPlan]}, annual prepay).
                </p>
                {modal.targetPlan === "free" && (
                  <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">
                    You&apos;ll lose access to Figma sync, AI weekly digest, and email notifications.
                    {seatCount > PLAN_LIMITS.free && " You also have more than 3 members — remove members to fit the Free plan limit first."}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setModal(null)}
                    className="flex-1 text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setModal({ ...modal, stage: "comingsoon" })}
                    className="flex-1 text-sm text-white bg-zinc-700 hover:bg-zinc-600 rounded-lg px-4 py-2 transition-colors"
                  >
                    Proceed to checkout &rarr;
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-white">Coming soon</h3>
                <p className="text-sm text-zinc-400">
                  Online checkout isn&apos;t available yet.{" "}
                  <a href="mailto:yash@lane.io?subject=Plan%20upgrade" className="text-white underline underline-offset-2 hover:text-zinc-300">
                    Email yash@lane.io
                  </a>{" "}
                  to upgrade — we&apos;ll get you sorted within 24 hours.
                </p>
                <button
                  onClick={() => setModal(null)}
                  className="w-full text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg px-4 py-2 transition-colors"
                >
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/settings/plan-display.tsx
git commit -m "feat: add plan cards + upgrade/downgrade modal (coming soon at checkout)"
```

---

### Task 4: Add BillingHistory section to `plan-display.tsx`

**Files:**
- Modify: `components/settings/plan-display.tsx`

Add a billing history shell at the bottom of the component, after the existing Enterprise CTA block. This is an empty-state table — no data fetched.

- [ ] **Step 1: Add the BillingHistory section at the bottom of the `return` block**

Find the closing `</div>` of the existing Enterprise CTA block (`{plan !== "enterprise" && (...)}`). Add the following immediately after it, before the closing of the outer `<div className="space-y-8">`:

```tsx
      {/* Billing History */}
      <div>
        <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">Billing history</h2>
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Invoice</th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Date</th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Amount</th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Status</th>
                <th className="text-left text-xs font-medium text-zinc-500 px-4 py-3">Download</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <p className="text-sm text-zinc-500">No invoices yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">Billing history will appear here once you&apos;re on a paid plan.</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/settings/plan-display.tsx
git commit -m "feat: add billing history shell (empty state, Stripe-ready)"
```

---

### Task 5: Add seat count query to `plan/page.tsx`

**Files:**
- Modify: `app/(settings)/settings/plan/page.tsx`

Add a `COUNT(*)` query to count members in the org. Pass the result as `seatCount` to `<PlanDisplay>`.

- [ ] **Step 1: Update the import line in `plan/page.tsx`**

Replace:
```tsx
import { eq } from "drizzle-orm";
```
With:
```tsx
import { eq, sql } from "drizzle-orm";
```

- [ ] **Step 2: Add the seat count query after the org fetch**

In `plan/page.tsx`, find:
```tsx
  if (!org) redirect("/login");
```

Add this immediately after it:

```tsx
  const [{ seatCount }] = await db
    .select({ seatCount: sql<number>`cast(count(*) as int)` })
    .from(profiles)
    .where(eq(profiles.orgId, org.id));
```

- [ ] **Step 3: Pass `seatCount` to `<PlanDisplay>`**

Replace:
```tsx
      <PlanDisplay plan={org.plan} />
```
With:
```tsx
      <PlanDisplay plan={org.plan} seatCount={seatCount} />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors on `plan/page.tsx`. Confirm `seatCount` is typed as `number`.

- [ ] **Step 5: Manual browser check**

```bash
npm run dev
```

Navigate to `http://localhost:3000/settings/plan` (as an admin). Verify:
- Seat usage bar renders with correct count and color (green / amber / red based on fill)
- Three plan cards render; current plan has "Current plan" badge and no button
- Clicking "Upgrade" or "Downgrade" opens the confirmation modal
- Clicking "Proceed to checkout" swaps modal to "Coming soon" message with mailto link
- Clicking "Close" dismisses the modal
- Billing history table renders with empty state copy
- Enterprise plan: bar is hidden, "Unlimited seats" text shows

- [ ] **Step 6: Commit**

```bash
git add app/\(settings\)/settings/plan/page.tsx
git commit -m "feat: add seat count query to plan page, wire to PlanDisplay"
```
