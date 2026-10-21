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
it("enforces tenant foreign keys, and 0031 replaces the seats and agreement form with reviewers", async () => {
  const [request] =
    await connection`select id from requests where org_id='org_agreement_legacy' limit 1`;
  await expect(
    connection`insert into request_agreements(request_id,org_id) values (${request.id},'org_test_b')`,
  ).rejects.toThrow(/foreign key/);
  const columns =
    await connection`select column_name from information_schema.columns where table_name='request_agreements' order by column_name`;
  expect(columns.map((c) => c.column_name)).toEqual(["org_id", "request_id", "reviewers"]);
  const [replacements] =
    await connection`select to_regclass('public.request_replacements') as name`;
  expect(replacements.name).toBeNull();
});
it("turns filled seats into reviewers in seat order, keeping answers and dropping the requester and empty seats", async () => {
  const rows =
    await connection`select r.title, a.reviewers from request_agreements a join requests r on r.id=a.request_id where a.org_id='org_agreement_seats' order by r.title`;
  const [answered, partly, repeated] = rows.map((row) => row.reviewers);
  // Old seats never had to be different people; one person becomes one reviewer, keeping their answer.
  expect(repeated).toEqual([
    expect.objectContaining({ nominee: { kind: "member", userId: "seat_both" }, decision: expect.objectContaining({ kind: "looks_good" }) }),
  ]);
  expect(answered).toEqual([
    {
      id: expect.any(String),
      nominee: { kind: "member", userId: "seat_designer" },
      displayNameAtSelection: "Designer",
      addedBy: "seat_requester",
      note: "",
      decision: { kind: "looks_good", actorId: "seat_designer", at: "2026-10-20T01:00:00Z", reason: "" },
    },
    {
      id: expect.any(String),
      nominee: { kind: "member", userId: "seat_developer" },
      displayNameAtSelection: "Developer",
      addedBy: "seat_requester",
      note: "",
      decision: { kind: "concern", actorId: "seat_developer", at: "2026-10-20T02:00:00Z", reason: "The API cannot do this yet" },
    },
  ]);
  expect(partly).toEqual([
    expect.objectContaining({ nominee: { kind: "member", userId: "seat_pm" }, decision: null }),
    expect.objectContaining({
      nominee: { kind: "invitation", invitationId: "inv_seat", email: "invited@seat.test" },
      displayNameAtSelection: "invited@seat.test",
      decision: null,
    }),
  ]);
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
const reviewer = (userId: string, decision: Record<string, string> | null = null) => ({
  id: crypto.randomUUID(),
  nominee: { kind: "member", userId },
  displayNameAtSelection: userId,
  addedBy: "requester",
  note: "",
  decision,
});
const reviewersValid = async (value: unknown) =>
  (await connection`select valid_request_reviewers(${connection.json(value as never)}) as valid`)[0].valid;
it("accepts an empty list, twenty reviewers, Looks good and a concern with a reason", async () => {
  expect(await reviewersValid([])).toBe(true);
  expect(await reviewersValid(Array.from({ length: 20 }, (_, i) => reviewer(`person_${i}`)))).toBe(true);
  expect(await reviewersValid([
    reviewer("a", { kind: "looks_good", actorId: "a", at: "2026-10-21", reason: "" }),
    reviewer("b", { kind: "concern", actorId: "b", at: "2026-10-21", reason: "Too big" }),
  ])).toBe(true);
});
it("rejects more than twenty, a repeated person, a concern without a reason, an answer by someone else and an answered invitation", async () => {
  const invitation = { ...reviewer("x"), nominee: { kind: "invitation", invitationId: "inv_1", email: "x@example.test" } };
  for (const invalid of [
    Array.from({ length: 21 }, (_, i) => reviewer(`person_${i}`)),
    [reviewer("a"), reviewer("a")],
    [invitation, { ...invitation, id: crypto.randomUUID() }],
    [reviewer("a", { kind: "concern", actorId: "a", at: "2026-10-21", reason: " " })],
    [reviewer("a", { kind: "looks_good", actorId: "b", at: "2026-10-21", reason: "" })],
    [{ ...invitation, decision: { kind: "looks_good", actorId: "x", at: "2026-10-21", reason: "" } }],
    [reviewer("a", { kind: "agree", actorId: "a", at: "2026-10-21", reason: "" })],
    [{ ...reviewer("a"), unknown: true }],
    [{ ...reviewer("a"), note: "x".repeat(501) }],
  ])
    expect(await reviewersValid(invalid)).toBe(false);
  const [request] =
    await connection`select id from requests where org_id='org_agreement_legacy' limit 1`;
  await expect(
    connection`insert into request_agreements(request_id,org_id,reviewers) values (${request.id},'org_agreement_legacy',${connection.json([reviewer("a"), reviewer("a")] as never)})`,
  ).rejects.toThrow(/request_reviewers_valid/);
});
it("rejects malformed exception closure at the database boundary", async () => {
  const [request] =
    await connection`select id from requests where org_id='org_test_a' limit 1`;
  await expect(
    connection`update requests set exception_closure='{}'::jsonb where id=${request.id}`,
  ).rejects.toThrow();
});
