/**
 * #214 (spec #195, item 5): the payment-provider interface the billing module pays through, with its adapters.
 * Checkout happens on the provider's own hosted page; the provider then tells Lane, by a signed event to
 * `POST /api/billing/webhook`, that a workspace paid. The Stripe adapter is used only when every Stripe name is set
 * (`src/lib/feature-switches.ts`); otherwise there is no provider and paying isn't available. Tests use the
 * recording stand-in, which sends nothing anywhere.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { FOUNDING_DISCOUNT, type BillingPeriod } from "./billing-plan-rules";
import { stripeBilling, type StripeBilling } from "./feature-switches";

export type CheckoutRequest = {
  orgId: string;
  period: BillingPeriod;
  /** Paid seats, at least 3. */
  seats: number;
  /** The founding discount this checkout gets, or null for the list price. */
  foundingDiscount: { percentOff: number; months: number } | null;
  /** The workspace's customer at the provider once it has one; before that, the paying Admin's address. */
  customer: { id: string } | { email: string | null };
  successUrl: string;
  cancelUrl: string;
  /** The hosted page stops taking payment after this. */
  expiresAt: Date;
};

export type CheckoutStarted = { ok: true; checkoutId: string; url: string } | { ok: false; reason: string };

/**
 * #216: what a subscription is now. `paying`: paid up (or its payment still being retried). `lapsed`: unpaid or
 * paused, and can be paid again on the provider's page. `ended`: cancelled for good; paying again is a new checkout.
 */
export type SubscriptionState = "paying" | "lapsed" | "ended";

/**
 * What the provider reports. A completed checkout carries the founding flag Lane gave it. A subscription change
 * (#216) carries the plan's state, its billing period, when a cancelled plan stops (`endsAt`) and when the provider
 * made the change (`at`), so an older change arriving late can't undo a newer one.
 */
export type PaymentEvent =
  | {
    kind: "checkout_completed";
    orgId: string;
    checkoutId: string;
    customerId: string;
    subscriptionId: string;
    period: BillingPeriod;
    foundingDiscount: boolean;
  }
  | {
    kind: "subscription_changed";
    subscriptionId: string;
    state: SubscriptionState;
    period: BillingPeriod | null;
    endsAt: Date | null;
    at: Date;
  };

/** `event: null` is a genuine event Lane has no use for; `ok: false` is one that isn't from the provider. */
export type EventReading = { ok: true; event: PaymentEvent | null } | { ok: false };

/** #216: the provider's hosted billing pages an Admin can open from Settings → Billing. */
export type PortalFlow = "change_period" | "update_card" | "cancel";
/** The flows that act on the plan itself, so need the workspace's subscription. */
export const PLAN_FLOWS: readonly PortalFlow[] = ["change_period", "cancel"];

export type PortalRequest = { customerId: string; subscriptionId: string | null; flow: PortalFlow; returnUrl: string };
export type PortalOpened = { ok: true; url: string } | { ok: false; reason: string };

/** An invoice as the provider issued it; `url` is its own hosted page. */
export type Invoice = {
  id: string;
  number: string | null;
  issuedAt: Date;
  amountCents: number;
  currency: string;
  status: "open" | "paid" | "void" | "uncollectible";
  url: string | null;
};
export type BillingAccount = { nextBill: { amountCents: number; currency: string; on: Date } | null; invoices: Invoice[] };
export type AccountReading = { ok: true; account: BillingAccount } | { ok: false; reason: string };

export type PaymentProvider = {
  startCheckout(request: CheckoutRequest): Promise<CheckoutStarted>;
  readEvent(body: string, headers: Headers, now: Date): Promise<EventReading>;
  /** #216: a hosted page to change the billing period, update the card or cancel; the Admin comes back to `returnUrl`. */
  openPortal(request: PortalRequest): Promise<PortalOpened>;
  /** #216: the customer's latest invoices, newest first, and the next bill of its plan (none without one). */
  readAccount(request: { customerId: string; subscriptionId: string | null }): Promise<AccountReading>;
};

/** How many invoices Settings → Billing lists; older ones stay on the provider's pages. */
export const INVOICES_SHOWN = 12;

const STAND_IN_SIGNATURE = "lane-stand-in-signature";

type SubscriptionChange = Extract<PaymentEvent, { kind: "subscription_changed" }>;

export type RecordingPaymentProvider = PaymentProvider & {
  checkouts: CheckoutRequest[];
  /** #216: every hosted billing page opened. */
  portals: PortalRequest[];
  /** #216: what `readAccount` answers; "unavailable" makes it fail. */
  account: BillingAccount | "unavailable";
  headers(): Headers;
  complete(index?: number, ids?: { customerId?: string; subscriptionId?: string }): string;
  /** #216: the event body the provider would send when a subscription changes. */
  changeSubscription(subscriptionId: string, change: Partial<Omit<SubscriptionChange, "kind" | "subscriptionId">> & Pick<SubscriptionChange, "state">): string;
};

