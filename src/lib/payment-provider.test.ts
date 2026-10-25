import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paymentProvider, stripePaymentProvider, type CheckoutRequest } from "./payment-provider";

/**
 * #214: the Stripe adapter, against a stand-in for Stripe's API (no network). What it asks Stripe for, and which
 * of Stripe's events it believes.
 */
const CONFIG = { on: true as const, secretKey: "sk_test_stand_in", webhookSecret: "whsec_stand_in", priceYearly: "price_yearly", priceMonthly: "price_monthly", foundingCoupon: "coupon_founding" };
const NOW = new Date("2026-10-25T12:00:00Z");

function stripe(answers: { status: number; body: unknown }[] = [{ status: 200, body: { id: "cs_1", url: "https://checkout.stripe.test/c/cs_1" } }]) {
  const calls: { url: string; method?: string; form: URLSearchParams; auth: string | null }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method, form: new URLSearchParams(init.body ? String(init.body) : ""), auth: new Headers(init.headers).get("authorization") });
    const answer = answers.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  }) as unknown as typeof globalThis.fetch;
  return { calls, provider: stripePaymentProvider(CONFIG, { fetch }) };
}

const request = (overrides: Partial<CheckoutRequest> = {}): CheckoutRequest => ({
  orgId: "org_1", period: "yearly", seats: 3, foundingDiscount: { percentOff: 40, months: 24 }, customer: { email: "admin@acme.example" },
  successUrl: "https://lane.test/settings/profile?section=billing&checkout=done", cancelUrl: "https://lane.test/settings/profile?section=billing&checkout=cancelled",
  expiresAt: new Date("2026-10-25T13:00:00Z"), ...overrides,
});

