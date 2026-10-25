/**
 * #214 seam 5: an Admin pays for Lane from Settings → Billing. The action opens the payment provider's hosted
 * checkout for the workspace's paid seats (Admins and Members, at least 3) and returns its page; nobody else can,
 * and nothing is offered while billing is off or there is no provider. Real database, mocked Clerk session and
 * roster, and the payment provider swapped for the recording stand-in.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { recordingPaymentProvider } from "@/lib/payment-provider";

const ORG = "org_billing_checkout";
const [ADMIN, MEMBER, GUEST, VIEWER] = ["checkout_admin", "checkout_member", "checkout_guest", "checkout_viewer"];
const session = vi.hoisted(() => ({ userId: "checkout_admin", orgId: "org_billing_checkout", orgRole: "org:admin" }));
const roster = vi.hoisted(() => ({ people: {} as Record<string, string> }));
const payments = vi.hoisted(() => ({ provider: null as ReturnType<typeof import("@/lib/payment-provider").recordingPaymentProvider> | null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  clerkClient: async () => ({
    organizations: {
      getOrganizationMembershipList: async () => {
        const people = Object.entries(roster.people);
        return { totalCount: people.length, data: people.map(([userId, role]) => ({ organization: { id: session.orgId }, role, publicUserData: { userId, identifier: `${userId}@checkout.test` } })) };
      },
    },
  }),
}));
vi.mock("@/lib/payment-provider", async (actual) => ({ ...(await actual<typeof import("@/lib/payment-provider")>()), paymentProvider: () => payments.provider }));

const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  await connection`insert into organizations(id,name,slug) values (${ORG},'Checkout','billing-checkout')`;
  await connection`insert into profiles(id,full_name,email) values (${ADMIN},'Ada Admin','ada@checkout.test')`;
});
beforeEach(() => {
  vi.stubEnv("LANE_BILLING_ENFORCED", "1");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://lane.example.test");
  payments.provider = recordingPaymentProvider();
  roster.people = { [ADMIN]: "org:admin", [MEMBER]: "org:member", [GUEST]: "org:guest", [VIEWER]: "org:viewer" };
});
afterEach(() => {
  vi.unstubAllEnvs();
  Object.assign(session, { userId: ADMIN, orgRole: "org:admin" });
});
afterAll(async () => {
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id = ${ADMIN}`;
  await connection.end();
});

const actions = () => import("./billing-actions");

describe("paying for Lane from Settings → Billing", () => {
  it("opens the provider's hosted checkout for an Admin, for at least 3 paid seats", async () => {
    const { startPlanCheckout } = await actions();
    expect(await startPlanCheckout({ period: "yearly" }, { orgId: ORG })).toEqual({ ok: true, url: "https://payments.stand-in.test/checkout/1" });
    expect(payments.provider!.checkouts).toEqual([expect.objectContaining({
      orgId: ORG, period: "yearly", seats: 3, customer: { email: "ada@checkout.test" },
      successUrl: "https://lane.example.test/settings/profile?section=billing&checkout=done",
    })]);
  });

  it("counts Admins and Members as the paid seats, never Guests or Viewers", async () => {
    roster.people = { ...roster.people, m2: "org:member", m3: "org:member", a2: "org:admin", g2: "org:guest" };
    const { startPlanCheckout } = await actions();
    await startPlanCheckout({ period: "monthly" }, { orgId: ORG });
    expect(payments.provider!.checkouts[0]).toMatchObject({ period: "monthly", seats: 5 });
  });

  it("lets only Admins pay", async () => {
    Object.assign(session, { userId: MEMBER, orgRole: "org:member" });
    const { startPlanCheckout } = await actions();
    expect(await startPlanCheckout({ period: "yearly" }, { orgId: ORG })).toEqual({ error: "Only Admins can pay for Lane in this workspace." });
    expect(payments.provider!.checkouts).toEqual([]);
  });

  it("offers nothing to pay while Lane isn't charging, or while paying isn't set up", async () => {
    const { startPlanCheckout } = await actions();
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    expect(await startPlanCheckout({ period: "yearly" }, { orgId: ORG })).toEqual({ error: "Lane isn’t charging yet, so there’s nothing to pay." });
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    payments.provider = null;
    expect(await startPlanCheckout({ period: "yearly" }, { orgId: ORG })).toEqual({ error: "Paying by card isn’t available yet." });
  });

  it("pays a lapsed plan that can still be paid by updating the card, not with a second checkout (#216)", async () => {
    await connection`insert into workspace_billing(org_id) values (${ORG}) on conflict do nothing`;
    await connection`update workspace_billing set plan_state = 'lapsed', provider_customer_id = 'cus_checkout', provider_subscription_id = 'sub_checkout_unpaid' where org_id = ${ORG}`;
    const { startPlanCheckout } = await actions();
    expect(await startPlanCheckout({ period: "yearly" }, { orgId: ORG })).toEqual({ error: "This workspace’s plan is waiting for payment. Update the card to pay what’s due." });
    expect(payments.provider!.checkouts).toEqual([]);
    await connection`update workspace_billing set plan_state = 'free', provider_customer_id = null, provider_subscription_id = null where org_id = ${ORG}`;
  });

  it("refuses a billing period Lane doesn't offer", async () => {
    const { startPlanCheckout } = await actions();
    expect(await startPlanCheckout({ period: "weekly" } as never, { orgId: ORG })).toEqual({ error: "Choose yearly or monthly billing." });
    expect(payments.provider!.checkouts).toEqual([]);
  });
});

describe("the provider's hosted billing pages (#216)", () => {
  const RETURN = "https://lane.example.test/settings/profile?section=billing";
  const set = (fields: { plan: "free" | "paying" | "lapsed"; customer: string | null; subscription: string | null }) =>
    connection`insert into workspace_billing(org_id, plan_state, provider_customer_id, provider_subscription_id) values (${ORG}, ${fields.plan}, ${fields.customer}, ${fields.subscription})
      on conflict (org_id) do update set plan_state = excluded.plan_state, provider_customer_id = excluded.provider_customer_id, provider_subscription_id = excluded.provider_subscription_id`;
  afterEach(() => set({ plan: "free", customer: null, subscription: null }));

  it("opens the page to change the billing period, update the card or cancel, for an Admin of a paying workspace", async () => {
    await set({ plan: "paying", customer: "cus_pages", subscription: "sub_pages" });
    const { openBillingPage } = await actions();
    for (const flow of ["change_period", "update_card", "cancel"] as const)
      expect(await openBillingPage({ flow }, { orgId: ORG })).toEqual({ ok: true, url: expect.stringMatching(`^https://payments.stand-in.test/portal/${flow}/`) });
    expect(payments.provider!.portals).toEqual(["change_period", "update_card", "cancel"].map((flow) => ({ customerId: "cus_pages", subscriptionId: "sub_pages", flow, returnUrl: RETURN })));
  });

  it("opens them even while Lane isn't charging, so an Admin who pays stays in control", async () => {
    await set({ plan: "paying", customer: "cus_pages", subscription: "sub_pages" });
    vi.stubEnv("LANE_BILLING_ENFORCED", "");
    const { openBillingPage } = await actions();
    expect(await openBillingPage({ flow: "cancel" }, { orgId: ORG })).toMatchObject({ ok: true });
  });

  it("updates the card of a lapsed workspace, but has no plan to change or cancel once it ended", async () => {
    await set({ plan: "lapsed", customer: "cus_pages", subscription: null });
    const { openBillingPage } = await actions();
    expect(await openBillingPage({ flow: "update_card" }, { orgId: ORG })).toMatchObject({ ok: true });
    expect(await openBillingPage({ flow: "change_period" }, { orgId: ORG })).toEqual({ error: "This workspace has no plan to change. Pay for Lane to start one." });
    expect(await openBillingPage({ flow: "cancel" }, { orgId: ORG })).toEqual({ error: "This workspace has no plan to change. Pay for Lane to start one." });
  });

  it("has nothing to open for a workspace that never paid, or while paying isn't set up", async () => {
    const { openBillingPage } = await actions();
    expect(await openBillingPage({ flow: "update_card" }, { orgId: ORG })).toEqual({ error: "This workspace hasn’t paid for Lane yet, so there’s no card or plan to change." });
    await set({ plan: "paying", customer: "cus_pages", subscription: "sub_pages" });
    payments.provider = null;
    expect(await openBillingPage({ flow: "update_card" }, { orgId: ORG })).toEqual({ error: "The payment provider’s billing pages aren’t available yet." });
  });

  it("lets only Admins open them, and only for flows Lane knows", async () => {
    await set({ plan: "paying", customer: "cus_pages", subscription: "sub_pages" });
    const { openBillingPage } = await actions();
    expect(await openBillingPage({ flow: "refund" } as never, { orgId: ORG })).toEqual({ error: "Choose what to change." });
    Object.assign(session, { userId: MEMBER, orgRole: "org:member" });
    expect(await openBillingPage({ flow: "cancel" }, { orgId: ORG })).toEqual({ error: "Only Admins can change billing in this workspace." });
    expect(payments.provider!.portals).toEqual([]);
  });

  it("says so when the provider can't open the page", async () => {
    await set({ plan: "paying", customer: "cus_pages", subscription: "sub_pages" });
    payments.provider = recordingPaymentProvider({ fail: true });
    const { openBillingPage } = await actions();
    expect(await openBillingPage({ flow: "update_card" }, { orgId: ORG })).toEqual({ error: "Couldn’t open the billing page. Try again." });
  });
});
