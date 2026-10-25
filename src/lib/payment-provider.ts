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

/** What the provider reports. The founding flag is the one Lane gave the checkout. */
export type PaymentEvent = {
  kind: "checkout_completed";
  orgId: string;
  checkoutId: string;
  customerId: string;
  subscriptionId: string;
  period: BillingPeriod;
  foundingDiscount: boolean;
};

/** `event: null` is a genuine event Lane has no use for; `ok: false` is one that isn't from the provider. */
export type EventReading = { ok: true; event: PaymentEvent | null } | { ok: false };

export type PaymentProvider = {
  startCheckout(request: CheckoutRequest): Promise<CheckoutStarted>;
  readEvent(body: string, headers: Headers, now: Date): Promise<EventReading>;
};

const STAND_IN_SIGNATURE = "lane-stand-in-signature";

/**
 * The stand-in: records every checkout and answers with a made-up hosted page. `complete` gives the signed event
 * body the provider would send once that checkout is paid, and `headers` the signature it would carry.
 */
export function recordingPaymentProvider({ fail = false }: { fail?: boolean } = {}) {
  const checkouts: CheckoutRequest[] = [];
  const secret = "stand-in-webhook-secret";
  const provider: PaymentProvider & { checkouts: CheckoutRequest[]; headers(): Headers; complete(index?: number, ids?: { customerId?: string; subscriptionId?: string }): string } = {
    checkouts,
    headers: () => new Headers({ [STAND_IN_SIGNATURE]: secret }),
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
      return { ok: true, event: JSON.parse(body) as PaymentEvent };
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
  async function post(path: string, form: URLSearchParams): Promise<{ ok: true; answer: Record<string, unknown> } | { ok: false; status: number; code?: string }> {
    try {
      const response = await send(`${STRIPE_API}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      });
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
      let parsed: { type?: string; data?: { object?: Record<string, unknown> } };
      try {
        parsed = JSON.parse(body);
      } catch {
        return { ok: false };
      }
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
