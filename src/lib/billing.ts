import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { and, count, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";

import { db, freeRequestAllowances, workspaceBilling, workspaces } from "@/db";
import { FOUNDING_DISCOUNT, foundingDiscountFor, foundingEndsAt, type BillingPeriod } from "./billing-plan-rules";
import { billingEnforced } from "./feature-switches";
import type { CheckoutRequest, PaymentEvent, PaymentProvider } from "./payment-provider";
import { allowanceKeyOf, creationBlock, freeRequestsOf, type FreeRequests, type FreeRequestsState, type PlanState } from "./free-request-rules";
import type { RequestTx } from "./request-change-store";

/**
 * #213 (spec #195, item 5): the billing module. It owns the Free Requests count and the plan state; nothing else
 * reads or writes `workspace_billing` or `free_request_allowances`. The count itself is kept by the database
 * (migration 0046): every Request created counts, deleted ones too, and a Guest submission once it is taken on.
 * Access is the caller's job: pages and actions guard the role, then pass only `{ orgId }`.
 *
 * #214 adds paying: checkout on the payment provider's hosted page (`src/lib/payment-provider.ts`), the plan state
 * the provider's events set, and the founding discount for the first 50 paying workspaces, for two years.
 */

type Workspace = { orgId: string };
type Exec = typeof db | RequestTx;

async function stateOf(exec: Exec, orgId: string): Promise<FreeRequestsState> {
  const [row] = await exec
    .select({ planState: workspaceBilling.planState, used: workspaceBilling.freeRequestsUsed, key: workspaceBilling.allowanceKey, held: workspaceBilling.holdsAllowance })
    .from(workspaceBilling)
    .where(eq(workspaceBilling.orgId, orgId));
  if (!row) return { planState: "free", used: 0, allowance: null };
  const allowance = row.key === null || row.held === null ? null : allowanceOfKey(row.key, row.held);
  return { planState: row.planState, used: row.used, allowance };
}

/** The kind and domain a stored allowance key names (a personal one is a whole address). */
function allowanceOfKey(key: string, held: boolean): FreeRequestsState["allowance"] {
  const at = key.indexOf("@");
  return at < 0 ? { kind: "company_domain", domain: key, held } : { kind: "personal_email", domain: key.slice(at + 1), held };
}

export type WorkspaceFreeRequests = { planState: PlanState; free: FreeRequests };

/** What Settings → Billing shows: the plan state and the Free Requests left. */
export async function readFreeRequests(ws: Workspace): Promise<WorkspaceFreeRequests> {
  const state = await stateOf(db, ws.orgId);
  return { planState: state.planState, free: freeRequestsOf(state) };
}

/** Whether this workspace's allowance has been decided (looked up for its creator). */
export async function freeRequestsDecided(ws: Workspace): Promise<boolean> {
  return (await stateOf(db, ws.orgId)).allowance !== null;
}

/**
 * Claims the Free Requests of the allowance `creatorEmail` names for this workspace: the first workspace to claim
 * a company domain (or a personal address) holds it, and any later one is told they were already used. Decided
 * once; an address that names no allowance (or none at all) leaves it undecided.
 */
export async function claimFreeRequests(ws: Workspace, creatorEmail: string | null): Promise<void> {
  const allowance = creatorEmail ? allowanceKeyOf(creatorEmail) : null;
  if (!allowance) return;
  await db.transaction(async (tx) => {
    await tx.insert(workspaceBilling).values({ orgId: ws.orgId }).onConflictDoNothing();
    const [row] = await tx.select({ held: workspaceBilling.holdsAllowance }).from(workspaceBilling).where(eq(workspaceBilling.orgId, ws.orgId)).for("update");
    if (row?.held !== null) return;
    await tx.insert(freeRequestAllowances).values({ allowanceKey: allowance.key, kind: allowance.kind, orgId: ws.orgId }).onConflictDoNothing();
    const [holder] = await tx.select({ orgId: freeRequestAllowances.orgId }).from(freeRequestAllowances).where(eq(freeRequestAllowances.allowanceKey, allowance.key));
    await tx.update(workspaceBilling).set({ allowanceKey: allowance.key, holdsAllowance: holder?.orgId === ws.orgId }).where(eq(workspaceBilling.orgId, ws.orgId));
  });
}

/**
 * Decides the workspace's allowance from its creator in Clerk, if it isn't decided yet. `known` is what the caller
 * already has: the Clerk organization's creator and the signed-in person, whose address needs no lookup. Never
 * throws: a workspace whose creator can't be found stays undecided, and so keeps its 4 Free Requests.
 */
export async function decideFreeRequests(ws: Workspace, known?: { createdBy: string | null | undefined; userId: string; email: string }): Promise<void> {
  try {
    if (await freeRequestsDecided(ws)) return;
    const client = await clerkClient();
    const createdBy = known ? known.createdBy : (await client.organizations.getOrganization({ organizationId: ws.orgId })).createdBy;
    if (!createdBy) return;
    const email = known && createdBy === known.userId
      ? known.email
      : await client.users.getUser(createdBy).then((user) => user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null);
    await claimFreeRequests(ws, email);
  } catch (error) {
    console.error("[billing] Free Requests allowance not decided:", error instanceof Error ? error.message : "unknown error");
  }
}

export type WorkspacePlan = {
  planState: PlanState;
  /** How the workspace pays, once it has paid. */
  period: BillingPeriod | null;
  /** `offered`: a checkout now gets the founding discount. `endsAt`: when this workspace's founding discount ends. */
  founding: { offered: boolean; endsAt: Date | null };
  /** #216: the day a cancelled plan stops (it pays until then), or null while it renews. */
  endsAt: Date | null;
  /** #216: the provider knows the workspace (its card and invoices can be opened). */
  customer: boolean;
  /** #216: the workspace has a plan with the provider (its period can be changed, or it can be cancelled). */
  subscription: boolean;
};

/** The one lock every founding place is given under; migration 0047's trigger takes it too. */
const lockFoundingPlaces = (tx: RequestTx) => tx.execute(sql`select pg_advisory_xact_lock(hashtext('lane_founding_places'))`);

/** Founding places held by other workspaces: paid with the discount, or in a checkout that is still open. */
async function foundingPlacesTaken(exec: Exec, orgId: string): Promise<number> {
  const [row] = await exec
    .select({ taken: count() })
    .from(workspaceBilling)
    .where(and(ne(workspaceBilling.orgId, orgId), or(isNotNull(workspaceBilling.foundingStartsAt), gt(workspaceBilling.foundingReservedUntil, sql`now()`))));
  return row?.taken ?? 0;
}

/** What Settings → Billing shows about the plan: its state, how it is billed, and the founding discount. */
export async function readPlan(ws: Workspace, now = new Date()): Promise<WorkspacePlan> {
  const [row] = await db
    .select({
      planState: workspaceBilling.planState, period: workspaceBilling.billingPeriod, foundingStartsAt: workspaceBilling.foundingStartsAt,
      endsAt: workspaceBilling.planEndsAt, customerId: workspaceBilling.providerCustomerId, subscriptionId: workspaceBilling.providerSubscriptionId,
    })
    .from(workspaceBilling)
    .where(eq(workspaceBilling.orgId, ws.orgId));
  const startsAt = row?.foundingStartsAt ?? null;
  const offered = startsAt ? foundingDiscountFor(startsAt, now) !== null : (await foundingPlacesTaken(db, ws.orgId)) < FOUNDING_DISCOUNT.workspaces;
  return {
    planState: row?.planState ?? "free",
    period: row?.period ?? null,
    founding: { offered, endsAt: startsAt && foundingEndsAt(startsAt) },
    endsAt: row?.endsAt ?? null,
    customer: Boolean(row?.customerId),
    subscription: Boolean(row?.subscriptionId),
  };
}

/** How long a checkout page takes payment, and how long its founding place is kept after (the provider's event can come late). */
const CHECKOUT_OPEN_MS = 60 * 60 * 1000;
const FOUNDING_PLACE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export const ALREADY_PAYING = "This workspace already pays for Lane.";
export const CHECKOUT_FAILED = "Couldn’t open the checkout page. Try again.";

/**
 * Starts paying: a checkout on the payment provider's hosted page for the workspace's paid seats, in the period the
 * Admin chose. A founding place is kept for it if one is free (or the workspace already holds one), and the
 * checkout gets the discount; otherwise the list price. Nothing is paid until the provider reports it
 * (`recordPaymentEvent`). The caller guards the role and counts the seats.
 */
export async function startCheckout(
  ws: Workspace,
  input: { period: BillingPeriod; seats: number; email: string | null; origin: string },
  provider: PaymentProvider,
  now = new Date(),
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const expiresAt = new Date(now.getTime() + CHECKOUT_OPEN_MS);
  const decided = await db.transaction(async (tx) => {
    await tx.insert(workspaceBilling).values({ orgId: ws.orgId }).onConflictDoNothing();
    const [row] = await tx
      .select({ planState: workspaceBilling.planState, customerId: workspaceBilling.providerCustomerId, foundingStartsAt: workspaceBilling.foundingStartsAt })
      .from(workspaceBilling)
      .where(eq(workspaceBilling.orgId, ws.orgId))
      .for("update");
    if (row.planState === "paying") return null;
    let discount: CheckoutRequest["foundingDiscount"] = null;
    if (row.foundingStartsAt) discount = foundingDiscountFor(row.foundingStartsAt, now);
    else {
      await lockFoundingPlaces(tx);
      if ((await foundingPlacesTaken(tx, ws.orgId)) < FOUNDING_DISCOUNT.workspaces) {
        await tx.update(workspaceBilling).set({ foundingReservedUntil: new Date(expiresAt.getTime() + FOUNDING_PLACE_GRACE_MS) }).where(eq(workspaceBilling.orgId, ws.orgId));
        discount = foundingDiscountFor(null, now);
      }
    }
    return { discount, customerId: row.customerId, reserved: !row.foundingStartsAt && discount !== null };
  });
  if (!decided) return { ok: false, error: ALREADY_PAYING };

  const billing = `${input.origin}/settings/profile?section=billing`;
  const started = await provider.startCheckout({
    orgId: ws.orgId,
    period: input.period,
    seats: input.seats,
    foundingDiscount: decided.discount,
    customer: decided.customerId ? { id: decided.customerId } : { email: input.email },
    successUrl: `${billing}&checkout=done`,
    cancelUrl: `${billing}&checkout=cancelled`,
    expiresAt,
  });
  if (started.ok) return { ok: true, url: started.url };
  console.error("[billing] checkout not started:", started.reason);
  if (decided.reserved) await db.update(workspaceBilling).set({ foundingReservedUntil: null }).where(and(eq(workspaceBilling.orgId, ws.orgId), isNull(workspaceBilling.foundingStartsAt)));
  return { ok: false, error: CHECKOUT_FAILED };
}

/**
 * Records what the payment provider reported. A completed checkout makes the workspace paying, with its customer,
 * subscription and billing period; a checkout with the founding discount starts the workspace's two years (once).
 * The same event again changes nothing. An event for a workspace Lane doesn't know is ignored.
 */
export async function recordPaymentEvent(event: PaymentEvent): Promise<void> {
  if (event.kind === "subscription_changed") return recordSubscriptionChange(event);
  await db.transaction(async (tx) => {
    const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, event.orgId));
    if (!workspace) {
      console.error("[billing] payment event for an unknown workspace ignored");
      return;
    }
    await tx.insert(workspaceBilling).values({ orgId: event.orgId }).onConflictDoNothing();
    const [row] = await tx
      .select({ planState: workspaceBilling.planState, subscriptionId: workspaceBilling.providerSubscriptionId, foundingStartsAt: workspaceBilling.foundingStartsAt })
      .from(workspaceBilling)
      .where(eq(workspaceBilling.orgId, event.orgId))
      .for("update");
    if (row.planState === "paying" && row.subscriptionId === event.subscriptionId) return;
    await tx
      .update(workspaceBilling)
      .set({
        planState: "paying",
        billingPeriod: event.period,
        providerCustomerId: event.customerId,
        providerSubscriptionId: event.subscriptionId,
        payingSince: sql`coalesce(${workspaceBilling.payingSince}, now())`,
        // A new subscription: changes recorded for an earlier one say nothing about it (#216).
        ...(row.subscriptionId === event.subscriptionId ? {} : { subscriptionChangedAt: null, planEndsAt: null }),
      })
      .where(eq(workspaceBilling.orgId, event.orgId));
    if (event.foundingDiscount && !row.foundingStartsAt) {
      try {
        // Its own savepoint: the payment is recorded even if the place was somehow lost (refused past the 50th).
        await tx.transaction(async (place) => {
          await lockFoundingPlaces(place);
          await place.update(workspaceBilling).set({ foundingStartsAt: sql`now()` }).where(eq(workspaceBilling.orgId, event.orgId));
        });
      } catch (error) {
        console.error("[billing] founding discount paid for without a place:", error instanceof Error ? error.message : "unknown error");
      }
    }
    // The checkout is over: a founding place is now kept by the start above, or not at all.
    await tx.update(workspaceBilling).set({ foundingReservedUntil: null }).where(eq(workspaceBilling.orgId, event.orgId));
  });
}