/**
 * The stand-in: records every checkout and hosted billing page and answers with made-up pages. `complete` gives the
 * signed event body the provider would send once that checkout is paid, `changeSubscription` the one for a plan that
 * changed (#216), and `headers` the signature they would carry.
 */
export function recordingPaymentProvider({ fail = false }: { fail?: boolean } = {}): RecordingPaymentProvider {
  const checkouts: CheckoutRequest[] = [];
  const portals: PortalRequest[] = [];
  const secret = "stand-in-webhook-secret";
  const provider: RecordingPaymentProvider = {
    checkouts,
    portals,
    account: { nextBill: null, invoices: [] },
    headers: () => new Headers({ [STAND_IN_SIGNATURE]: secret }),
    changeSubscription(subscriptionId, change) {
      const event: SubscriptionChange = { kind: "subscription_changed", subscriptionId, period: null, endsAt: null, at: new Date(), ...change };
      return JSON.stringify(event);
    },
    async openPortal(request) {
      if (fail) return { ok: false, reason: "stand_in_failed" };
      if (!request.subscriptionId && PLAN_FLOWS.includes(request.flow)) return { ok: false, reason: "no_subscription" };
      portals.push(request);
      return { ok: true, url: `https://payments.stand-in.test/portal/${request.flow}/${portals.length}` };
    },
    async readAccount() {
      return provider.account === "unavailable" ? { ok: false, reason: "stand_in_failed" } : { ok: true, account: provider.account };
    },
    complete(index = checkouts.length - 1, ids: { customerId?: string; subscriptionId?: string } = {}): string {
      const checkout = checkouts[index];
      const name = `${checkout.orgId}_${index + 1}`;
      const event: PaymentEvent = {
        kind: "checkout_completed",
        orgId: checkout.orgId,
        checkoutId: `stand_in_checkout_${name}`,
        customerId: ids.customerId ?? ("id" in checkout.customer ? checkout.customer.id : `stand_in_customer_${name}`),
        subscriptionId: ids.subscriptionId ?? `stand_in_subscription_${name}`,
        period: checkout.period,
        foundingDiscount: checkout.foundingDiscount !== null,
      };
      return JSON.stringify(event);
    },
    async startCheckout(request: CheckoutRequest): Promise<CheckoutStarted> {
      if (fail) return { ok: false, reason: "stand_in_failed" };
      checkouts.push(request);
      return { ok: true, checkoutId: `stand_in_checkout_${checkouts.length}`, url: `https://payments.stand-in.test/checkout/${checkouts.length}` };
    },
    async readEvent(body: string, headers: Headers): Promise<EventReading> {
      if (headers.get(STAND_IN_SIGNATURE) !== secret) return { ok: false };
      const event = JSON.parse(body) as PaymentEvent;
      if (event.kind === "subscription_changed") return { ok: true, event: { ...event, at: new Date(event.at), endsAt: event.endsAt && new Date(event.endsAt) } };
      return { ok: true, event };
    },
  };
  return provider;
}

export const STRIPE_API = "https://api.stripe.com/v1";
/** How old a signed Stripe event may be, as Stripe's own libraries allow. */
const STRIPE_TOLERANCE_SECONDS = 300;

type Fetch = typeof fetch;

/**
 * The Stripe adapter: Stripe Checkout (a hosted page) in subscription mode, with the yearly or monthly Price per
 * seat, and the founding coupon. Events are checked against the webhook signing secret. Failures come back as
 * reasons (never thrown) carrying no key, address or card detail.
 */
