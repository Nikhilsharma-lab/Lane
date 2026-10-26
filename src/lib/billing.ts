import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { and, count, eq, gt, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

import { db, freeRequestAllowances, workspaceBilling, workspaces } from "@/db";
import { FOUNDING_DISCOUNT, foundingDiscountFor, foundingEndsAt, paidSeats, type BillingPeriod } from "./billing-plan-rules";
import { billingEnforced } from "./feature-switches";
import { PLAN_FLOWS, paymentProvider, type BillingAccount, type CheckoutRequest, type PaymentEvent, type PaymentProvider, type PortalFlow } from "./payment-provider";
import { allowanceKeyOf, creationBlock, freeRequestsOf, type FreeRequests, type FreeRequestsState, type PlanState } from "./free-request-rules";
import { afterResponse } from "./after-response";
import type { WorkspaceScope } from "./auth-guard";
import type { RequestTx } from "./request-change-store";
import { workspaceRoster } from "./workspace-roster";

/**
 * #213 (spec #195, item 5): the billing module. It owns the Free Requests count and the plan state; nothing else
 * reads or writes `workspace_billing` or `free_request_allowances`. The count itself is kept by the database
 * (migration 0046): every Request created counts, deleted ones too, and a Guest submission once it is taken on.
 * Access is the caller's job: pages and actions guard the role, then pass only `{ orgId }`.
 *
 * #214 adds paying: checkout on the payment provider's hosted page (`src/lib/payment-provider.ts`), the plan state
 * the provider's events set, and the founding discount for the first 50 paying workspaces, for two years.
 *
 * #215 adds seat counting: paid seats are the workspace's Admins plus Members in Clerk, at least 3. Lane stores no
 * membership, only the number the provider bills; a paying workspace's seats follow Clerk (`followSeatChanges`).
 */

type Workspace = WorkspaceScope;
type Exec = typeof db | RequestTx;

/**
 * The workspace's count, and the allowance it shares with what every other workspace sharing it has counted
 * (decision 2026-10-26: a company domain's 4 Free Requests, or one person's, are shared by all its workspaces).
 */
async function stateOf(exec: Exec, orgId: string): Promise<FreeRequestsState> {
  const [row] = await exec
    .select({ planState: workspaceBilling.planState, used: workspaceBilling.freeRequestsUsed, key: workspaceBilling.allowanceKey })
    .from(workspaceBilling)
    .where(eq(workspaceBilling.orgId, orgId));
  if (!row) return { planState: "free", used: 0, allowance: null };
  if (row.key === null) return { planState: row.planState, used: row.used, allowance: null };
  const [elsewhere] = await exec
    .select({ used: sql<number>`coalesce(sum(${workspaceBilling.freeRequestsUsed}), 0)::int` })
    .from(workspaceBilling)
    .where(and(eq(workspaceBilling.allowanceKey, row.key), ne(workspaceBilling.orgId, orgId)));
  return { planState: row.planState, used: row.used, allowance: allowanceOfKey(row.key, elsewhere?.used ?? 0) };
}

/** The kind and domain a stored allowance key names (a personal one is a whole address). */
function allowanceOfKey(key: string, usedElsewhere: number): FreeRequestsState["allowance"] {
  const at = key.indexOf("@");
  return at < 0 ? { kind: "company_domain", domain: key, usedElsewhere } : { kind: "personal_email", domain: key.slice(at + 1), usedElsewhere };
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
 * Claims the Free Requests of the allowance `creatorEmail` names for this workspace: every workspace that claims a
 * company domain (or a personal address) shares its 4, so a later one gets whatever is left. The first to claim it
 * holds it (`holds_allowance`, kept as a record). Decided once; an address that names no allowance (or none at all)
 * leaves it undecided.
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
export const WAITING_FOR_PAYMENT = "This workspace’s plan is waiting for payment. Update the card to pay what’s due.";

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
      .select({ planState: workspaceBilling.planState, customerId: workspaceBilling.providerCustomerId, subscriptionId: workspaceBilling.providerSubscriptionId, foundingStartsAt: workspaceBilling.foundingStartsAt })
      .from(workspaceBilling)
      .where(eq(workspaceBilling.orgId, ws.orgId))
      .for("update");
    if (row.planState === "paying") return ALREADY_PAYING;
    // #216: a lapsed plan that hasn't ended is paid on the provider's card page; a second plan would bill twice.
    if (row.subscriptionId) return WAITING_FOR_PAYMENT;
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
  if (typeof decided === "string") return { ok: false, error: decided };

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

export const NOTHING_PAID_YET = "This workspace hasn’t paid for Lane yet, so there’s no card or plan to change.";
export const NO_PLAN_TO_CHANGE = "This workspace has no plan to change. Pay for Lane to start one.";
export const BILLING_PAGE_FAILED = "Couldn’t open the billing page. Try again.";

async function providerIds(ws: Workspace) {
  const [row] = await db
    .select({ customerId: workspaceBilling.providerCustomerId, subscriptionId: workspaceBilling.providerSubscriptionId })
    .from(workspaceBilling)
    .where(eq(workspaceBilling.orgId, ws.orgId));
  return { customerId: row?.customerId ?? null, subscriptionId: row?.subscriptionId ?? null };
}

/**
 * #216: one of the payment provider's hosted billing pages for the workspace (change the billing period, update the
 * card, cancel), coming back to Settings → Billing. What changes there reaches Lane as the provider's events. The
 * card can be updated for any workspace the provider knows; the plan can be changed or cancelled only while there is
 * one. The caller guards the role.
 */
export async function openBillingPage(
  ws: Workspace,
  input: { flow: PortalFlow; origin: string },
  provider: PaymentProvider,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { customerId, subscriptionId } = await providerIds(ws);
  if (!customerId) return { ok: false, error: NOTHING_PAID_YET };
  if (!subscriptionId && PLAN_FLOWS.includes(input.flow)) return { ok: false, error: NO_PLAN_TO_CHANGE };
  const opened = await provider.openPortal({ customerId, subscriptionId, flow: input.flow, returnUrl: `${input.origin}/settings/profile?section=billing` });
  if (opened.ok) return { ok: true, url: opened.url };
  console.error("[billing] billing page not opened:", opened.reason);
  return { ok: false, error: BILLING_PAGE_FAILED };
}

/**
 * #216: what Settings → Billing shows from the payment provider: the next bill of the workspace's plan and its
 * latest invoices. A workspace the provider doesn't know has neither, and nothing is asked. Null when the provider
 * can't be read.
 */
export async function readBillingAccount(ws: Workspace, provider: PaymentProvider): Promise<BillingAccount | null> {
  const { customerId, subscriptionId } = await providerIds(ws);
  if (!customerId) return { nextBill: null, invoices: [] };
  const reading = await provider.readAccount({ customerId, subscriptionId });
  if (reading.ok) return reading.account;
  console.error("[billing] billing account not read:", reading.reason);
  return null;
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
        ...(event.seats !== undefined && { billedSeats: event.seats }),
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
 * workspace's row, the same lock that numbers new Requests, then the allowance it shares, so two people (in one
 * workspace or two sharing the allowance) can't both file the last Free Request. Outside one (the early check before
 * the AI review) it also decides an undecided allowance.
 */
export async function newRequestBlock(ws: Workspace, tx?: RequestTx): Promise<string | null> {
  if (!billingEnforced()) return null;
  if (tx) {
    await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, ws.orgId)).for("update");
    await tx.select({ key: freeRequestAllowances.allowanceKey }).from(freeRequestAllowances)
      .innerJoin(workspaceBilling, eq(workspaceBilling.allowanceKey, freeRequestAllowances.allowanceKey))
      .where(eq(workspaceBilling.orgId, ws.orgId)).for("update", { of: freeRequestAllowances });
  } else await decideFreeRequests(ws);
  return creationBlock(await stateOf(tx ?? db, ws.orgId), { enforced: true });
}

