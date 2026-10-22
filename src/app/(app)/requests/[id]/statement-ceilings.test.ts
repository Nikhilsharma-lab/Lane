import { fixtureClerkClient } from "@/test/member-fixtures";
import { TEST_DATABASE_PATH } from "@/test/test-database";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { queryCounter } from "@/db";

// Reviewer-era progress checks add one ordered Request lock and two batched reads before
// the existing transition/notification CTE. The ceiling includes BEGIN/COMMIT;
// bulk operations still use a bounded number of statements independent of size.
// Comment, priority and Undo budgets retain their existing narrow boundaries.

const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session, clerkClient: async () => fixtureClerkClient(ORG, [MEMBER, REQUESTER]) }));

const ORG = "org_statement_ceilings";
const MEMBER = "user_ceilings_member", REQUESTER = "user_ceilings_requester";
let connection: ReturnType<typeof postgres>;
let requestId: string;

const api = () => import("./actions");
const measure = queryCounter.measure;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !TEST_DATABASE_PATH.test(url.pathname)) throw new Error("Statement ceiling tests require local lane_test");
  connection = postgres(databaseUrl, { max: 2, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Statement ceilings','statement-ceilings')`;
  for (const id of [MEMBER, REQUESTER]) await connection`insert into profiles (id,full_name,email) values (${id},${id},${id + "@example.test"})`;
  session.userId = MEMBER; session.orgId = ORG; session.orgRole = "org:member";
});
beforeEach(async () => {
  session.userId = MEMBER; session.orgRole = "org:member";
  requestId = randomUUID();
  // Submitted by someone else, so every lifecycle move also writes a notification.
  await connection`insert into requests (id,org_id,title,description,created_by) values (${requestId},${ORG},'Ceiling probe','A Request',${REQUESTER})`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id = ${ORG}`;
  await connection`delete from profiles where id in (${MEMBER},${REQUESTER})`;
  await connection.end();
});

describe("statement ceilings per Request mutation", () => {
  it("pickUpRequest stays within the progress transaction budget", async () => {
    const { pickUpRequest } = await api();
    const { result, statements } = await measure(() => pickUpRequest(requestId, { orgId: ORG }));
    expect(result).toEqual({ success: true });
    expect(statements).toBeLessThanOrEqual(7);
  });

  it("markDone stays within the progress transaction budget", async () => {
    const { markDone, pickUpRequest } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    const { result, statements } = await measure(() => markDone(requestId, { orgId: ORG }));
    expect(result).toEqual({ success: true });
    expect(statements).toBeLessThanOrEqual(7);
  });

  it("undoMarkDone succeeds within the transaction budget", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    await markDone(requestId, { orgId: ORG });
    const { result, statements } = await measure(() => undoMarkDone(requestId, { orgId: ORG }));
    expect(result).toEqual({ success: true, status: "in_progress" });
    expect(statements).toBeLessThanOrEqual(2);
  });

  it("setRequestPriority succeeds in one statement", async () => {
    session.userId = REQUESTER;
    const { setRequestPriority } = await api();
    const { result, statements } = await measure(() => setRequestPriority(requestId, "high", { orgId: ORG }));
    expect(result).toEqual({ success: true, priority: "high" });
    expect(statements).toBeLessThanOrEqual(1);
  });

  // Plan item 2.5: the comment, its notification and the Request read are one CTE.
  it("addComment succeeds in one statement and notifies the requester", async () => {
    const { addComment } = await api();
    const form = new FormData();
    form.set("body", "A ceiling comment");
    const { result, statements } = await measure(() => addComment(requestId, form, { orgId: ORG }));
    expect(result).toMatchObject({ success: true, comment: { id: expect.any(String), createdAt: expect.any(Date) } });
    expect(statements).toBeLessThanOrEqual(1);
    const id = result.comment?.id ?? "";
    expect(await connection`select body from comments where id = ${id}`).toEqual([{ body: "A ceiling comment" }]);
    const notified = await connection`select user_id, actor_id from notifications where request_id = ${requestId} and type = 'comment_added'`;
    expect(notified).toEqual([{ user_id: REQUESTER, actor_id: MEMBER }]);
  });

  it("addComment with an empty body runs no statement", async () => {
    const { addComment } = await api();
    const form = new FormData();
    form.set("body", "   ");
    const { result, statements } = await measure(() => addComment(requestId, form, { orgId: ORG }));
    expect(result).toEqual({ error: "Comment cannot be empty" });
    expect(statements).toBe(0);
  });

  it("a guest's addComment on someone else's Request writes nothing in at most one statement", async () => {
    const { addComment } = await api();
    const form = new FormData();
    form.set("body", "Not my Request");
    session.orgRole = "org:guest";
    try {
      const { result, statements } = await measure(() => addComment(requestId, form, { orgId: ORG }));
      expect(result).toEqual({ error: "Not found" });
      expect(statements).toBeLessThanOrEqual(1);
    } finally {
      session.orgRole = "org:member";
    }
    expect(await connection`select id from comments where request_id = ${requestId}`).toEqual([]);
    expect(await connection`select id from notifications where request_id = ${requestId}`).toEqual([]);
  });

  it("a markDone on an Open Request fails within the transaction budget", async () => {
    const { markDone } = await api();
    const { result, statements } = await measure(() => markDone(requestId, { orgId: ORG }));
    expect(result).toEqual({ error: "This Request is no longer In progress. Refresh to see its current state." });
    expect(statements).toBeLessThanOrEqual(7);
  });
});

describe("statement ceilings per bulk Request mutation", () => {
  async function insertRequests(count: number) {
    const ids = Array.from({ length: count }, () => randomUUID());
    for (const id of ids) await connection`insert into requests (id,org_id,title,description,created_by) values (${id},${ORG},'Bulk ceiling probe','A Request',${REQUESTER})`;
    return ids;
  }

  it("pickUpRequests moves ten Requests within the transaction budget", async () => {
    const { pickUpRequests } = await api();
    const ids = await insertRequests(10);
    const { result, statements } = await measure(() => pickUpRequests(ids, { orgId: ORG }));
    expect(result.error).toBeUndefined();
    expect([...result.moved].sort()).toEqual([...ids].sort());
    expect(result.failed).toEqual([]);
    expect(statements).toBeLessThanOrEqual(7);
    const notified = await connection`select request_id from notifications where org_id = ${ORG} and type = 'request_picked_up' and request_id = any(${ids})`;
    expect(notified).toHaveLength(10);
  });

  it("markDoneMany moves ten Requests within the transaction budget", async () => {
    const { markDoneMany, pickUpRequests } = await api();
    const ids = await insertRequests(10);
    await pickUpRequests(ids, { orgId: ORG });
    const { result, statements } = await measure(() => markDoneMany(ids, { orgId: ORG }));
    expect([...result.moved].sort()).toEqual([...ids].sort());
    expect(result.failed).toEqual([]);
    expect(statements).toBeLessThanOrEqual(7);
    const done = await connection`select id from requests where status = 'done' and id = any(${ids})`;
    expect(done).toHaveLength(10);
  });

  it("reports the rows a bulk move skipped, within the transaction budget", async () => {
    const { markDoneMany, pickUpRequests } = await api();
    const ids = await insertRequests(3);
    await pickUpRequests(ids.slice(0, 2), { orgId: ORG });
    const { result, statements } = await measure(() => markDoneMany([...ids, "not-a-uuid"], { orgId: ORG }));
    expect([...result.moved].sort()).toEqual(ids.slice(0, 2).sort());
    expect(result.failed).toEqual([
      { id: "not-a-uuid", error: "Not found" },
      { id: ids[2], error: "This Request is no longer In progress. Refresh to see its current state." },
    ]);
    expect(statements).toBeLessThanOrEqual(7);
  });

  it("refuses a guest bulk move without touching the database", async () => {
    const { pickUpRequests } = await api();
    const ids = await insertRequests(2);
    session.orgRole = "org:guest";
    try {
    const { result, statements } = await measure(() => pickUpRequests(ids, { orgId: ORG }));
      expect(result.error).toBe("You can't change Requests in this workspace.");
      expect(result.moved).toEqual([]);
      expect(statements).toBe(0);
    } finally {
      session.orgRole = "org:member";
    }
    const open = await connection`select id from requests where status = 'open' and id = any(${ids})`;
    expect(open).toHaveLength(2);
  });
});