export function stripePaymentProvider(config: Extract<StripeBilling, { on: true }>, { fetch: send = fetch }: { fetch?: Fetch } = {}): PaymentProvider {
  type Answer = { ok: true; answer: Record<string, unknown> } | { ok: false; status: number; code?: string };
  const post = (path: string, form: URLSearchParams) => call(path, form);
  async function call(path: string, form?: URLSearchParams): Promise<Answer> {
    try {
      const response = await send(`${STRIPE_API}${path}`, form
        ? { method: "POST", headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString(), signal: AbortSignal.timeout(10_000) }
        : { method: "GET", headers: { Authorization: `Bearer ${config.secretKey}` }, signal: AbortSignal.timeout(10_000) });
      const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok) return { ok: true, answer };
      const code = (answer.error as { code?: string } | undefined)?.code;
      return { ok: false, status: response.status, code };
    } catch {
      return { ok: false, status: 0 };
    }
  }

  /** The founding coupon for a full two years; a shorter one (a founding workspace paying again) made once by name. */
  async function couponFor(discount: { percentOff: number; months: number }): Promise<string | null> {
    if (discount.months === FOUNDING_DISCOUNT.months && discount.percentOff === FOUNDING_DISCOUNT.percentOff) return config.foundingCoupon;
    const id = `lane_founding_${discount.percentOff}_${discount.months}m`;
    const made = await post("/coupons", new URLSearchParams({
      id, percent_off: String(discount.percentOff), duration: "repeating", duration_in_months: String(discount.months), name: "Lane founding discount",
    }));
    return made.ok || made.code === "resource_already_exists" ? id : null;
  }

  return {
    async startCheckout(request) {
      const form = new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": request.period === "yearly" ? config.priceYearly : config.priceMonthly,
        "line_items[0][quantity]": String(request.seats),
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        client_reference_id: request.orgId,
        expires_at: String(Math.floor(request.expiresAt.getTime() / 1000)),
        "metadata[org_id]": request.orgId,
        "metadata[period]": request.period,
        "metadata[founding]": request.foundingDiscount ? "1" : "0",
        "subscription_data[metadata][org_id]": request.orgId,
      });
      if ("id" in request.customer) form.set("customer", request.customer.id);
      else if (request.customer.email) form.set("customer_email", request.customer.email);
      if (request.foundingDiscount) {
        const coupon = await couponFor(request.foundingDiscount);
        if (!coupon) return { ok: false, reason: "stripe_coupon" };
        form.set("discounts[0][coupon]", coupon);
      }
      const made = await post("/checkout/sessions", form);
      if (!made.ok) return { ok: false, reason: made.status ? `stripe_${made.status}` : "stripe_unreachable" };
      const { id, url } = made.answer as { id?: string; url?: string };
      return id && url ? { ok: true, checkoutId: id, url } : { ok: false, reason: "stripe_no_url" };
    },

    async readEvent(body, headers, now) {
      if (!stripeSignatureValid(body, headers.get("stripe-signature"), config.webhookSecret, now)) return { ok: false };
      let parsed: StripeEnvelope;
      try {
        parsed = JSON.parse(body);
      } catch {
        return { ok: false };
      }
      if (parsed.type?.startsWith("customer.subscription.")) return { ok: true, event: subscriptionEvent(parsed) };
      const session = parsed.data?.object;
      if (parsed.type !== "checkout.session.completed" || !session || session.mode !== "subscription") return { ok: true, event: null };
      const metadata = (session.metadata ?? {}) as Record<string, string | undefined>;
      const idOf = (value: unknown) => (typeof value === "string" ? value : (value as { id?: string } | null)?.id);
      const [customerId, subscriptionId] = [idOf(session.customer), idOf(session.subscription)];
      const orgId = metadata.org_id ?? (session.client_reference_id as string | undefined);
      const period = metadata.period;
      if (!orgId || !customerId || !subscriptionId || (period !== "yearly" && period !== "monthly")) return { ok: true, event: null };
      return { ok: true, event: { kind: "checkout_completed", orgId, checkoutId: String(session.id), customerId, subscriptionId, period, foundingDiscount: metadata.founding === "1" } };
    },

    // The Customer Portal, deep-linked to one flow; what each flow offers (both prices, cancelling at the period's
    // end, the invoice history) is the portal's configuration in Stripe (DEFERRED.md, "Switching billing on").
    async openPortal(request) {
      if (!request.subscriptionId && PLAN_FLOWS.includes(request.flow)) return { ok: false, reason: "no_subscription" };
      const form = new URLSearchParams({ customer: request.customerId, return_url: request.returnUrl });
      if (request.flow === "update_card") form.set("flow_data[type]", "payment_method_update");
      else {
        const type = request.flow === "cancel" ? "subscription_cancel" : "subscription_update";
        form.set("flow_data[type]", type);
        form.set(`flow_data[${type}][subscription]`, request.subscriptionId!);
      }
      form.set("flow_data[after_completion][type]", "redirect");
      form.set("flow_data[after_completion][redirect][return_url]", request.returnUrl);
      const made = await post("/billing_portal/sessions", form);
      if (!made.ok) return { ok: false, reason: made.status ? `stripe_${made.status}` : "stripe_unreachable" };
      const { url } = made.answer as { url?: string };
      return url ? { ok: true, url } : { ok: false, reason: "stripe_no_url" };
    },

    async readAccount({ customerId, subscriptionId }) {
      const listed = await call(`/invoices?${new URLSearchParams({ customer: customerId, limit: String(INVOICES_SHOWN) })}`);
      if (!listed.ok) return { ok: false, reason: listed.status ? `stripe_${listed.status}` : "stripe_unreachable" };
      const invoices = ((listed.answer.data ?? []) as Record<string, unknown>[]).flatMap(invoiceOf);
      if (!subscriptionId) return { ok: true, account: { nextBill: null, invoices } };
      // A plan that is cancelled (or has nothing left to bill) has no next invoice: Stripe answers 4xx.
      const preview = await post("/invoices/create_preview", new URLSearchParams({ customer: customerId, subscription: subscriptionId }));
      if (!preview.ok) return preview.status >= 400 && preview.status < 500 ? { ok: true, account: { nextBill: null, invoices } } : { ok: false, reason: preview.status ? `stripe_${preview.status}` : "stripe_unreachable" };
      const { amount_due: amount, currency, next_payment_attempt: attempt, period_end: periodEnd } = preview.answer as { amount_due?: number; currency?: string; next_payment_attempt?: number | null; period_end?: number };
      const on = attempt ?? periodEnd;
      const nextBill = typeof amount === "number" && currency && on ? { amountCents: amount, currency, on: new Date(on * 1000) } : null;
      return { ok: true, account: { nextBill, invoices } };
    },
  };
}

