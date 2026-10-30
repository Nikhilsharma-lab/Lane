import { requireTestDatabase } from "@/test/test-database";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Review of #195 (decision 1, 2026-10-26): a Correction of the actual result records the corrected value as well as
// its text, so quarter and year totals can count it. Older text-only Corrections stay valid and keep the closing value.
const ORG = "org_corrected_values_schema";
const USER = "user_test_admin_a";
const fingerprint = "c".repeat(64);
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  requireTestDatabase(url);
  connection = postgres(url, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Corrected values','corrected-values-schema')`;
});
afterAll(async () => {
  // Closed Requests are never deleted (protect_request_closure); the rows stay until the next test run resets the database.
  await connection?.end();
});

const release = { exposureDate: "2026-08-10", audience: "all", evidence: "Release log", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" };
const measured = {
  version: 1, kind: "measured", actorId: USER, ownerId: USER, closedAt: "2026-09-10T00:00:00.000Z", operationId: randomUUID(), fingerprint,
  expected: { kind: "metric", metric: "Conversion", unit: "%", baseline: 40, target: 50, source: "Analytics", reviewAfterDays: 30 }, release,
  primary: { kind: "numeric", actual: 46, unit: "%" }, guardrails: [], evidence: "Dashboard", observedFrom: "2026-08-10", observedTo: "2026-09-09", revision: 1,
};
const correction = (over: Record<string, unknown>, revision = 2) => ({ operationId: randomUUID(), fingerprint, actorId: USER, at: "2026-09-12T00:00:00.000Z", field: "actual", correction: "It was 48%", reason: "Wrong export", revision, ...over });

async function closedRequest() {
  const [row] = await connection`insert into requests (org_id,title,description,created_by,status) values (${ORG},'Corrected','Fixture',${USER},'done') returning id`;
  await connection`update requests set outcome_closure = ${connection.json({ ...measured, operationId: randomUUID() } as never)}, agreement_revision = 1 where id = ${row.id}`;
  return row.id as string;
}
const correct = (id: string, corrections: unknown[]) =>
  connection`update requests set closure_corrections = ${connection.json(corrections as never)}, agreement_revision = agreement_revision + 1 where id = ${id}`;

describe("a Correction's corrected value", () => {
  it("keeps text-only Corrections valid", async () => {
    await correct(await closedRequest(), [correction({})]);
  });

  it("stores a number or a pass/fail answer beside the text of an actual result's Correction", async () => {
    const id = await closedRequest();
    const first = correction({ value: { kind: "numeric", actual: 48 } });
    await correct(id, [first]);
    await correct(id, [first, correction({ value: { kind: "pass_fail", passed: false } }, 3)]);
    const [row] = await connection`select closure_corrections, outcome_closure->'primary'->'actual' as actual from requests where id = ${id}`;
    expect(row.actual).toBe(46);
    expect(row.closure_corrections.map((c: { value: unknown }) => c.value)).toEqual([{ kind: "numeric", actual: 48 }, { kind: "pass_fail", passed: false }]);
  });

  it("refuses a value on any other part of the closure, and any value that isn't a number or a pass/fail answer", async () => {
    const invalid = [
      correction({ field: "evidence", value: { kind: "numeric", actual: 48 } }),
      correction({ value: 48 }),
      correction({ value: { kind: "numeric", actual: "48" } }),
      correction({ value: { kind: "numeric", actual: 48, unit: "%" } }),
      correction({ value: { kind: "pass_fail", passed: "yes" } }),
      correction({ value: { kind: "verdict", passed: true } }),
      correction({ value: null }),
    ];
    for (const item of invalid) await expect(correct(await closedRequest(), [item])).rejects.toMatchObject({ code: "23514" });
  });

  it("stays append-only: a stored value can't be rewritten", async () => {
    const id = await closedRequest();
    await correct(id, [correction({ value: { kind: "numeric", actual: 48 } })]);
    await expect(connection`update requests set closure_corrections = jsonb_set(closure_corrections, '{0,value,actual}', '50'), agreement_revision = agreement_revision + 1 where id = ${id}`).rejects.toThrow(/immutable/);
  });
});
