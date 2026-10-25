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

  it("refuses a billing period Lane doesn't offer", async () => {
    const { startPlanCheckout } = await actions();
    expect(await startPlanCheckout({ period: "weekly" } as never, { orgId: ORG })).toEqual({ error: "Choose yearly or monthly billing." });
    expect(payments.provider!.checkouts).toEqual([]);
  });
});
