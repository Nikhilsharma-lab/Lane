import { fixtureClerkClient } from "@/test/member-fixtures";
import { requireTestDatabase } from "@/test/test-database";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session, clerkClient: async () => fixtureClerkClient(ORG, [MEMBER, OWNER]) }));

const ORG = "org_measurement_actions", OTHER_ORG = "org_measurement_other";
const OWNER = "user_measurement_owner", MEMBER = "user_measurement_member";
let connection: ReturnType<typeof postgres>;
let requestId: string;
const api = () => import("./actions");
const actAs = (userId = OWNER, orgRole = "org:member", orgId = ORG) => Object.assign(session, { userId, orgRole, orgId });
const plan = (current: number | null = null) => ({
  kind: "measurement" as const, version: 2 as const,
  primary: { key: "conversion" as const, name: "", unit: "percent" as const, current, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all" as const, platform: "all" as const, windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [{ key: "support" as const, name: "", unit: "count" as const, current: null as number | null, noBaseline: false as const, operator: "at_most" as const, limit: 20 }],
});
const saved = async (id = requestId) => (await connection`select expected_impact, status::text as status, assigned_to from requests where id = ${id}`)[0];
const setPlan = async (value: ReturnType<typeof plan>, type: "improvement" | "new_feature" = "improvement") => connection`update requests set expected_impact=${connection.json(value)}, request_type=${type}::request_type where id=${requestId}`;

beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL!;
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(databaseUrl, { max: 4, prepare: false });
  await connection`insert into organizations(id,name,slug) values (${ORG},'Measurement actions','measurement-actions'),(${OTHER_ORG},'Other measurement workspace','other-measurement-actions')`;
  for (const id of [OWNER, MEMBER]) await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`;
});
beforeEach(async () => {
  actAs();
  requestId = randomUUID();
  await connection`insert into requests(id,org_id,title,description,created_by,request_type,expected_impact) values (${requestId},${ORG},'Measure this Request','Request context',${OWNER},'improvement',${connection.json(plan())})`;
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG},${OTHER_ORG})`;
  await connection`delete from profiles where id in (${OWNER},${MEMBER})`;
  await connection.end();
});

describe("measurement pickup readiness", () => {
  it("tells the list and detail why pickup is blocked, without sending the plan to the list", async () => {
    const { loadRequestDetail, loadRequestList } = await import("@/lib/data/requests");
    const auth = { userId: MEMBER, orgId: ORG, role: "member" as const };
    const row = (await loadRequestList(auth)).rows.find(item => item.id === requestId)!;
    expect(row.pickupBlockedReason).toMatch(/current value/i);
    expect(row).not.toHaveProperty("expectedImpact");
    expect((await loadRequestDetail(auth, requestId))?.request.pickupBlockedReason).toBe(row.pickupBlockedReason);
    await setPlan(plan(40));
    expect((await loadRequestList(auth)).rows.find(item => item.id === requestId)?.pickupBlockedReason).toBeNull();
  });
  it("refuses pickup with a missing current value and writes no notification or assignment", async () => {
    const { pickUpRequest } = await api();
    actAs(MEMBER);
    expect(await pickUpRequest(requestId, { orgId: ORG })).toHaveProperty("error");
    expect(await saved()).toMatchObject({ status: "open", assigned_to: null });
    expect(await connection`select id from notifications where request_id=${requestId}`).toHaveLength(0);
  });
  it("bulk pickup moves only ready Requests", async () => {
    const ready = randomUUID();
    const value = plan(50); value.guardrails[0].current = 10;
    await connection`insert into requests(id,org_id,title,description,created_by,request_type,expected_impact) values (${ready},${ORG},'Ready Request','Context',${OWNER},'improvement',${connection.json(value)})`;
    actAs(MEMBER);
    const result = await (await api()).pickUpRequests([requestId, ready], { orgId: ORG });
    expect(result.moved).toEqual([ready]);
    expect(result.failed).toEqual([{ id: requestId, error: expect.stringMatching(/current value/i) }]);
    expect(await saved()).toMatchObject({ status: "open", assigned_to: null });
    expect(await saved(ready)).toMatchObject({ status: "in_progress", assigned_to: MEMBER });
  });
  it("allows pickup with a threshold and an explicit new-feature primary exception", async () => {
    const value = plan(); value.primary.noBaseline = true;
    await setPlan(value, "new_feature");
    expect(await (await api()).pickUpRequest(requestId, { orgId: ORG })).toEqual({ success: true });
  });
  it.each(["single", "bulk"])("rechecks %s pickup readiness after waiting for a concurrent row update", async mode => {
    const value = plan(50); value.guardrails[0].current = 10;
    await setPlan(value);
    const actions = await api();
    actAs(MEMBER);
    let attempt: Promise<unknown> | undefined;
    await connection.begin(async transaction => {
      await transaction`select id from requests where id=${requestId} for update`;
      attempt = mode === "single"
        ? actions.pickUpRequest(requestId, { orgId: ORG })
        : actions.pickUpRequests([requestId], { orgId: ORG });
      // Prove the pickup has reached its UPDATE and is waiting on this lock.
      let waiting = false;
      for (let check = 0; check < 100 && !waiting; check++) {
        const rows = await connection`select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query like '%requests%' AND query like '%for update%'`;
        waiting = rows.length > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      value.primary.current = null;
      await transaction`update requests set expected_impact=${transaction.json(value)} where id=${requestId}`;
    });
    const result = await attempt;
    expect(result).toMatchObject(mode === "single" ? { error: expect.stringMatching(/current value/i) } : { moved: [], failed: [{ id: requestId, error: expect.stringMatching(/current value/i) }] });
    expect(await saved()).toMatchObject({ status: "open", assigned_to: null });
    expect(await connection`select id from notifications where request_id=${requestId}`).toHaveLength(0);
  });
});

