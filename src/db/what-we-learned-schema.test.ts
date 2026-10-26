import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// #209: What we learned is an optional one-line field stored with the closure, changed only by a Correction.
const ORG = "org_what_we_learned_schema";
const USER = "user_test_admin_a";
const fingerprint = "a".repeat(64);
let connection: ReturnType<typeof postgres>;

beforeAll(async () => {
  const url = process.env.DATABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Schema tests require disposable local PostgreSQL");
  connection = postgres(url, { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'What we learned','what-we-learned-schema')`;
});
afterAll(async () => {
  // Closed Requests are never deleted (protect_request_closure), so, like request-outcome-schema.test.ts, the rows
  // stay until the next test run resets the database.
  await connection?.end();
});

const release = { exposureDate: "2026-08-10", audience: "all", evidence: "Release log", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" };
const measured = (over: Record<string, unknown> = {}) => ({
  version: 1, kind: "measured", actorId: USER, ownerId: USER, closedAt: "2026-09-10T00:00:00.000Z", operationId: randomUUID(), fingerprint,
  expected: { kind: "verification", result: "Keyboard checkout works", source: "Checklist", reviewAfterDays: 14 }, release,
  primary: { kind: "pass_fail", passed: true }, guardrails: [], evidence: "Checklist run", observedFrom: "2026-08-10", observedTo: "2026-09-09", revision: 1, ...over,
});
const exception = (over: Record<string, unknown> = {}) => ({
  version: 1, kind: "exception", reasonCode: "rolled_back", reason: "Broke Safari", actorId: USER, ownerId: USER, closedAt: "2026-09-10T00:00:00.000Z",
  operationId: randomUUID(), fingerprint, release, revision: 1, ...over,
});
const correction = (field: string, text: string, revision: number) => ({ operationId: randomUUID(), fingerprint, actorId: USER, at: "2026-09-12T00:00:00.000Z", field, correction: text, reason: "Clearer wording", revision });

async function startedRequest() {
  const [row] = await connection`insert into requests (org_id,title,description,created_by,status) values (${ORG},'Learned','Fixture',${USER},'done') returning id`;
  return row.id as string;
}
const close = (id: string, column: "outcome_closure" | "exception_closure", value: unknown) =>
  connection`update requests set ${connection(column)} = ${connection.json(value as never)}, agreement_revision = 1 where id = ${id}`;

describe("What we learned on a closure", () => {
  it("keeps closures saved without it valid", async () => {
    await close(await startedRequest(), "outcome_closure", measured());
    await close(await startedRequest(), "exception_closure", exception());
  });

  it("stores one trimmed line with a measured result or a closure without one", async () => {
    const id = await startedRequest();
    await close(id, "outcome_closure", measured({ learned: "Keyboard users find the shortcut on their own" }));
    const [row] = await connection`select outcome_closure->>'learned' as learned from requests where id = ${id}`;
    expect(row.learned).toBe("Keyboard users find the shortcut on their own");
    await close(await startedRequest(), "exception_closure", exception({ learned: "Test on Safari before release" }));
  });

  it("refuses a blank, padded, multi-line, too long or non-text lesson", async () => {
    for (const learned of ["", "  ", " padded", "two\nlines", "carriage\rreturn", "x".repeat(281), 42, null]) {
      await expect(close(await startedRequest(), "outcome_closure", measured({ learned }))).rejects.toMatchObject({ code: "23514" });
      await expect(close(await startedRequest(), "exception_closure", exception({ learned }))).rejects.toMatchObject({ code: "23514" });
    }
    await close(await startedRequest(), "outcome_closure", measured({ learned: "x".repeat(280) }));
  });

  it("can't be rewritten in place once closed", async () => {
    const id = await startedRequest();
    await close(id, "outcome_closure", measured({ learned: "First wording" }));
    await expect(connection`update requests set outcome_closure = jsonb_set(outcome_closure, '{learned}', '"Rewritten"') where id = ${id}`).rejects.toThrow(/immutable/);
    await expect(connection`update requests set outcome_closure = outcome_closure - 'learned' where id = ${id}`).rejects.toThrow(/immutable/);
  });

  it("changes only through an appended one-line Correction, keeping the original", async () => {
    const id = await startedRequest();
    await close(id, "outcome_closure", measured({ learned: "First wording" }));
    await connection`update requests set closure_corrections = ${connection.json([correction("learned", "Better wording", 2)])}, agreement_revision = 2 where id = ${id}`;
    const [row] = await connection`select outcome_closure->>'learned' as learned, closure_corrections from requests where id = ${id}`;
    expect(row).toMatchObject({ learned: "First wording", closure_corrections: [{ field: "learned", correction: "Better wording" }] });
    for (const text of ["two\nlines", "x".repeat(281)])
      await expect(connection`update requests set closure_corrections = ${connection.json([...row.closure_corrections, correction("learned", text, 3)])}, agreement_revision = 3 where id = ${id}`).rejects.toMatchObject({ code: "23514" });
  });
});
