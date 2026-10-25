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
  const calls: { url: string; form: URLSearchParams; auth: string | null }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, form: new URLSearchParams(String(init.body)), auth: new Headers(init.headers).get("authorization") });
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

describe("choosing the payment provider", () => {
  it("has none until every Stripe name is set", () => {
    expect(paymentProvider({})).toBeNull();
    expect(paymentProvider({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_YEARLY: "py", STRIPE_PRICE_MONTHLY: "pm" })).toBeNull();
    expect(paymentProvider({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_YEARLY: "py", STRIPE_PRICE_MONTHLY: "pm", STRIPE_FOUNDING_COUPON: "c" })).not.toBeNull();
  });
});
