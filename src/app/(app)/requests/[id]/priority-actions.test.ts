import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG = "org_priority_actions_a", FOREIGN_ORG = "org_priority_actions_b";
const MEMBER = "user_priority_member", GUEST = "user_priority_guest", FOREIGN = "user_priority_foreign";
let connection: ReturnType<typeof postgres>;
let requestId: string;

const api = () => import("./actions");
const actAs = (userId: string, orgRole = "org:member", orgId = ORG) => { session.userId = userId; session.orgId = orgId; session.orgRole = orgRole; };
const saved = async () => (await connection`select priority::text as priority, status::text as status, assigned_to from requests where id = ${requestId}`)[0];

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") throw new Error("Priority tests require local lane_test");
  connection = postgres(databaseUrl, { max: 2, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Priority actions','priority-actions-a'),(${FOREIGN_ORG},'Other workspace','priority-actions-b')`;
  for (const id of [MEMBER, GUEST, FOREIGN]) await connection`insert into profiles (id,full_name,email) values (${id},${id},${id + "@example.test"})`;
});
beforeEach(async () => {
  actAs(MEMBER);
  requestId = randomUUID();
  await connection`insert into requests (id,org_id,title,description,created_by) values (${requestId},${ORG},'Priority action probe','A Request',${MEMBER})`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG},${FOREIGN_ORG})`;
  await connection`delete from profiles where id in (${MEMBER},${GUEST},${FOREIGN})`;
  await connection.end();
});

describe("setRequestPriority", () => {
  it("saves a member's choice without changing status or assignment", async () => {
    const { setRequestPriority } = await api();
    expect(await setRequestPriority(requestId, "high", { orgId: ORG })).toEqual({ success: true, priority: "high" });
    expect(await saved()).toEqual({ priority: "high", status: "open", assigned_to: null });
    expect(await setRequestPriority(requestId, "none", { orgId: ORG })).toEqual({ success: true, priority: "none" });
    expect((await saved()).priority).toBe("none");
  });

  it("rejects values outside the fixed set", async () => {
    const { setRequestPriority } = await api();
    expect(await setRequestPriority(requestId, "critical", { orgId: ORG })).toEqual({ error: "Choose a valid priority" });
    expect(await setRequestPriority(requestId, null, { orgId: ORG })).toHaveProperty("error");
    expect((await saved()).priority).toBe("none");
  });

  it("denies guests, members of other workspaces and a forged workspace context", async () => {
    const { setRequestPriority } = await api();
    // Plan item 1.4: a failed membership check (guest, or a workspace context
    // that is not the session's) names the permission; "Not found" is kept
    // for a Request that is missing or belongs to another workspace.
    actAs(GUEST, "org:guest");
    expect(await setRequestPriority(requestId, "urgent", { orgId: ORG })).toEqual({ error: "You can't change Requests in this workspace." });
    actAs(FOREIGN, "org:member", FOREIGN_ORG);
    expect(await setRequestPriority(requestId, "urgent", { orgId: FOREIGN_ORG })).toEqual({ error: "Request not found" });
    expect(await setRequestPriority(requestId, "urgent", { orgId: ORG })).toEqual({ error: "You can't change Requests in this workspace." });
    expect((await saved()).priority).toBe("none");
  });

  it("refuses malformed Request ids before touching the database", async () => {
    const { setRequestPriority } = await api();
    expect(await setRequestPriority("not-a-uuid", "high", { orgId: ORG })).toEqual({ error: "Not found" });
  });
});
