/**
 * #214 (spec #195, seam 5: billing). Paying through the billing module against the real test database, with the
 * payment provider swapped for the recording stand-in: checkout on the provider's hosted page, the plan state the
 * provider's event sets, and the founding discount for the first 50 paying workspaces only, for two years.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";
import { recordingPaymentProvider } from "./payment-provider";

vi.mock("@clerk/nextjs/server", () => ({ clerkClient: async () => { throw new Error("Clerk is not used here"); } }));

const PREFIX = "org_billing_pay_";
const [NEW, PAID, FAILS, AGAIN, FULL, RETURNING] = ["new", "paid", "fails", "again", "full", "returning"].map((name) => PREFIX + name);
const OTHERS = Array.from({ length: 50 }, (_, i) => `${PREFIX}other_${i}`);
const MEMBER = "billing_pay_member";
const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  for (const id of [NEW, PAID, FAILS, AGAIN, FULL, RETURNING]) await connection`insert into organizations(id,name,slug) values (${id},'Paying',${id})`;
  await connection`insert into profiles(id,full_name,email) values (${MEMBER},'Member','member@billing-pay.test')`;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await connection`delete from organizations where id like ${PREFIX + "%"}`;
  await connection`delete from profiles where id = ${MEMBER}`;
  await connection.end();
});

const billing = () => import("./billing");
const checkout = { seats: 3, email: "admin@billing-pay.test", origin: "https://lane.test" };
async function pay(orgId: string, provider = recordingPaymentProvider(), period: "yearly" | "monthly" = "yearly") {
  const { startCheckout, recordPaymentEvent } = await billing();
  const started = await startCheckout({ orgId }, { ...checkout, period }, provider);
  if (!started.ok) throw Error(started.error);
  const reading = await provider.readEvent(provider.complete(), provider.headers(), new Date());
  if (!reading.ok || !reading.event) throw Error("No event");
  await recordPaymentEvent(reading.event);
  return provider;
}

describe("paying for Lane", () => {
  it("starts on the provider's hosted checkout page, with the period, seats and the way back to Billing", async () => {
    const { startCheckout, readPlan } = await billing();
    expect(await readPlan({ orgId: NEW })).toMatchObject({ planState: "free", period: null, founding: { offered: true, endsAt: null } });
    const provider = recordingPaymentProvider();
    const started = await startCheckout({ orgId: NEW }, { ...checkout, period: "monthly", seats: 4 }, provider);
    expect(started).toEqual({ ok: true, url: "https://payments.stand-in.test/checkout/1" });
    expect(provider.checkouts).toEqual([expect.objectContaining({
      orgId: NEW, period: "monthly", seats: 4, customer: { email: "admin@billing-pay.test" },
      successUrl: "https://lane.test/settings/profile?section=billing&checkout=done",
      cancelUrl: "https://lane.test/settings/profile?section=billing&checkout=cancelled",
    })]);
    // Nothing is paid until the provider says so.
    expect((await readPlan({ orgId: NEW })).planState).toBe("free");
  });

  it("makes the workspace paying once the provider reports the payment, and a paying workspace creates Requests beyond the Free Requests", async () => {
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    for (let i = 0; i < 5; i++) await connection`insert into requests(org_id,title,description,created_by) values (${PAID},'Work','A Request.',${MEMBER})`;
    const { newRequestBlock, readPlan } = await billing();
    expect(await newRequestBlock({ orgId: PAID })).toContain("An Admin needs to pay");
    const before = Date.now();
    await pay(PAID);
    const plan = await readPlan({ orgId: PAID });
    expect(plan).toMatchObject({ planState: "paying", period: "yearly", founding: { offered: true } });
    expect(plan.founding.endsAt!.getUTCFullYear() - new Date(before).getUTCFullYear()).toBe(2);
    expect(await newRequestBlock({ orgId: PAID })).toBeNull();
  });

  it("records the same payment once, and refuses a second checkout while paying", async () => {
    const { recordPaymentEvent, readPlan, startCheckout } = await billing();
    const provider = await pay(AGAIN);
    const reading = await provider.readEvent(provider.complete(), provider.headers(), new Date());
    if (!reading.ok || !reading.event) throw Error("No event");
    const first = await readPlan({ orgId: AGAIN });
    await recordPaymentEvent(reading.event);
    expect(await readPlan({ orgId: AGAIN })).toEqual(first);
    expect(await startCheckout({ orgId: AGAIN }, { ...checkout, period: "monthly" }, provider)).toEqual({ ok: false, error: "This workspace already pays for Lane." });
    expect(provider.checkouts).toHaveLength(1);
  });

  it("says so when the provider can't start a checkout, and keeps no founding place for it", async () => {
    const { startCheckout } = await billing();
    expect(await startCheckout({ orgId: FAILS }, { ...checkout, period: "yearly" }, recordingPaymentProvider({ fail: true })))
      .toEqual({ ok: false, error: "Couldn’t open the checkout page. Try again." });
    const [row] = await connection`select founding_reserved_until from workspace_billing where org_id=${FAILS}`;
    expect(row.founding_reserved_until).toBeNull();
  });

  it("ignores a payment for a workspace Lane doesn't know", async () => {
    const { recordPaymentEvent } = await billing();
    await expect(recordPaymentEvent({ kind: "checkout_completed", orgId: `${PREFIX}gone`, checkoutId: "c", customerId: "cus", subscriptionId: "sub_gone", period: "yearly", foundingDiscount: false })).resolves.toBeUndefined();
  });
});

describe("the founding discount", () => {
  it("gives the first paying workspaces 40% off for two years", async () => {
    const provider = recordingPaymentProvider();
    const { startCheckout } = await billing();
    await startCheckout({ orgId: NEW }, { ...checkout, period: "yearly" }, provider);
    expect(provider.checkouts[0].foundingDiscount).toEqual({ percentOff: 40, months: 24 });
  });

  it("is for the first 50 paying workspaces only", async () => {
    const { startCheckout, readPlan } = await billing();
    const [{ taken }] = await connection`select count(*)::int as taken from workspace_billing where founding_starts_at is not null or founding_reserved_until > now()`;
    for (const id of OTHERS.slice(0, 50 - taken)) {
      await connection`insert into organizations(id,name,slug) values (${id},'Founding',${id})`;
      await connection`insert into workspace_billing(org_id, plan_state, founding_starts_at) values (${id}, 'paying', now())`;
    }
    expect((await readPlan({ orgId: FULL })).founding).toEqual({ offered: false, endsAt: null });
    const provider = recordingPaymentProvider();
    await startCheckout({ orgId: FULL }, { ...checkout, period: "yearly" }, provider);
    expect(provider.checkouts[0].foundingDiscount).toBeNull();
    // A founding workspace keeps its place.
    expect((await readPlan({ orgId: PAID })).founding.offered).toBe(true);
    await connection`delete from organizations where id like ${PREFIX + "other_%"}`;
  });

  it("gives a founding workspace that pays again only what is left of its two years", async () => {
    await connection`insert into workspace_billing(org_id, plan_state, founding_starts_at) values (${RETURNING}, 'lapsed', now() - interval '18 months')`;
    const provider = recordingPaymentProvider();
    const { startCheckout } = await billing();
    await startCheckout({ orgId: RETURNING }, { ...checkout, period: "monthly" }, provider);
    expect(provider.checkouts[0].foundingDiscount).toEqual({ percentOff: 40, months: 6 });
  });
});
