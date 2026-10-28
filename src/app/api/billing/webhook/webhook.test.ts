/**
 * #214: `POST /api/billing/webhook`, where the payment provider tells Lane a workspace paid. Only a signed event
 * counts; with no payment provider set up every call is refused. Real database, the provider swapped for the
 * recording stand-in.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";
import { recordingPaymentProvider } from "@/lib/payment-provider";

const ORG = "org_billing_webhook";
const payments = vi.hoisted(() => ({ provider: null as ReturnType<typeof import("@/lib/payment-provider").recordingPaymentProvider> | null }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => { throw new Error("Clerk is not used here"); } }));
vi.mock("@/lib/payment-provider", async (actual) => ({ ...(await actual<typeof import("@/lib/payment-provider")>()), paymentProvider: () => payments.provider }));

const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Webhook','billing-webhook')`;
});
beforeEach(() => { payments.provider = recordingPaymentProvider(); });
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`;
  await connection.end();
});

const post = async (body: string, headers: Headers) => (await import("./route")).POST(new Request("https://lane.test/api/billing/webhook", { method: "POST", body, headers }));
const plan = async () => (await import("@/lib/billing")).readPlan({ orgId: ORG });
const later = (minutes: number) => new Date(Date.now() + minutes * 60_000);
type Provider = NonNullable<typeof payments.provider>;
/** A fresh paying plan (a new subscription each time), as a completed checkout makes it. */
async function paying(provider: Provider): Promise<string> {
  await connection`update workspace_billing set plan_state = 'free', provider_subscription_id = null, subscription_changed_at = null, plan_ends_at = null where org_id = ${ORG}`;
  await provider.startCheckout({ orgId: ORG, period: "yearly", seats: 3, foundingDiscount: null, customer: { email: null }, successUrl: "s", cancelUrl: "c", expiresAt: new Date() });
  const subscriptionId = `stand_in_subscription_${crypto.randomUUID()}`;
  await post(provider.complete(undefined, { subscriptionId }), provider.headers());
  return subscriptionId;
}

describe("the billing webhook", () => {
  it("makes a workspace paying when the provider reports its checkout paid", async () => {
    const provider = payments.provider!;
    await provider.startCheckout({ orgId: ORG, period: "monthly", seats: 3, foundingDiscount: null, customer: { email: null }, successUrl: "s", cancelUrl: "c", expiresAt: new Date() });
    const answer = await post(provider.complete(), provider.headers());
    expect(answer.status).toBe(200);
    expect(await plan()).toMatchObject({ planState: "paying", period: "monthly" });
  });

  it("refuses an event that isn't signed by the provider, and changes nothing", async () => {
    const provider = payments.provider!;
    await connection`update workspace_billing set plan_state = 'lapsed' where org_id = ${ORG}`;
    await provider.startCheckout({ orgId: ORG, period: "yearly", seats: 3, foundingDiscount: null, customer: { email: null }, successUrl: "s", cancelUrl: "c", expiresAt: new Date() });
    expect((await post(provider.complete(), new Headers())).status).toBe(400);
    expect((await plan()).planState).toBe("lapsed");
  });

  it("keeps the plan paying until the day a cancelled plan ends, then lapses it (#216)", async () => {
    const provider = payments.provider!;
    const subscriptionId = await paying(provider);
    const endsAt = new Date("2027-10-25T00:00:00Z");
    expect((await post(provider.changeSubscription(subscriptionId, { state: "paying", period: "yearly", endsAt, at: later(1) }), provider.headers())).status).toBe(200);
    expect(await plan()).toMatchObject({ planState: "paying", endsAt, subscription: true });
    await post(provider.changeSubscription(subscriptionId, { state: "ended", at: later(2) }), provider.headers());
    expect(await plan()).toMatchObject({ planState: "lapsed", endsAt: null, subscription: false, customer: true });
  });

  it("lapses an unpaid plan and makes it paying again once it is paid, in its new period (#216)", async () => {
    const provider = payments.provider!;
    const subscriptionId = await paying(provider);
    await post(provider.changeSubscription(subscriptionId, { state: "lapsed", at: later(1) }), provider.headers());
    expect(await plan()).toMatchObject({ planState: "lapsed", subscription: true });
    await post(provider.changeSubscription(subscriptionId, { state: "paying", period: "monthly", at: later(2) }), provider.headers());
    expect(await plan()).toMatchObject({ planState: "paying", period: "monthly" });
  });

  it("ignores a change older than one already recorded, and one for a plan the workspace no longer pays with (#216)", async () => {
    const provider = payments.provider!;
    const subscriptionId = await paying(provider);
    await post(provider.changeSubscription(subscriptionId, { state: "paying", period: "monthly", at: later(5) }), provider.headers());
    await post(provider.changeSubscription(subscriptionId, { state: "lapsed", at: later(3) }), provider.headers());
    expect(await plan()).toMatchObject({ planState: "paying", period: "monthly" });
    await post(provider.changeSubscription("stand_in_subscription_an_old_plan", { state: "ended", at: later(9) }), provider.headers());
    expect(await plan()).toMatchObject({ planState: "paying" });
  });

  it("refuses every call while no payment provider is set up", async () => {
    const provider = payments.provider!;
    payments.provider = null;
    expect((await post("{}", provider.headers())).status).toBe(503);
  });
});
