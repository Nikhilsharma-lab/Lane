/**
 * #214 (spec #195, item 5): the Lane plan. Client-safe and pure. One plan with everything, priced per paid seat
 * (#215 counts the seats), shown yearly first: $30 per seat per month billed yearly, $36 billed monthly. The first
 * 50 workspaces to pay get the founding discount, 40% off for two years from their first payment. The prices are a
 * starting point, checked again at launch; the payment provider's prices must say the same (DEFERRED.md).
 */

export type BillingPeriod = "yearly" | "monthly";

/** Why there is nothing to pay: billing isn't enforced yet, or there is no payment provider. */
export const NOT_CHARGING = "Lane isn’t charging yet, so there’s nothing to pay.";
export const PAYING_UNAVAILABLE = "Paying by card isn’t available yet.";
/** #216: without a payment provider there are no hosted billing pages, invoices or next bill to show. */
export const BILLING_PAGES_UNAVAILABLE = "The payment provider’s billing pages aren’t available yet.";

/** Yearly first. */
export const BILLING_PERIODS: readonly BillingPeriod[] = ["yearly", "monthly"];

/** List price per seat per month, in cents. */
const LIST_CENTS: Record<BillingPeriod, number> = { yearly: 3000, monthly: 3600 };

export const FOUNDING_DISCOUNT = { percentOff: 40, months: 24, workspaces: 50 } as const;

/** Paid seats are the workspace's Admins and Members, with at least this many. */
export const PAID_SEAT_MINIMUM = 3;

export const paidSeats = (adminsAndMembers: number) => Math.max(PAID_SEAT_MINIMUM, adminsAndMembers);

/** "$30", "$21.60". */
function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export type SeatPrice = { price: string; list: string; discounted: boolean };

/** The price per seat per month, and the list price it is shown against. */
export function seatPrice(period: BillingPeriod, founding: boolean): SeatPrice {
  const list = LIST_CENTS[period];
  const price = founding ? Math.round((list * (100 - FOUNDING_DISCOUNT.percentOff)) / 100) : list;
  return { price: dollars(price), list: dollars(list), discounted: price !== list };
}

function addMonths(at: Date, months: number): Date {
  const next = new Date(at);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/** When a founding discount that started at `startsAt` ends. */
export const foundingEndsAt = (startsAt: Date) => addMonths(startsAt, FOUNDING_DISCOUNT.months);

/**
 * The discount a checkout gets now, for a founding workspace: the full two years for its first payment
 * (`startsAt` null), or what is left of them (in whole months, rounded up) if it pays again, and none after.
 */
export function foundingDiscountFor(startsAt: Date | null, now: Date): { percentOff: number; months: number } | null {
  if (!startsAt) return { percentOff: FOUNDING_DISCOUNT.percentOff, months: FOUNDING_DISCOUNT.months };
  const ends = foundingEndsAt(startsAt);
  if (ends <= now) return null;
  let months = 0;
  while (addMonths(now, months) < ends) months++;
  return { percentOff: FOUNDING_DISCOUNT.percentOff, months };
}