export type WorkspaceSeats = {
  /** Admins and Members in Clerk right now. Guests and Viewers are free. */
  adminsAndMembers: number;
  /** The paid seats: Admins and Members, at least 3. */
  paid: number;
  /** The paid seats the payment provider bills now, or null while the workspace doesn't pay. */
  billed: number | null;
};

/** The workspace's seats, counted live from Clerk. Throws if Clerk can't be reached. */
export async function readSeats(ws: Workspace): Promise<WorkspaceSeats> {
  const [people, [row]] = await Promise.all([
    workspaceRoster(ws.orgId),
    db.select({ billed: workspaceBilling.billedSeats }).from(workspaceBilling).where(eq(workspaceBilling.orgId, ws.orgId)),
  ]);
  return { adminsAndMembers: people.length, paid: paidSeats(people.length), billed: row?.billed ?? null };
}

/** What following the workspace's memberships did. `set`: the provider was told the seats Lane hadn't known. */
export type SeatsFollowed =
  | { kind: "off" | "not_paying" | "not_due" | "failed" }
  | { kind: "unchanged" | "set"; seats: number }
  | { kind: "added" | "removed"; from: number; to: number };

/** How often a page view may compare a paying workspace's seats with Clerk. */
const SEAT_CHECK_EVERY_MS = 10 * 60 * 1000;

