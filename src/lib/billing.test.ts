/**
 * #213 (spec #195, seam 5: billing). The billing module against the real test database. Paying through the payment provider is
 * `billing-payment.test.ts` (#214); here a paying or lapsed plan is written straight into the module's table.
 */
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";


const ORGS = ["org_billing_a", "org_billing_b", "org_billing_c", "org_billing_d", "org_billing_e", "org_billing_f", "org_billing_g", "org_billing_h", "org_billing_i", "org_billing_j", "org_billing_k"];
const MEMBER = "billing_member", CREATOR = "billing_creator";
const url = new URL(process.env.DATABASE_URL!);
requireTestDatabase(process.env.DATABASE_URL);
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  for (const id of ORGS) await connection`insert into organizations(id,name,slug) values (${id},'Billing',${id})`;
  await connection`insert into profiles(id,full_name,email) values (${MEMBER},'Member','member@billing.test'), (${CREATOR},'Creator','creator@billing-beta.example')`;
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await connection`delete from organizations where id in ${connection(ORGS)}`;
  await connection`delete from profiles where id in (${MEMBER}, ${CREATOR})`;
  await connection.end();
});

const billing = () => import("./billing");
const { db, requests } = await import("@/db");
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

describe("one allowance per company domain, personal domains per person, shared by their workspaces (decision 2026-10-26)", () => {
  it("gives a second workspace from the same company domain whatever is left of the 4", async () => {
    const { claimFreeRequests, readFreeRequests } = await billing();
    await claimFreeRequests({ orgId: "org_billing_b" }, "Ana@Billing-Beta.example");
    await claimFreeRequests({ orgId: "org_billing_c" }, "ben@billing-beta.example");
    expect((await readFreeRequests({ orgId: "org_billing_c" })).free).toEqual({ total: 4, used: 0, left: 4, usedElsewhere: null });
    await file("org_billing_b");
    expect((await readFreeRequests({ orgId: "org_billing_c" })).free).toEqual({ total: 4, used: 0, left: 3, usedElsewhere: { kind: "company_domain", domain: "billing-beta.example", used: 1 } });
    // The 4 are shared both ways: the first workspace sees what the second uses.
    await file("org_billing_c", 2);
    expect((await readFreeRequests({ orgId: "org_billing_b" })).free).toEqual({ total: 4, used: 1, left: 1, usedElsewhere: { kind: "company_domain", domain: "billing-beta.example", used: 2 } });
  });

  it("gives each person on a personal domain their own 4, shared by that person's workspaces", async () => {
    const { claimFreeRequests, readFreeRequests } = await billing();
    await claimFreeRequests({ orgId: "org_billing_d" }, "ana.billing@gmail.com");
    await claimFreeRequests({ orgId: "org_billing_e" }, "ben.billing@gmail.com");
    await claimFreeRequests({ orgId: "org_billing_f" }, "AnaBilling+second@googlemail.com");
    await file("org_billing_d", 4);
    expect((await readFreeRequests({ orgId: "org_billing_e" })).free).toMatchObject({ total: 4, left: 4, usedElsewhere: null });
    expect((await readFreeRequests({ orgId: "org_billing_f" })).free).toMatchObject({ total: 4, left: 0, usedElsewhere: { kind: "personal_email", domain: "gmail.com", used: 4 } });
  });

  it("decides a workspace's allowance once", async () => {
    const { claimFreeRequests, readFreeRequests } = await billing();
    await claimFreeRequests({ orgId: "org_billing_c" }, "someone@billing-elsewhere.example");
    expect((await readFreeRequests({ orgId: "org_billing_c" })).free).toMatchObject({ usedElsewhere: { domain: "billing-beta.example" } });
  });
});

