import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
const connection = postgres(process.env.DATABASE_URL!, {
  max: 2,
  prepare: false,
});
afterAll(() => connection.end());
it("preserves legacy columns, measurement versions, dates and comments across migration", async () => {
  const rows =
    await connection`select * from requests where org_id='org_agreement_legacy' order by title`;
  expect(rows).toHaveLength(6);
  expect(rows.map((row) => row.status)).toEqual([
    "open",
    "in_progress",
    "done",
    "open",
    "in_progress",
    "done",
  ]);
  expect(
    rows.map(
      (row) =>
        row.expected_impact?.version ?? row.expected_impact?.kind ?? null,
    ),
  ).toEqual([null, "metric", "verification", 2, 3, 4]);
  for (const row of rows) {
    expect(row.agreement_revision).toBe(0);
    expect(row.exception_closure).toBeNull();
    expect(row.description).toBe("Original saved context");
    expect(row.updated_at.toISOString()).toBe("2026-09-02T00:00:00.000Z");
  }
  expect(
    await connection`select c.body from comments c join requests r on r.id=c.request_id where r.org_id='org_agreement_legacy' and c.body='Original comment'`,
  ).toHaveLength(6);
});
it("enforces tenant foreign keys and submission nullability", async () => {
  const [request] =
    await connection`select id from requests where org_id='org_agreement_legacy' limit 1`;
  const prepared = {
    version: 1,
    scopeIncluded: "Scope",
    scopeExcluded: "Other",
    audience: "Users",
    timing: "Now",
    constraints: "Existing API",
    feasibility: "Verified",
    commitmentKind: "delivery",
  };
  await expect(
    connection`insert into request_agreements(request_id,org_id,prepared,seats) values (${request.id},'org_test_b',${connection.json(prepared)},'{"pm":null,"designer":null,"developer":null}')`,
  ).rejects.toThrow(/foreign key/);
  await expect(
    connection`insert into request_agreements(request_id,org_id,prepared,seats,submitted_by,submitted_at) values (${request.id},'org_agreement_legacy',${connection.json(prepared)},'{"pm":null,"designer":null,"developer":null}','user_test_admin_a',now())`,
  ).rejects.toThrow(/check constraint/);
  const [other] =
    await connection`select id from requests where org_id='org_test_a' limit 1`;
  await expect(
    connection`insert into request_replacements(original_id,replacement_id,org_id,created_by,reason,changed_fields) values (${request.id},${other.id},'org_agreement_legacy','user_test_admin_a','Cross-tenant attempt','[]')`,
  ).rejects.toThrow(/foreign key/);
});
it("keeps existing Requests without invented agreement or exception closure", async () => {
  const rows =
    await connection`select status, agreement_revision, exception_closure from requests where org_id='org_test_a'`;
  expect(rows.length).toBeGreaterThan(0);
  expect(
    rows.every(
      (row) => row.agreement_revision === 0 && row.exception_closure === null,
    ),
  ).toBe(true);
  expect(
    await connection`select * from request_agreements where org_id='org_test_a'`,
  ).toHaveLength(0);
});
it("rejects unknown seat/nominee/decision keys and invalid decision attribution", async () => {
  const seat = {
    generation: 1,
    nominee: { kind: "member", userId: "person" },
    decision: null,
    displayNameAtSelection: "Person",
  };
  for (const invalid of [
    { ...seat, unknown: true },
    { ...seat, nominee: { ...seat.nominee, invitationId: "forged" } },
    {
      ...seat,
      decision: {
        kind: "agree",
        actorId: "person",
        reason: "",
        at: "2026-10-21",
        unknown: true,
      },
    },
    {
      ...seat,
      decision: {
        kind: "agree",
        actorId: "other",
        reason: "",
        at: "2026-10-21",
      },
    },
    { ...seat, generation: 1.5 },
  ]) {
    const [row] =
      await connection`select valid_agreement_seats(${connection.json({ pm: invalid, designer: null, developer: null })}) as valid`;
    expect(row.valid).toBe(false);
  }
});
it("rejects malformed exception closure at the database boundary", async () => {
  const [request] =
    await connection`select id from requests where org_id='org_test_a' limit 1`;
  await expect(
    connection`update requests set exception_closure='{}'::jsonb where id=${request.id}`,
  ).rejects.toThrow();
});