/**
 * #216: a change to the plan the workspace pays with. Paying keeps (or makes) it paying, with its billing period and
 * the day a cancelled plan ends; unpaid or paused lapses it, and it can be paid again on the provider's page; ended
 * lapses it and the subscription is no longer the workspace's, so paying again is a new checkout. A change older
 * than the last one recorded, or for a subscription the workspace doesn't pay with, changes nothing. Lapsing
 * deletes nothing: only creating new Requests waits (`newRequestBlock`).
 */
async function recordSubscriptionChange(event: Extract<PaymentEvent, { kind: "subscription_changed" }>): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ orgId: workspaceBilling.orgId, changedAt: workspaceBilling.subscriptionChangedAt })
      .from(workspaceBilling)
      .where(eq(workspaceBilling.providerSubscriptionId, event.subscriptionId))
      .for("update");
    if (!row) return;
    if (row.changedAt && row.changedAt > event.at) return;
    const ended = event.state === "ended";
    await tx
      .update(workspaceBilling)
      .set({
        planState: event.state === "paying" ? "paying" : "lapsed",
        ...(event.period ? { billingPeriod: event.period } : {}),
        planEndsAt: event.state === "paying" ? event.endsAt : null,
        subscriptionChangedAt: event.at,
        ...(ended ? { providerSubscriptionId: null } : {}),
      })
      .where(eq(workspaceBilling.orgId, row.orgId));
  });
}

/**
 * Why a new Request (or taking on a Guest submission) is refused right now, or null to go ahead. Nothing is
 * refused while billing isn't enforced, and then this reads nothing. Inside a transaction it first locks the
 * workspace's row, the same lock that numbers new Requests, so two people can't both file the last Free Request.
 * Outside one (the early check before the AI review) it also decides an undecided allowance.
 */
export async function newRequestBlock(ws: Workspace, tx?: RequestTx): Promise<string | null> {
  if (!billingEnforced()) return null;
  if (tx) await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, ws.orgId)).for("update");
  else await decideFreeRequests(ws);
  return creationBlock(await stateOf(tx ?? db, ws.orgId), { enforced: true });
}
