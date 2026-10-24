import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import type { WorkspaceSearchResponse } from "@/lib/workspace-search";

const session = vi.hoisted(() => ({ userId: "user_code_search_member", orgId: "org_code_search_a", orgRole: "org:member" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG_A = "org_code_search_a";
const ORG_B = "org_code_search_b";
const MEMBER = "user_code_search_member";
const GUEST = "user_code_search_guest";
let connection: ReturnType<typeof postgres>;
let memberRequestId: string;
let guestRequestId: string;

async function search(query: string) {
  const params = new URLSearchParams({ org: ORG_A, q: query });
  const response = await GET(new Request(`http://lane.test/api/search?${params}`));
  expect(response.status).toBe(200);
  return await response.json() as WorkspaceSearchResponse;
}

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  requireTestDatabase(process.env.DATABASE_URL);
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
    const result = await search(" lan-1 ");
    expect(result).toMatchObject({ success: true, requests: { total: 1, items: [{ id: memberRequestId, requestNumber: 1 }] } });
    if (result.success) expect(result.requests.items).toHaveLength(1);
  });

  it("does not expose another submitter's Request or its total when a guest knows its code", async () => {
    session.userId = GUEST; session.orgRole = "org:guest";
    expect(await search("LAN-1")).toMatchObject({
      success: true, requests: { items: [], total: 0, hasMore: false },
    });
  });

  it("lets a guest retrieve their own Request by code using the UUID detail identity", async () => {
    session.userId = GUEST; session.orgRole = "org:guest";
    expect(await search("LAN-2")).toMatchObject({
      success: true, requests: { total: 1, items: [{ id: guestRequestId, requestNumber: 2 }] },
    });
  });
});
