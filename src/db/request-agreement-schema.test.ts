import { requireTestDatabase } from "@/test/test-database";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
const connection = postgres(requireTestDatabase(process.env.DATABASE_URL).url, {
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
  // 0031 kept the invited developer seat as an invitation reviewer; 0044 (#211) retires invitation reviewers.
  expect(partly).toEqual([
    expect.objectContaining({ nominee: { kind: "member", userId: "seat_pm" }, decision: null }),
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
it("rejects more than twenty, a repeated person, a concern without a reason, an answer by someone else and an invitation", async () => {
  const invitation = { ...reviewer("x"), nominee: { kind: "invitation", invitationId: "inv_1", email: "x@example.test" } };
  for (const invalid of [
    Array.from({ length: 21 }, (_, i) => reviewer(`person_${i}`)),
    [reviewer("a"), reviewer("a")],
    [invitation],
    [reviewer("a", { kind: "concern", actorId: "a", at: "2026-10-21", reason: " " })],
    [reviewer("a", { kind: "looks_good", actorId: "b", at: "2026-10-21", reason: "" })],
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
it("resets answers when any content column of an Open Request changes, never for priority, naming the requester when no editor is set", async () => {
  const org = "org_review_reset";
  await connection`insert into organizations(id,name,slug) values (${org},'Review reset','review-reset')`;
  for (const id of ["reset_owner", "reset_a", "reset_b"])
    await connection`insert into profiles(id,full_name,email) values (${id},${id},${id + "@example.test"})`;
  const [project] = await connection`insert into projects(org_id,name,created_by) values (${org},'Checkout','reset_owner') returning id`;
  const [request] = await connection`insert into requests(org_id,title,description,created_by) values (${org},'Checkout problem','People cannot complete checkout','reset_owner') returning id`;
  const answered = [
    { ...reviewer("reset_a", { kind: "looks_good", actorId: "reset_a", at: "2026-10-21", reason: "" }), addedBy: "reset_owner" },
    { ...reviewer("reset_b"), addedBy: "reset_owner" },
  ];
  await connection`insert into request_agreements(request_id,org_id,reviewers) values (${request.id},${org},${connection.json(answered as never)})`;
  const state = async () => {
    const [row] = await connection`select r.agreement_revision, a.reviewers from requests r join request_agreements a on a.request_id=r.id where r.id=${request.id}`;
    return { revision: row.agreement_revision as number, decisions: (row.reviewers as { decision: unknown }[]).map((r) => r.decision) };
  };
  const answerAgain = () => connection`update request_agreements set reviewers=${connection.json(answered as never)} where request_id=${request.id}`;
  await connection`update requests set priority='urgent' where id=${request.id}`;
  expect(await state()).toEqual({ revision: 0, decisions: [expect.objectContaining({ kind: "looks_good" }), null] });
  const changes = [
    connection`update requests set title='Checkout problem again' where id=${request.id}`,
    connection`update requests set description='Changed description' where id=${request.id}`,
    connection`update requests set classification='problem' where id=${request.id}`,
    connection`update requests set reframed_problem='Reframed' where id=${request.id}`,
    connection`update requests set extracted_solution='A solution' where id=${request.id}`,
    connection`update requests set affected_people='Shoppers' where id=${request.id}`,
    connection`update requests set desired_change='Finish checkout' where id=${request.id}`,
    connection`update requests set observed_evidence='Drop-off' where id=${request.id}`,
    connection`update requests set uncertainty='Mobile' where id=${request.id}`,
    connection`update requests set useful_link='https://example.com' where id=${request.id}`,
    connection`update requests set request_type='improvement' where id=${request.id}`,
    connection`update requests set project_id=${project.id} where id=${request.id}`,
    connection`update requests set label_keys='{bug}' where id=${request.id}`,
    connection`update requests set expected_impact=${connection.json({ kind: "metric", metric: "Conversion", unit: "%", baseline: 1, target: 2, source: "", reviewAfterDays: 30 })} where id=${request.id}`,
  ];
  let revision = 0;
  for (const change of changes) {
    await change;
    revision += 1;
    expect(await state()).toEqual({ revision, decisions: [null, null] });
    await answerAgain();
  }
  const notified = await connection`select user_id, type::text, actor_id from notifications where request_id=${request.id}`;
  expect(notified).toHaveLength(changes.length);
  expect(new Set(notified.map((n) => `${n.user_id} ${n.type} ${n.actor_id}`))).toEqual(new Set(["reset_a review_reset reset_owner"]));
  await connection`update requests set status='in_progress' where id=${request.id}`;
  await connection`update requests set desired_change='After pickup' where id=${request.id}`;
  expect((await state()).decisions[0]).toEqual(expect.objectContaining({ kind: "looks_good" }));
});
it("rejects malformed exception closure at the database boundary", async () => {
  const [request] =
    await connection`select id from requests where org_id='org_test_a' limit 1`;
  await expect(
    connection`update requests set exception_closure='{}'::jsonb where id=${request.id}`,
  ).rejects.toThrow();
});