describe("Stripe checkout", () => {
  it("opens a hosted subscription checkout for the seats, with the founding coupon", async () => {
    const { calls, provider } = stripe();
    expect(await provider.startCheckout(request())).toEqual({ ok: true, checkoutId: "cs_1", url: "https://checkout.stripe.test/c/cs_1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0].auth).toBe("Bearer sk_test_stand_in");
    expect(Object.fromEntries(calls[0].form)).toEqual({
      mode: "subscription", "line_items[0][price]": "price_yearly", "line_items[0][quantity]": "3",
      success_url: "https://lane.test/settings/profile?section=billing&checkout=done", cancel_url: "https://lane.test/settings/profile?section=billing&checkout=cancelled",
      client_reference_id: "org_1", expires_at: String(Date.parse("2026-10-25T13:00:00Z") / 1000),
      "metadata[org_id]": "org_1", "metadata[period]": "yearly", "metadata[founding]": "1", "subscription_data[metadata][org_id]": "org_1",
      customer_email: "admin@acme.example", "discounts[0][coupon]": "coupon_founding",
    });
  });

  it("charges the list price monthly for a workspace Stripe already knows", async () => {
    const { calls, provider } = stripe();
    await provider.startCheckout(request({ period: "monthly", seats: 8, foundingDiscount: null, customer: { id: "cus_1" } }));
    const form = Object.fromEntries(calls[0].form);
    expect(form).toMatchObject({ "line_items[0][price]": "price_monthly", "line_items[0][quantity]": "8", customer: "cus_1", "metadata[founding]": "0" });
    expect(form).not.toHaveProperty("discounts[0][coupon]");
    expect(form).not.toHaveProperty("customer_email");
  });

  it("makes a shorter founding coupon once for a founding workspace paying again", async () => {
    const { calls, provider } = stripe([
      { status: 400, body: { error: { code: "resource_already_exists" } } },
      { status: 200, body: { id: "cs_2", url: "https://checkout.stripe.test/c/cs_2" } },
    ]);
    expect(await provider.startCheckout(request({ foundingDiscount: { percentOff: 40, months: 6 } }))).toMatchObject({ ok: true });
    expect(calls[0].url).toBe("https://api.stripe.com/v1/coupons");
    expect(Object.fromEntries(calls[0].form)).toEqual({ id: "lane_founding_40_6m", percent_off: "40", duration: "repeating", duration_in_months: "6", name: "Lane founding discount" });
    expect(calls[1].form.get("discounts[0][coupon]")).toBe("lane_founding_40_6m");
  });

  it("gives a reason, never the key, when Stripe refuses", async () => {
    const { provider } = stripe([{ status: 401, body: { error: { message: "Invalid API Key provided: sk_test_stand_in" } } }]);
    expect(await provider.startCheckout(request({ foundingDiscount: null }))).toEqual({ ok: false, reason: "stripe_401" });
  });
});

describe("Stripe events", () => {
  const completed = JSON.stringify({
    type: "checkout.session.completed",
    data: { object: { id: "cs_1", mode: "subscription", client_reference_id: "org_1", customer: "cus_1", subscription: "sub_1", metadata: { org_id: "org_1", period: "monthly", founding: "1" } } },
  });
  const signed = (body: string, at = NOW, secret = CONFIG.webhookSecret) => {
    const t = Math.floor(at.getTime() / 1000);
    return new Headers({ "stripe-signature": `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}` });
  };

  it("reads a signed completed checkout", async () => {
    const { provider } = stripe();
    expect(await provider.readEvent(completed, signed(completed), NOW)).toEqual({ ok: true, event: {
      kind: "checkout_completed", orgId: "org_1", checkoutId: "cs_1", customerId: "cus_1", subscriptionId: "sub_1", period: "monthly", foundingDiscount: true,
    } });
  });

  it("refuses an event that isn't signed with the webhook secret, or is too old", async () => {
    const { provider } = stripe();
    expect(await provider.readEvent(completed, new Headers(), NOW)).toEqual({ ok: false });
    expect(await provider.readEvent(completed, signed(completed, NOW, "whsec_other"), NOW)).toEqual({ ok: false });
    expect(await provider.readEvent(completed, signed(completed, new Date(NOW.getTime() - 10 * 60_000)), NOW)).toEqual({ ok: false });
    expect(await provider.readEvent(`${completed} `, signed(completed), NOW)).toEqual({ ok: false });
  });

  it("has no use for other events", async () => {
    const { provider } = stripe();
    const other = JSON.stringify({ type: "invoice.paid", data: { object: { id: "in_1" } } });
    expect(await provider.readEvent(other, signed(other), NOW)).toEqual({ ok: true, event: null });
  });
});

describe("Stripe subscription events (#216)", () => {
  const signed = (body: string, at = NOW) => {
    const t = Math.floor(at.getTime() / 1000);
    return new Headers({ "stripe-signature": `t=${t},v1=${createHmac("sha256", CONFIG.webhookSecret).update(`${t}.${body}`).digest("hex")}` });
  };
  const CREATED = Math.floor(Date.parse("2026-10-25T11:59:00Z") / 1000);
  const PERIOD_END = Math.floor(Date.parse("2027-10-25T00:00:00Z") / 1000);
  const subscription = (type: string, object: Record<string, unknown>) => JSON.stringify({
    id: "evt_1", type, created: CREATED,
    data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "active", cancel_at_period_end: false, cancel_at: null,
      items: { data: [{ price: { recurring: { interval: "year" } }, current_period_end: PERIOD_END }] }, ...object } },
  });
  const read = async (body: string) => stripe().provider.readEvent(body, signed(body), NOW);
  const change = (fields: Record<string, unknown>) => ({ ok: true, event: { kind: "subscription_changed", subscriptionId: "sub_1", period: "yearly", endsAt: null, at: new Date(CREATED * 1000), ...fields } });

  it("reads a plan that is paid up as paying, in the period its price bills", async () => {
    expect(await read(subscription("customer.subscription.updated", {}))).toEqual(change({ state: "paying" }));
    expect(await read(subscription("customer.subscription.updated", { status: "past_due", items: { data: [{ price: { recurring: { interval: "month" } } }] } })))
      .toEqual(change({ state: "paying", period: "monthly" }));
  });

  it("reads a cancelled plan that runs to the end of its period, with the day it ends", async () => {
    expect(await read(subscription("customer.subscription.updated", { cancel_at_period_end: true }))).toEqual(change({ state: "paying", endsAt: new Date(PERIOD_END * 1000) }));
    const cancelAt = PERIOD_END - 86_400;
    expect(await read(subscription("customer.subscription.updated", { cancel_at: cancelAt }))).toEqual(change({ state: "paying", endsAt: new Date(cancelAt * 1000) }));
  });

  it("reads an unpaid or paused plan as lapsed, and a cancelled or deleted one as ended", async () => {
    expect(await read(subscription("customer.subscription.updated", { status: "unpaid" }))).toEqual(change({ state: "lapsed" }));
    expect(await read(subscription("customer.subscription.paused", { status: "paused" }))).toEqual(change({ state: "lapsed" }));
    expect(await read(subscription("customer.subscription.updated", { status: "canceled" }))).toEqual(change({ state: "ended" }));
    expect(await read(subscription("customer.subscription.deleted", { status: "canceled" }))).toEqual(change({ state: "ended" }));
  });

  it("has no use for a subscription still waiting for its first payment", async () => {
    expect(await read(subscription("customer.subscription.updated", { status: "incomplete" }))).toEqual({ ok: true, event: null });
    expect(await read(subscription("customer.subscription.created", {}))).toEqual({ ok: true, event: null });
  });
});