/**
 * Makes a paying workspace's billed seats follow its Clerk memberships: counts its Admins and Members (at least 3)
 * and tells the payment provider when that differs from what it bills. An added seat is charged part-month from
 * `now`; a removed one (or a Member made a Viewer) lowers the next bill. The provider is given the new total, so a
 * repeat changes nothing. Does nothing while billing isn't enforced or the workspace doesn't pay. `onlyIfDue` (a page
 * view) compares at most every 10 minutes; a change Lane itself makes (a role change) compares straight away.
 * Never throws: when Clerk or the provider can't be reached it reports `failed`, and a later check tries again.
 */
export async function followSeatChanges(
  ws: Workspace,
  { provider = paymentProvider(), now = new Date(), onlyIfDue = false }: { provider?: PaymentProvider | null; now?: Date; onlyIfDue?: boolean } = {},
): Promise<SeatsFollowed> {
  if (!billingEnforced()) return { kind: "off" };
  try {
    const paying = and(eq(workspaceBilling.orgId, ws.orgId), eq(workspaceBilling.planState, "paying"), isNotNull(workspaceBilling.providerSubscriptionId));
    const due = or(isNull(workspaceBilling.seatsCheckedAt), lt(workspaceBilling.seatsCheckedAt, new Date(now.getTime() - SEAT_CHECK_EVERY_MS)));
    const columns = { subscriptionId: workspaceBilling.providerSubscriptionId, billed: workspaceBilling.billedSeats };
    // A due check claims its turn in the same statement, so many page views at once ask Clerk once.
    const [row] = onlyIfDue
      ? await db.update(workspaceBilling).set({ seatsCheckedAt: now }).where(and(paying, due)).returning(columns)
      : await db.select(columns).from(workspaceBilling).where(paying);
    if (!row?.subscriptionId) {
      if (!onlyIfDue) return { kind: "not_paying" };
      const [stillPaying] = await db.select({ orgId: workspaceBilling.orgId }).from(workspaceBilling).where(paying);
      return { kind: stillPaying ? "not_due" : "not_paying" };
    }

    const seats = paidSeats((await workspaceRoster(ws.orgId)).length);
    const record = () => db.update(workspaceBilling).set({ billedSeats: seats, seatsCheckedAt: now }).where(eq(workspaceBilling.orgId, ws.orgId));
    if (row.billed === seats) {
      await record();
      return { kind: "unchanged", seats };
    }
    // Seats Lane didn't know it bills (a payment reported without them) are set for the next bill, with nothing charged now.
    const added = row.billed !== null && seats > row.billed;
    const changed = provider ? await provider.changeSeats({ subscriptionId: row.subscriptionId, seats, charge: added ? "part_month_now" : "next_bill", at: now }) : null;
    if (!changed?.ok) {
      console.error("[billing] seats not changed:", changed?.reason ?? "no payment provider");
      return { kind: "failed" };
    }
    await record();
    if (row.billed === null) return { kind: "set", seats };
    return { kind: added ? "added" : "removed", from: row.billed, to: seats };
  } catch (error) {
    console.error("[billing] seats not followed:", error instanceof Error ? error.message : "unknown error");
    return { kind: "failed" };
  }
}

/**
 * From any page view: follows the workspace's seats after the response, if a check is due. This is how a seat
 * changed in Clerk (an invitation accepted, someone removed) reaches the bill without Lane being told. Reads
 * nothing while billing isn't enforced.
 */
export function followSeatChangesAfterResponse(ws: Workspace): void {
  if (!billingEnforced()) return;
  afterResponse("billing", () => followSeatChanges(ws, { onlyIfDue: true }));
}
