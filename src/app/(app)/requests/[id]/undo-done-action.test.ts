import { addMembers } from "@/test/member-fixtures";
import { requireTestDatabase } from "@/test/test-database";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/lib/session";

const session = vi.hoisted((): Session => ({ userId: "", orgId: "", role: "member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ readSession: async () => ({ ...session }) }));

const ORG = "org_undo_done_a", FOREIGN_ORG = "org_undo_done_b";
const MEMBER = "user_undo_member", REQUESTER = "user_undo_requester", GUEST = "user_undo_guest", FOREIGN = "user_undo_foreign";
let connection: ReturnType<typeof postgres>;
let requestId: string;

const api = () => import("./actions");
const actAs = (userId: string, role: Session["role"] = "member", orgId = ORG) => { session.userId = userId; session.orgId = orgId; session.role = role; };
const saved = async () => (await connection`select status::text as status, assigned_to from requests where id = ${requestId}`)[0];
const doneAt = async (id = requestId) => (await connection`select done_at from requests where id = ${id}`)[0].done_at as Date | null;
const doneNotifications = async () => (await connection`select count(*)::int as count from notifications where request_id = ${requestId} and type = 'request_done'`)[0].count;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(databaseUrl, { max: 2, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Undo Done','undo-done-a'),(${FOREIGN_ORG},'Other workspace','undo-done-b')`;
  for (const id of [MEMBER, REQUESTER, GUEST, FOREIGN]) await connection`insert into profiles (id,full_name,email) values (${id},${id},${id + "@example.test"})`;
  await addMembers(ORG, { [MEMBER]: "member", [REQUESTER]: "member" });
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
  it("returns a Done Request to In progress, keeps its owner and withdraws the Done notification", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    expect(await pickUpRequest(requestId, { orgId: ORG })).toEqual({ success: true });
    expect(await doneAt()).toBeNull();
    expect(await markDone(requestId, { orgId: ORG })).toEqual({ success: true });
    expect(await doneNotifications()).toBe(1);
    expect(await doneAt()).toBeInstanceOf(Date);
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ success: true, status: "in_progress" });
    expect(await saved()).toEqual({ status: "in_progress", assigned_to: MEMBER });
    expect(await doneNotifications()).toBe(0);
    // The release reminder counts from the Done time, so Undo leaves none behind.
    expect(await doneAt()).toBeNull();
  });

  it("stamps a Done time on every Request a bulk Mark Done moves", async () => {
    const { markDoneMany, pickUpRequests } = await api();
    const other = randomUUID();
    await connection`insert into requests (id,org_id,title,description,created_by) values (${other},${ORG},'Undo probe two','A Request',${REQUESTER})`;
    await pickUpRequests([requestId, other], { orgId: ORG });
    const before = new Date();
    expect((await markDoneMany([requestId, other], { orgId: ORG })).moved).toHaveLength(2);
    for (const id of [requestId, other]) expect((await doneAt(id))!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  // #278: the window counts from the saved Done time, so Reopen's button and this check end together.
  it("refuses once the Done time is older than the window, even when the Request was just edited", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    await markDone(requestId, { orgId: ORG });
    // This update also stamps updated_at now (the 0002 trigger), as any later edit would.
    await connection`update requests set done_at = now() - interval '16 minutes' where id = ${requestId}`;
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ error: "Undo is only offered right after a Request is marked Done. Further work needs a new Request." });
    expect((await saved()).status).toBe("done");
    expect(await doneNotifications()).toBe(1);
  });

  it("allows it within 15 minutes of the Done time, whenever the Request was last updated", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    await markDone(requestId, { orgId: ORG });
    await connection`update requests set done_at = now() - interval '14 minutes' where id = ${requestId}`;
    // The 0002 trigger stamps updated_at on every update, so age it with the trigger paused.
    await connection`alter table requests disable trigger set_updated_at_requests`;
    try { await connection`update requests set updated_at = now() - interval '1 hour' where id = ${requestId}`; }
    finally { await connection`alter table requests enable trigger set_updated_at_requests`; }
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ success: true, status: "in_progress" });
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
    actAs(GUEST, "guest");
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ error: "You can’t change Requests in this workspace." });
    actAs(FOREIGN, "member", FOREIGN_ORG);
    expect(await undoMarkDone(requestId, { orgId: FOREIGN_ORG })).toEqual({ error: "Not found" });
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ error: "You can’t change Requests in this workspace." });
    expect((await saved()).status).toBe("done");
    expect(await doneNotifications()).toBe(1);
  });

  it("refuses malformed Request ids before touching the database", async () => {
    const { undoMarkDone } = await api();
    expect(await undoMarkDone("not-a-uuid", { orgId: ORG })).toEqual({ error: "Not found" });
  });
});

// #309: a Request whose Goal is No measurable impact has no release to record, so Mark Done says so (the browser then
// asks no "Is it live?") and its Undo works as for any other Request.
describe("Mark Done with no measurable impact", () => {
  it("says the Request has no measurable impact, and Undo still returns it to In progress", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    await connection`update requests set no_measurable_impact_reason = 'Token rename with no user-facing change' where id = ${requestId}`;
    expect(await pickUpRequest(requestId, { orgId: ORG })).toEqual({ success: true });
    expect(await markDone(requestId, { orgId: ORG })).toEqual({ success: true, noMeasurableImpact: true });
    expect(await undoMarkDone(requestId, { orgId: ORG })).toEqual({ success: true, status: "in_progress" });
  })
})