describe("finding the workspace's creator", () => {
  const G = { orgId: "org_billing_g" };
  const free = async () => (await (await billing()).readFreeRequests(G)).free;

  it("leaves the allowance undecided, without failing, when the workspace's creator isn't known", async () => {
    const { decideFreeRequests, freeRequestsDecided } = await billing();
    await expect(decideFreeRequests(G)).resolves.toBeUndefined();
    await expect(decideFreeRequests({ orgId: "org_billing_unknown" })).resolves.toBeUndefined();
    await connection`update organizations set owner_id = 'billing_nobody' where id = ${G.orgId}`;
    await decideFreeRequests(G);
    await decideFreeRequests(G, { createdBy: null, userId: MEMBER, email: "member@billing.test" });
    await decideFreeRequests(G, { createdBy: "billing_nobody", userId: MEMBER, email: "member@billing.test" });
    expect(await freeRequestsDecided(G)).toBe(false);
    expect(await free()).toMatchObject({ total: 4, usedElsewhere: null });
  });

  it("decides it from the email in the profile of the person in owner_id", async () => {
    await connection`update organizations set owner_id = ${CREATOR} where id = ${G.orgId}`;
    await (await billing()).decideFreeRequests(G);
    expect(await free()).toMatchObject({ left: 1, usedElsewhere: { domain: "billing-beta.example", used: 3 } });
  });

  it("takes a known creator's profile email, unless the person loading is the creator", async () => {
    const { decideFreeRequests, readFreeRequests } = await billing();
    await decideFreeRequests({ orgId: "org_billing_j" }, { createdBy: CREATOR, userId: "someone_else", email: "other@billing-new.example" });
    expect((await readFreeRequests({ orgId: "org_billing_j" })).free).toMatchObject({ usedElsewhere: { domain: "billing-beta.example", used: 3 } });
    await decideFreeRequests({ orgId: "org_billing_k" }, { createdBy: CREATOR, userId: CREATOR, email: "ana.billing@gmail.com" });
    expect((await readFreeRequests({ orgId: "org_billing_k" })).free).toMatchObject({ usedElsewhere: { domain: "gmail.com" } });
  });
});

describe("the block on new Requests", () => {
  it("blocks the 5th Request with \"an Admin needs to pay\", only while billing is enforced", async () => {
    const { newRequestBlock } = await billing();
    expect(await newRequestBlock({ orgId: "org_billing_a" })).toBeNull();
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    expect(await newRequestBlock({ orgId: "org_billing_a" })).toMatch(/^This workspace has used its 4 Free Requests\. An Admin needs to pay/);
    expect(await newRequestBlock({ orgId: "org_billing_g" })).toBeNull();
    // The last of billing-beta.example's 4, filed through the block's own lock, is shared by b, c and g.
    await db.transaction(async (tx) => {
      expect(await newRequestBlock({ orgId: "org_billing_b" }, tx)).toBeNull();
      await tx.insert(requests).values({ orgId: "org_billing_b", title: "Work", description: "A Request.", createdBy: MEMBER });
    });
    expect(await newRequestBlock({ orgId: "org_billing_g" })).toMatch(/^The Free Requests for billing-beta\.example were already used by another workspace\./);
    expect(await newRequestBlock({ orgId: "org_billing_c" })).toMatch(/^This workspace and another from billing-beta\.example have used the 4 Free Requests for billing-beta\.example\./);
    expect(await newRequestBlock({ orgId: "org_billing_f" })).toMatch(/^The person who created this workspace already used their Free Requests in another workspace\./);
  });

  it("lets only one of two workspaces sharing the last Free Request file it", async () => {
    const { claimFreeRequests, newRequestBlock } = await billing();
    vi.stubEnv("LANE_BILLING_ENFORCED", "1");
    await claimFreeRequests({ orgId: "org_billing_h" }, "ana@billing-race.example");
    await claimFreeRequests({ orgId: "org_billing_i" }, "ben@billing-race.example");
    await file("org_billing_h", 3);
    const fileOne = (orgId: string) => db.transaction(async (tx) => {
      const block = await newRequestBlock({ orgId }, tx);
      if (block) return block;
      // Both would pass together without the shared lock: give the other workspace time to try.
      await new Promise(resolve => setTimeout(resolve, 100));
      await tx.insert(requests).values({ orgId, title: "Work", description: "A Request.", createdBy: MEMBER });
      return null;
    });
    const results = await Promise.all([fileOne("org_billing_h"), fileOne("org_billing_i")]);
    expect(results.filter(result => result === null)).toHaveLength(1);
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
