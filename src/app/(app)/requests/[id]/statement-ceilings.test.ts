import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { queryCounter } from "@/db";

// Plan §2.2 server budget: statement count per action at or below a ceiling,
// measured with the shared client's query counter against lane_test. Plan
// item 1.4 makes pick up and Done one data-modifying CTE each (UPDATE +
// notification INSERT), Undo one CTE (UPDATE + DELETE), and a failed move
// at most the CTE plus one diagnostic read.

const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG = "org_statement_ceilings";
const MEMBER = "user_ceilings_member", REQUESTER = "user_ceilings_requester";
let connection: ReturnType<typeof postgres>;
let requestId: string;

const api = () => import("./actions");
const measure = queryCounter.measure;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/lane_test") throw new Error("Statement ceiling tests require local lane_test");
  connection = postgres(databaseUrl, { max: 2, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Statement ceilings','statement-ceilings')`;
  for (const id of [MEMBER, REQUESTER]) await connection`insert into profiles (id,full_name,email) values (${id},${id},${id + "@example.test"})`;
  session.userId = MEMBER; session.orgId = ORG; session.orgRole = "org:member";
});
beforeEach(async () => {
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
  it("pickUpRequest succeeds in one statement", async () => {
    const { pickUpRequest } = await api();
    const { result, statements } = await measure(() => pickUpRequest(requestId, { orgId: ORG }));
    expect(result).toEqual({ success: true });
    expect(statements).toBeLessThanOrEqual(1);
  });

  it("markDone succeeds in one statement", async () => {
    const { markDone, pickUpRequest } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    const { result, statements } = await measure(() => markDone(requestId, { orgId: ORG }));
    expect(result).toEqual({ success: true });
    expect(statements).toBeLessThanOrEqual(1);
  });

  it("undoMarkDone succeeds in at most two statements", async () => {
    const { markDone, pickUpRequest, undoMarkDone } = await api();
    await pickUpRequest(requestId, { orgId: ORG });
    await markDone(requestId, { orgId: ORG });
    const { result, statements } = await measure(() => undoMarkDone(requestId, { orgId: ORG }));
    expect(result).toEqual({ success: true, status: "in_progress" });
    expect(statements).toBeLessThanOrEqual(2);
  });

  it("setRequestPriority succeeds in one statement", async () => {
    const { setRequestPriority } = await api();
    const { result, statements } = await measure(() => setRequestPriority(requestId, "high", { orgId: ORG }));
    expect(result).toEqual({ success: true, priority: "high" });
    expect(statements).toBeLessThanOrEqual(1);
  });

  it("a markDone on an Open Request fails in at most two statements", async () => {
    const { markDone } = await api();
    const { result, statements } = await measure(() => markDone(requestId, { orgId: ORG }));
    expect(result).toEqual({ error: "This Request is no longer In Progress. Refresh to see its current state." });
    expect(statements).toBeLessThanOrEqual(2);
  });
});