describe("Stripe's hosted billing pages (#216)", () => {
  const RETURN = "https://lane.test/settings/profile?section=billing";
  const portal = { status: 200, body: { id: "bps_1", url: "https://billing.stripe.test/p/session/1" } };

  it("opens the card page for the workspace's customer, coming back to Billing", async () => {
    const { calls, provider } = stripe([portal]);
    expect(await provider.openPortal({ customerId: "cus_1", subscriptionId: "sub_1", flow: "update_card", returnUrl: RETURN })).toEqual({ ok: true, url: "https://billing.stripe.test/p/session/1" });
    expect(calls[0]).toMatchObject({ url: "https://api.stripe.com/v1/billing_portal/sessions", method: "POST", auth: "Bearer sk_test_stand_in" });
    expect(Object.fromEntries(calls[0].form)).toEqual({
      customer: "cus_1", return_url: RETURN, "flow_data[type]": "payment_method_update",
      "flow_data[after_completion][type]": "redirect", "flow_data[after_completion][redirect][return_url]": RETURN,
    });
  });

  it("opens the plan's own page to change its billing period, or to cancel it", async () => {
    const { calls, provider } = stripe([portal, portal]);
    await provider.openPortal({ customerId: "cus_1", subscriptionId: "sub_1", flow: "change_period", returnUrl: RETURN });
    await provider.openPortal({ customerId: "cus_1", subscriptionId: "sub_1", flow: "cancel", returnUrl: RETURN });
    expect(Object.fromEntries(calls[0].form)).toMatchObject({ "flow_data[type]": "subscription_update", "flow_data[subscription_update][subscription]": "sub_1" });
    expect(Object.fromEntries(calls[1].form)).toMatchObject({ "flow_data[type]": "subscription_cancel", "flow_data[subscription_cancel][subscription]": "sub_1" });
  });

  it("opens the portal's own page to keep a cancelled plan (Stripe offers renewing there)", async () => {
    const { calls, provider } = stripe([portal]);
    await provider.openPortal({ customerId: "cus_1", subscriptionId: "sub_1", flow: "renew", returnUrl: RETURN });
    expect(Object.fromEntries(calls[0].form)).toEqual({ customer: "cus_1", return_url: RETURN });
  });

  it("can't change or cancel a plan there is none of, and gives a reason when Stripe refuses", async () => {
    const { calls, provider } = stripe([{ status: 500, body: {} }]);
    expect(await provider.openPortal({ customerId: "cus_1", subscriptionId: null, flow: "cancel", returnUrl: RETURN })).toEqual({ ok: false, reason: "no_subscription" });
    expect(calls).toEqual([]);
    expect(await provider.openPortal({ customerId: "cus_1", subscriptionId: null, flow: "update_card", returnUrl: RETURN })).toEqual({ ok: false, reason: "stripe_500" });
  });
});

