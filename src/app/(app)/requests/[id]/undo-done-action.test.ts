import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG = "org_undo_done_a", FOREIGN_ORG = "org_undo_done_b";
const MEMBER = "user_undo_member", REQUESTER = "user_undo_requester", GUEST = "user_undo_guest", FOREIGN = "user_undo_foreign";
let connection: ReturnType<typeof postgres>;
let requestId: string;

const api = () => import("./actions");
const actAs = (userId: string, orgRole = "org:member", orgId = ORG) => { session.userId = userId; session.orgId = orgId; session.orgRole = orgRole; };
const saved = async () => (await connection`select status::text as status, assigned_to from requests where id = ${requestId}`)[0];
const doneNotifications = async () => (await connection`select count(*)::int as count from notifications where request_id = ${requestId} and type = 'request_done'`)[0].count;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") throw new Error("Undo tests require local lane_test");
  connection = postgres(databaseUrl, { max: 2, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Undo Done','undo-done-a'),(${FOREIGN_ORG},'Other workspace','undo-done-b')`;
  for (const id of [MEMBER, REQUESTER, GUEST, FOREIGN]) await connection`insert into profiles (id,full_name,email) values (${id},${id},${id + "@example.test"})`;
});
beforeEach(async () => {
  actAs(MEMBER);
  requestId = randomUUID();
  // Submitted by someone else, so marking Done notifies the requester.
  await connection`insert into requests (id,org_id,title,description,created_by) values (${requestId},${ORG},'Undo probe','A Request',${REQUESTER})`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG},${FOREIGN_ORG})`;
  await connection`delete from profiles where id in (${MEMBER},${REQUESTER},${GUEST},${FOREIGN})`;
  await connection.end();
});

describe("undoMarkDone", () => {
  it("returns a Done Request to In Progress, keeps its owner and withdraws the Done notification", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    expect(await pickUpRequest(requestId, { orgId: ORG })).toEqual({ success: true });
    expect(await markDone(requestId, { orgId: ORG })).toEqual({ success: true });
    expect(await doneNotifications()).toBe(1);
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ success: true, status: "in_progress" });
    expect(await saved()).toEqual({ status: "in_progress", assigned_to: MEMBER });
    expect(await doneNotifications()).toBe(0);
  });

  it("refuses once the Done move is older than the undo window", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    await markDone(requestId, { orgId: ORG });
    // The 0002 trigger stamps updated_at on every update, so age the row with it paused.
    await connection`alter table requests disable trigger set_updated_at_requests`;
    try { await connection`update requests set updated_at = now() - interval '1 hour' where id = ${requestId}`; }
    finally { await connection`alter table requests enable trigger set_updated_at_requests`; }
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ error: "Undo is only offered right after a Request is marked Done. Further work needs a new Request." });
    expect((await saved()).status).toBe("done");
    expect(await doneNotifications()).toBe(1);
  });

  it("refuses a Request that is not Done", async () => {
    const { undoMarkDone } = await api();
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ error: "This Request is not Done. Refresh to see its current state." });
    expect((await saved()).status).toBe("open");
  });

  it("denies guests, members of other workspaces and a forged workspace context", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    await markDone(requestId, { orgId: ORG });
    // Plan item 1.4: a failed membership check (guest, or a workspace context
    // that is not the session's) names the permission; "Not found" is kept
    // for a Request that belongs to another workspace.
    actAs(GUEST, "org:guest");
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ error: "You can't change Requests in this workspace." });
    actAs(FOREIGN, "org:member", FOREIGN_ORG);
    expect(await undoMarkDone(requestId, { orgId: FOREIGN_ORG })).toEqual({ error: "Not found" });
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ error: "You can't change Requests in this workspace." });
    expect((await saved()).status).toBe("done");
    expect(await doneNotifications()).toBe(1);
  });

  it("refuses malformed Request ids before touching the database", async () => {
    const { undoMarkDone } = await api();
    expect(await undoMarkDone("not-a-uuid", { orgId: ORG })).toEqual({ error: "Not found" });
  });
});
