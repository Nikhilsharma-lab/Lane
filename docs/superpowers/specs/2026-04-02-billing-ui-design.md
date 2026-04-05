# Billing & Subscription UI — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the existing `/settings/plan` page into a full billing hub — seat usage tracking, plan upgrade/downgrade scaffolding (Stripe deferred), and a billing history shell ready for Stripe data.

**Architecture:** No new route or sidebar item. The existing `plan-display.tsx` component and `/settings/plan/page.tsx` are expanded with three sections. No new DB tables or server actions — seat count is a live `profiles` query, plan changes are UI-only.

**Tech Stack:** Next.js 14 App Router, Drizzle ORM, Tailwind + shadcn/ui. No Stripe in this spec.

---

## Access Model

Same as the rest of Settings — Plan page is admin-only. Non-admins are redirected to `/settings/account` (already implemented).

---

## Page Layout (`/settings/plan`)

Three sections stacked vertically on a single scrollable page:

```
1. Current Plan + Seat Usage
2. Plan Cards (upgrade / downgrade)
3. Billing History
```

---

## Section 1: Current Plan + Seat Usage

**Current plan card** (already exists — keep as-is):
```
● Pro   $299/month   Annual prepay
```

**Seat usage bar** (new, rendered below the plan card):
```
Seats
7 of 10 used  [████████░░]  3 seats available
```

**Seat limits** — static constant, no DB change:
```typescript
export const PLAN_LIMITS = {
  free: { seats: 3 },
  pro:  { seats: 10 },
  enterprise: { seats: Infinity },
} as const;
```

- Seat count = `COUNT(profiles WHERE orgId = currentOrgId)` — queried server-side in `page.tsx`
- Enterprise: hide the bar entirely, show `"Unlimited seats"` as plain text
- Progress bar color: green if < 80% used, amber if 80–99%, red if at limit

---

## Section 2: Plan Cards

Three cards displayed in a horizontal row (stacks to vertical on mobile):

| Free | Pro | Enterprise |
|---|---|---|
| $99/month | $299/month | Custom |
| Up to 3 seats | Up to 10 seats | Unlimited seats |
| [Downgrade] | **CURRENT** (highlighted border, no button) | [Contact us] |

- Current plan card: `ring-2 ring-white` border, badge "Current plan", no action button
- "Contact us" on Enterprise → `mailto:yash@lane.io?subject=Enterprise inquiry` (same as existing CTA)
- "Downgrade to Free" / "Upgrade to Pro" → opens confirmation modal

**Upgrade/Downgrade Confirmation Modal:**
```
Upgrade to Pro
─────────────────────────────────────
You're upgrading from Free → Pro ($299/month, annual prepay).

[Cancel]   [Proceed to checkout →]
```

Clicking "Proceed to checkout":
- No server action called
- Modal body swaps to:
```
Online checkout is coming soon.

Email yash@lane.io to upgrade — we'll get you sorted within 24 hours.

[Close]
```

This is the Stripe hook point. When Stripe is integrated, "Proceed to checkout" calls the Stripe Checkout API instead.

**Downgrade confirmation modal** (same pattern):
```
Downgrade to Free
─────────────────────────────────────
You're downgrading from Pro → Free ($99/month).
You'll lose access to: Figma sync, AI weekly digest, email notifications.
If you have more than 3 members, you'll need to remove them first.

[Cancel]   [Proceed to checkout →]
```

---

## Section 3: Billing History

Empty-state table shell. No data fetched now — ready to accept Stripe invoice data later.

**Table columns:** Invoice #, Date, Amount, Status, Download

**Empty state:**
```
Billing History

  Invoice       Date        Amount    Status    Download
  ──────────────────────────────────────────────────────

            No invoices yet.
   Billing history will appear here once
        you're connected to a paid plan.
```

When Stripe is connected, `page.tsx` passes a `invoices` prop and the table renders rows.

---

## Data Changes

**No new DB tables.** No new server actions.

`/settings/plan/page.tsx` gains two new queries:
1. Seat count: `db.select({ count: count() }).from(profiles).where(eq(profiles.orgId, org.id))`
2. Organization plan: already fetched via profile → org join (no change needed)

---

## Component Changes

**`components/settings/plan-display.tsx`** — expand with two new sections:
- `<SeatUsage seatCount={n} plan={org.plan} />` — inline sub-component (not a separate file, too small)
- `<PlanCards currentPlan={org.plan} />` — inline, renders three cards + modal state
- `<BillingHistory invoices={[]} />` — inline, renders empty state shell

All three sub-components live inside `plan-display.tsx`. They are small and tightly coupled to the plan page — no reason to split into separate files.

**`app/(settings)/settings/plan/page.tsx`** — add seat count query, pass to `PlanDisplay`.

---

## What Is NOT in This Spec

- Stripe integration → Sub-project 2 (Billing gateway)
- Invoice PDF downloads → requires Stripe
- Payment method management (add/remove card) → requires Stripe
- Proration calculations → requires Stripe
- Email confirmations on plan change → requires Stripe
- Seat overage enforcement → deferred (warn only for now)
