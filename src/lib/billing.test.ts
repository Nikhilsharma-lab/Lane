/**
 * #213 (spec #195, seam 5: billing). The billing module against the real test database, with Clerk (the only outside
 * service it asks, for a workspace's creator) as a stand-in. Paying through the payment provider is
 * `billing-payment.test.ts` (#214); here a paying or lapsed plan is written straight into the module's table.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const clerk = vi.hoisted(() => ({
  creators: {} as Record<string, string | undefined>,
  emails: {} as Record<string, string>,
  down: false,
}));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({
    organizations: {
      getOrganization: async ({ organizationId }: { organizationId: string }) => {
        if (clerk.down) throw new Error("Clerk is unavailable");
        return { id: organizationId, createdBy: clerk.creators[organizationId] };
      },
    },
    users: {
      getUser: async (userId: string) => ({ primaryEmailAddress: { emailAddress: clerk.emails[userId] }, emailAddresses: [{ emailAddress: clerk.emails[userId] }] }),
    },
  }),
}));

const ORGS = ["org_billing_a", "org_billing_b", "org_billing_c", "org_billing_d", "org_billing_e", "org_billing_f", "org_billing_g"];
const MEMBER = "billing_member";
const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  for (const id of ORGS) await connection`insert into organizations(id,name,slug) values (${id},'Billing',${id})`;
  await connection`insert into profiles(id,full_name,email) values (${MEMBER},'Member','member@billing.test')`;
});
afterEach(() => { vi.unstubAllEnvs(); clerk.down = false; });
afterAll(async () => {
  await connection`delete from organizations where id in ${connection(ORGS)}`;
  await connection`delete from profiles where id = ${MEMBER}`;
  await connection.end();
});

const billing = () => import("./billing");
async function file(orgId: string, count = 1) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) ids.push((await connection`insert into requests(org_id,title,description,created_by) values (${orgId},'Work','A Request.',${MEMBER}) returning id`)[0].id);
  return ids;
}
const left = async (orgId: string) => (await (await billing()).readFreeRequests({ orgId })).free.left;

describe("counting Free Requests", () => {
  it("gives a new workspace 4, uses one per Request created, and keeps a deleted one counted", async () => {
    const { claimFreeRequests, readFreeRequests } = await billing();
    await claimFreeRequests({ orgId: "org_billing_a" }, "founder@billing-acme.example");
    expect(await readFreeRequests({ orgId: "org_billing_a" })).toEqual({ planState: "free", free: { total: 4, used: 0, left: 4, usedElsewhere: null } });
    const [first] = await file("org_billing_a", 3);
    expect(await left("org_billing_a")).toBe(1);
    await connection`delete from requests where id=${first}`;
    expect(await left("org_billing_a")).toBe(1);
    await file("org_billing_a", 2);
    expect(await readFreeRequests({ orgId: "org_billing_a" })).toMatchObject({ free: { used: 5, left: 0 } });
  });
});

describe("one allowance per company domain, personal domains per person", () => {
  it("tells a second workspace from the same company domain that the Free Requests were already used", async () => {
    const { claimFreeRequests, readFreeRequests } = await billing();
    await claimFreeRequests({ orgId: "org_billing_b" }, "Ana@Billing-Beta.example");
    await claimFreeRequests({ orgId: "org_billing_c" }, "ben@billing-beta.example");
    expect((await readFreeRequests({ orgId: "org_billing_b" })).free).toMatchObject({ total: 4, left: 4 });
    expect((await readFreeRequests({ orgId: "org_billing_c" })).free).toEqual({ total: 0, used: 0, left: 0, usedElsewhere: { kind: "company_domain", domain: "billing-beta.example" } });
  });

  it("gives each person on a personal domain their own, once", async () => {
    const { claimFreeRequests, readFreeRequests } = await billing();
    await claimFreeRequests({ orgId: "org_billing_d" }, "ana.billing@gmail.com");
    await claimFreeRequests({ orgId: "org_billing_e" }, "ben.billing@gmail.com");
    await claimFreeRequests({ orgId: "org_billing_f" }, "AnaBilling+second@googlemail.com");
    expect((await readFreeRequests({ orgId: "org_billing_d" })).free).toMatchObject({ total: 4, usedElsewhere: null });
    expect((await readFreeRequests({ orgId: "org_billing_e" })).free).toMatchObject({ total: 4, usedElsewhere: null });
    expect((await readFreeRequests({ orgId: "org_billing_f" })).free).toMatchObject({ total: 0, usedElsewhere: { kind: "personal_email", domain: "gmail.com" } });
  });

  it("decides a workspace's allowance once", async () => {
    const { claimFreeRequests, readFreeRequests } = await billing();
    await claimFreeRequests({ orgId: "org_billing_c" }, "someone@billing-elsewhere.example");
    expect((await readFreeRequests({ orgId: "org_billing_c" })).free).toMatchObject({ total: 0, usedElsewhere: { domain: "billing-beta.example" } });
  });
});

describe("finding the workspace's creator", () => {
  it("leaves the allowance undecided, without failing, when Clerk can't say who created the workspace", async () => {
    const { decideFreeRequests, readFreeRequests } = await billing();
    clerk.down = true;
    await expect(decideFreeRequests({ orgId: "org_billing_g" })).resolves.toBeUndefined();
    clerk.down = false;
    clerk.creators.org_billing_g = undefined;
    await decideFreeRequests({ orgId: "org_billing_g" });
    expect((await readFreeRequests({ orgId: "org_billing_g" })).free).toMatchObject({ total: 4, usedElsewhere: null });
  });

  it("asks Clerk for the creator's email address, unless the person loading is the creator", async () => {
    const { decideFreeRequests, readFreeRequests } = await billing();
    clerk.creators.org_billing_g = "billing_creator";
    clerk.emails.billing_creator = "creator@billing-beta.example";
    await decideFreeRequests({ orgId: "org_billing_g" }, { createdBy: "billing_creator", userId: "someone_else", email: "other@billing-new.example" });
    expect((await readFreeRequests({ orgId: "org_billing_g" })).free).toMatchObject({ total: 0, usedElsewhere: { domain: "billing-beta.example" } });
  });
});

describe("the block on new Requests", () => {
  it("blocks the 5th Request with \"an Admin needs to pay\", only while billing is enforced", async () => {
    const { newRequestBlock } = await billing();
    expect(await newRequestBlock({ orgId: "org_billing_a" })).toBeNull();
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    expect(await newRequestBlock({ orgId: "org_billing_a" })).toMatch(/^This workspace has used its 4 Free Requests\. An Admin needs to pay/);
    expect(await newRequestBlock({ orgId: "org_billing_b" })).toBeNull();
    expect(await newRequestBlock({ orgId: "org_billing_c" })).toMatch(/^The Free Requests for billing-beta\.example were already used by another workspace\./);
  });

  it("lets a paying workspace file beyond its Free Requests, and blocks a lapsed one", async () => {
    const { newRequestBlock } = await billing();
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    await connection`update workspace_billing set plan_state='paying' where org_id='org_billing_a'`;
    expect(await newRequestBlock({ orgId: "org_billing_a" })).toBeNull();
    await connection`update workspace_billing set plan_state='lapsed' where org_id='org_billing_b'`;
    expect(await newRequestBlock({ orgId: "org_billing_b" })).toMatch(/^This workspace’s plan has lapsed\./);
  });
});
