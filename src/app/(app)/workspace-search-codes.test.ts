import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { searchWorkspace } from "./workspace-search-actions";

const session = vi.hoisted(() => ({ userId: "user_code_search_member", orgId: "org_code_search_a", orgRole: "org:member" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG_A = "org_code_search_a";
const ORG_B = "org_code_search_b";
const MEMBER = "user_code_search_member";
const GUEST = "user_code_search_guest";
let connection: ReturnType<typeof postgres>;
let memberRequestId: string;
let guestRequestId: string;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") {
    throw new Error("Code search integration tests require local lane_test");
  }
  connection = postgres(databaseUrl, { max: 1, prepare: false });
  await connection`insert into profiles (id,full_name,email) values
    (${MEMBER},'Member','member-code@example.test'), (${GUEST},'Guest','guest-code@example.test')`;
  await connection`insert into organizations (id,name,slug) values
    (${ORG_A},'Code search A','code-search-a'), (${ORG_B},'Code search B','code-search-b')`;
  const [member] = await connection`insert into requests (org_id,title,description,created_by)
    values (${ORG_A},'Member Request','Private member context',${MEMBER}) returning id`;
  memberRequestId = member.id;
  const [guest] = await connection`insert into requests (org_id,title,description,created_by)
    values (${ORG_A},'Guest Request','Guest submitted context',${GUEST}) returning id`;
  guestRequestId = guest.id;
  await connection`insert into requests (org_id,title,description,created_by)
    values (${ORG_B},'Other workspace Request','Other private context',${MEMBER})`;
});

beforeEach(() => { session.userId = MEMBER; session.orgId = ORG_A; session.orgRole = "org:member"; });
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG_A},${ORG_B})`;
  await connection`delete from profiles where id in (${MEMBER},${GUEST})`;
  await connection.end();
});

describe("saved code retrieval with actual workspace data", () => {
  it("retrieves only the active workspace's Request when codes collide across workspaces", async () => {
    const result = await searchWorkspace({ query: " lan-1 " }, { orgId: ORG_A });
    expect(result).toMatchObject({ success: true, requests: { total: 1, items: [{ id: memberRequestId, requestNumber: 1 }] } });
    if (result.success) expect(result.requests.items).toHaveLength(1);
  });

  it("does not expose another submitter's Request or its total when a guest knows its code", async () => {
    session.userId = GUEST; session.orgRole = "org:guest";
    expect(await searchWorkspace({ query: "LAN-1" }, { orgId: ORG_A })).toMatchObject({
      success: true, requests: { items: [], total: 0, hasMore: false },
    });
  });

  it("lets a guest retrieve their own Request by code using the UUID detail identity", async () => {
    session.userId = GUEST; session.orgRole = "org:guest";
    expect(await searchWorkspace({ query: "LAN-2" }, { orgId: ORG_A })).toMatchObject({
      success: true, requests: { total: 1, items: [{ id: guestRequestId, requestNumber: 2 }] },
    });
  });
});
