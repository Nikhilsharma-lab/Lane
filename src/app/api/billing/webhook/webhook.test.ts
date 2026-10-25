/**
 * #214: `POST /api/billing/webhook`, where the payment provider tells Lane a workspace paid. Only a signed event
 * counts; with no payment provider set up every call is refused. Real database, the provider swapped for the
 * recording stand-in.
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { recordingPaymentProvider } from "@/lib/payment-provider";

const ORG = "org_billing_webhook";
const payments = vi.hoisted(() => ({ provider: null as ReturnType<typeof import("@/lib/payment-provider").recordingPaymentProvider> | null }));
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => { throw new Error("Clerk is not used here"); } }));
vi.mock("@/lib/payment-provider", async (actual) => ({ ...(await actual<typeof import("@/lib/payment-provider")>()), paymentProvider: () => payments.provider }));

const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
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

  it("refuses every call while no payment provider is set up", async () => {
    const provider = payments.provider!;
    payments.provider = null;
    expect((await post("{}", provider.headers())).status).toBe(503);
  });
});