const INVOICE_STATUSES = new Set<Invoice["status"]>(["open", "paid", "void", "uncollectible"]);

/** A Stripe invoice as Lane lists it; drafts aren't issued yet, so aren't listed. */
function invoiceOf(raw: Record<string, unknown>): Invoice[] {
  const status = raw.status as Invoice["status"];
  if (!INVOICE_STATUSES.has(status) || typeof raw.id !== "string" || typeof raw.created !== "number" || typeof raw.total !== "number") return [];
  return [{
    id: raw.id,
    number: typeof raw.number === "string" ? raw.number : null,
    issuedAt: new Date(raw.created * 1000),
    amountCents: raw.total,
    currency: String(raw.currency ?? "usd"),
    status,
    url: typeof raw.hosted_invoice_url === "string" ? raw.hosted_invoice_url : null,
  }];
}

type StripeEnvelope = { type?: string; created?: number; data?: { object?: Record<string, unknown> } };

/** Stripe subscription statuses, by what they mean for the plan; any other (`incomplete`) is still a checkout. */
const SUBSCRIPTION_STATES: Record<string, SubscriptionState> = {
  active: "paying", trialing: "paying", past_due: "paying", unpaid: "lapsed", paused: "lapsed", canceled: "ended", incomplete_expired: "ended",
};
const INTERVALS: Record<string, BillingPeriod> = { year: "yearly", month: "monthly" };
const SUBSCRIPTION_EVENTS = new Set(["customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"]);

/** A Stripe subscription event as the plan's state, or null for one that says nothing about the plan. */
function subscriptionEvent(envelope: StripeEnvelope): PaymentEvent | null {
  const subscription = envelope.data?.object;
  if (!SUBSCRIPTION_EVENTS.has(envelope.type ?? "") || !subscription || typeof subscription.id !== "string" || typeof envelope.created !== "number") return null;
  const state = envelope.type === "customer.subscription.deleted" ? "ended" : SUBSCRIPTION_STATES[String(subscription.status)];
  if (!state) return null;
  const item = ((subscription.items as { data?: Record<string, unknown>[] } | undefined)?.data ?? [])[0] ?? {};
  const interval = (item.price as { recurring?: { interval?: string } } | undefined)?.recurring?.interval;
  // Stripe moved the period's end onto the subscription's items (API 2025-03-31); older versions keep it on the subscription.
  const periodEnd = Number(item.current_period_end ?? subscription.current_period_end);
  const cancelAt = Number(subscription.cancel_at);
  const endsAt = cancelAt > 0 ? cancelAt : subscription.cancel_at_period_end === true && periodEnd > 0 ? periodEnd : null;
  return {
    kind: "subscription_changed",
    subscriptionId: subscription.id,
    state,
    period: (interval && INTERVALS[interval]) || null,
    endsAt: state === "paying" && endsAt ? new Date(endsAt * 1000) : null,
    at: new Date(envelope.created * 1000),
  };
}

/** Stripe's `Stripe-Signature`: `t=<seconds>,v1=<hex HMAC-SHA256 of "t.body">`, any v1 matching, within the tolerance. */
export function stripeSignatureValid(body: string, header: string | null, secret: string, now: Date): boolean {
  if (!header) return false;
  const parts = header.split(",").map((part) => part.split("=") as [string, string | undefined]);
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  if (!Number.isFinite(timestamp) || Math.abs(now.getTime() / 1000 - timestamp) > STRIPE_TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return parts.some(([key, value]) => {
    if (key !== "v1" || !value || !/^[0-9a-f]{64}$/i.test(value)) return false;
    return timingSafeEqual(Buffer.from(value, "hex"), expected);
  });
}

/** The payment provider, or null while paying isn't set up (no Stripe keys). */
export function paymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider | null {
  const stripe = stripeBilling(env);
  return stripe.on ? stripePaymentProvider(stripe) : null;
}