describe("Stripe invoices and the next bill (#216)", () => {
  const invoice = (fields: Record<string, unknown>) => ({ id: "in_1", number: "LANE-0001", created: Date.parse("2026-09-25T00:00:00Z") / 1000, total: 5400, amount_due: 5400, currency: "usd", status: "paid", hosted_invoice_url: "https://invoice.stripe.test/i/1", ...fields });

  it("lists the customer's invoices, newest first as Stripe gives them, and previews the next bill", async () => {
    const { calls, provider } = stripe([
      { status: 200, body: { data: [invoice({ id: "in_2", number: "LANE-0002", status: "open", total: 5400 }), invoice({}), invoice({ id: "in_draft", status: "draft", number: null })] } },
      { status: 200, body: { amount_due: 5400, currency: "usd", next_payment_attempt: Date.parse("2026-11-25T01:00:00Z") / 1000, period_end: Date.parse("2026-11-25T00:00:00Z") / 1000 } },
    ]);
    expect(await provider.readAccount({ customerId: "cus_1", subscriptionId: "sub_1" })).toEqual({ ok: true, account: {
      nextBill: { amountCents: 5400, currency: "usd", on: new Date("2026-11-25T01:00:00Z") },
      invoices: [
        { id: "in_2", number: "LANE-0002", issuedAt: new Date("2026-09-25T00:00:00Z"), amountCents: 5400, currency: "usd", status: "open", url: "https://invoice.stripe.test/i/1" },
        { id: "in_1", number: "LANE-0001", issuedAt: new Date("2026-09-25T00:00:00Z"), amountCents: 5400, currency: "usd", status: "paid", url: "https://invoice.stripe.test/i/1" },
      ],
    } });
    expect(calls[0]).toMatchObject({ url: "https://api.stripe.com/v1/invoices?customer=cus_1&limit=12", method: "GET" });
    expect(calls[1]).toMatchObject({ url: "https://api.stripe.com/v1/invoices/create_preview", method: "POST" });
    expect(Object.fromEntries(calls[1].form)).toEqual({ customer: "cus_1", subscription: "sub_1" });
  });

  it("has no next bill without a plan, or when Stripe has none to preview", async () => {
    const none = stripe([{ status: 200, body: { data: [] } }]);
    expect(await none.provider.readAccount({ customerId: "cus_1", subscriptionId: null })).toEqual({ ok: true, account: { nextBill: null, invoices: [] } });
    expect(none.calls).toHaveLength(1);
    const ending = stripe([{ status: 200, body: { data: [] } }, { status: 400, body: { error: { code: "invoice_upcoming_none" } } }]);
    expect(await ending.provider.readAccount({ customerId: "cus_1", subscriptionId: "sub_1" })).toEqual({ ok: true, account: { nextBill: null, invoices: [] } });
  });

  it("gives a reason when Stripe can't be read", async () => {
    const { provider } = stripe([{ status: 503, body: {} }]);
    expect(await provider.readAccount({ customerId: "cus_1", subscriptionId: "sub_1" })).toEqual({ ok: false, reason: "stripe_503" });
  });
});

describe("choosing the payment provider", () => {
  it("has none until every Stripe name is set", () => {
    expect(paymentProvider({})).toBeNull();
    expect(paymentProvider({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_YEARLY: "py", STRIPE_PRICE_MONTHLY: "pm" })).toBeNull();
    expect(paymentProvider({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_YEARLY: "py", STRIPE_PRICE_MONTHLY: "pm", STRIPE_FOUNDING_COUPON: "c" })).not.toBeNull();
  });
});
