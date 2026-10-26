/**
 * #213: a new workspace's Free Requests are decided when Lane first sees it, from the Clerk creator's email
 * address. Real database, mocked Clerk.
 */
import postgres from "postgres";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { TEST_DATABASE_PATH } from "@/test/test-database";

const session = vi.hoisted(() => ({ userId: "wfr_founder", orgId: "org_wfr_first", orgRole: "org:admin" }));
const creators = vi.hoisted((): Record<string, string> => ({ org_wfr_first: "wfr_founder", org_wfr_second: "wfr_colleague" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ ...session }),
  currentUser: async () => null,
  clerkClient: async () => ({
    organizations: { getOrganization: async ({ organizationId }: { organizationId: string }) => ({ id: organizationId, name: "Acme", slug: organizationId, createdBy: creators[organizationId] }) },
    users: { getUser: async (userId: string) => ({ primaryEmailAddress: { emailAddress: `${userId.slice(4)}@wfr-acme.example` }, emailAddresses: [] }) },
  }),
}));

const PEOPLE = ["wfr_founder", "wfr_colleague"];
const url = new URL(process.env.DATABASE_URL!);
if (!TEST_DATABASE_PATH.test(url.pathname) || !["localhost", "127.0.0.1"].includes(url.hostname)) throw Error("Local test DB only");
const connection = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => {} });

beforeAll(async () => {
  for (const id of PEOPLE) await connection`insert into profiles(id,full_name,email,role) values (${id},${id},${id.slice(4) + "@wfr-acme.example"},'pm')`;
});
afterAll(async () => {
  await connection`delete from organizations where id in ('org_wfr_first','org_wfr_second')`;
  await connection`delete from profiles where id in ${connection(PEOPLE)}`;
  await connection.end();
});

async function firstLoad(userId: string, orgId: string, orgRole = "org:admin") {
  Object.assign(session, { userId, orgId, orgRole });
  vi.resetModules();
  const { getWorkspace } = await import("./ensure-workspace");
  return getWorkspace();
}
const freeRequests = async (orgId: string) => (await (await import("./billing")).readFreeRequests({ orgId })).free;

it("gives the first workspace from a company domain its 4 Free Requests, and a second one whatever is left of them", async () => {
  expect(await firstLoad("wfr_founder", "org_wfr_first")).toMatchObject({ needsOnboarding: false, orgId: "org_wfr_first" });
  expect(await freeRequests("org_wfr_first")).toEqual({ total: 4, used: 0, left: 4, usedElsewhere: null });
  await connection`insert into requests(org_id,title,description,created_by) values ('org_wfr_first','Work','A Request.','wfr_founder')`;
  // The second workspace is first opened by someone who didn't create it; its creator's address still decides.
  expect(await firstLoad("wfr_founder", "org_wfr_second", "org:member")).toMatchObject({ orgId: "org_wfr_second" });
  expect(await freeRequests("org_wfr_second")).toEqual({ total: 4, used: 0, left: 3, usedElsewhere: { kind: "company_domain", domain: "wfr-acme.example", used: 1 } });
});
