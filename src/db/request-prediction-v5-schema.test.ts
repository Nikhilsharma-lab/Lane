import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// #198: saved predictions v5 name a Metric definition (with a copy of its name and unit) for the main
// metric and each guardrail. Older versions stay valid; references must belong to the Request's workspace.
const ORG = "org_prediction_v5_schema";
const OTHER = "org_prediction_v5_other";
const USER = "user_prediction_v5_schema";
let connection: ReturnType<typeof postgres>;
let signups: string, errors: string, archived: string, foreign: string;

const metric = (id: string, name: string, unit: string) => ({ key: "definition", definitionId: id, name, unit });
const plan = (over: Record<string, unknown> = {}) => ({
  kind: "measurement", version: 5,
  primary: { ...metric(signups, "Signups", "count"), current: 120, target: 150, noBaseline: false, check: "" },
  measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [{ ...metric(errors, "User error rate", "percent"), current: 2, noBaseline: false, operator: "at_most", limit: 3 }],
  ...over,
});
const check = { key: "check", definitionId: null, name: "", unit: "", current: null, target: null, noBaseline: false, check: "keyboard" };

async function insert(snapshot: unknown, org = ORG) {
  const [row] = await connection`insert into requests (org_id,title,description,created_by,expected_impact)
    values (${org},'Prediction','v5 contract',${USER},${connection.json(snapshot as Parameters<typeof connection.json>[0])}::jsonb) returning id, expected_impact`;
  return row;
}
const valid = async (snapshot: unknown) => (await connection`select public.request_measurement_valid(${connection.json(snapshot as Parameters<typeof connection.json>[0])}, null) as ok`)[0].ok;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url.toString(), { max: 1, prepare: false });
  await connection`insert into organizations (id,name,slug) values (${ORG},'Prediction','prediction-v5'), (${OTHER},'Other','prediction-v5-other')`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Prediction','prediction-v5@example.test')`;
  const add = async (org: string, name: string, unit: string, archivedAt: string | null = null) =>
    (await connection`insert into metric_definitions (org_id,name,unit,created_by,archived_at) values (${org},${name},${unit},${USER},${archivedAt}) returning id`)[0].id as string;
  signups = await add(ORG, "Signups", "count");
  errors = await add(ORG, "User error rate (v5)", "percent");
  archived = await add(ORG, "Old metric", "count", new Date().toISOString());
  foreign = await add(OTHER, "Signups", "count");
});
afterAll(async () => {
  if (!connection) return;
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`;
  await connection`delete from profiles where id=${USER}`;
  await connection.end();
});

describe("prediction v5 validator", () => {
  it("accepts a plan whose main metric and guardrails name definitions, and round-trips it", async () => {
    const row = await insert(plan());
    expect(row.expected_impact).toEqual(plan());
    expect(await valid({ ...plan(), primary: check })).toBe(true);
  });

  it.each([
    ["a built-in key", { primary: { ...plan().primary, key: "conversion" } }],
    ["a typed custom metric", { primary: { ...plan().primary, key: "custom" } }],
    ["a missing reference", { primary: { ...plan().primary, definitionId: null } }],
    ["a reference that isn't an id", { primary: { ...plan().primary, definitionId: "signups" } }],
    ["a blank name copy", { primary: { ...plan().primary, name: "  " } }],
    ["a long name copy", { primary: { ...plan().primary, name: "x".repeat(121) } }],
    ["an unknown unit", { primary: { ...plan().primary, unit: "users" } }],
    ["a fractional count", { primary: { ...plan().primary, current: 1.5 } }],
    ["a pass/fail check guardrail", { guardrails: [{ ...check, operator: "at_most", limit: 1 }] }],
    ["a pass/fail check with a definition", { primary: { ...check, definitionId: "00000000-0000-4000-8000-000000000000" } }],
    ["a percentage over 100", { guardrails: [{ ...plan().guardrails[0], limit: 101 }] }],
  ])("rejects %s", async (_case, over) => {
    expect(await valid(plan(over))).toBe(false);
    await expect(insert(plan(over))).rejects.toMatchObject({ code: "23514" });
  });

  it("keeps older versions valid", async () => {
    const v4 = { ...plan(), version: 4, primary: { key: "conversion", name: "", unit: "percent", current: 10, target: 12, noBaseline: false, check: "" }, guardrails: [{ key: "custom", name: "Orders", unit: "count", current: null, noBaseline: false, operator: "at_least", limit: 100 }] };
    expect(await valid(v4)).toBe(true);
    expect(await valid({ ...v4, version: 2, guardrails: [] })).toBe(true);
    expect(await valid({ ...v4, primary: { ...v4.primary, key: "definition", definitionId: signups } })).toBe(false);
  });
});

describe("prediction references", () => {
  it("refuses a definition from another workspace", async () => {
    await expect(insert(plan({ primary: { ...plan().primary, definitionId: foreign } }))).rejects.toMatchObject({ code: "23514" });
  });

  it("refuses an archived definition on a new prediction, but keeps one already saved on the Request", async () => {
    const old = metric(archived, "Old metric", "count");
    await expect(insert(plan({ guardrails: [{ ...plan().guardrails[0], ...old }] }))).rejects.toMatchObject({ code: "23514" });
    const row = await insert(plan());
    // Saved while active, then archived: edits to other fields keep it.
    const [definition] = await connection`insert into metric_definitions (org_id,name,unit,created_by) values (${ORG},'Soon archived','count',${USER}) returning id`;
    const kept = { ...plan().guardrails[0], ...metric(definition.id, "Soon archived", "count"), limit: 5 };
    await connection`update requests set expected_impact=${connection.json(plan({ guardrails: [kept] }))} where id=${row.id}`;
    await connection`update metric_definitions set archived_at=now() where id=${definition.id}`;
    await connection`update requests set expected_impact=${connection.json(plan({ guardrails: [{ ...kept, limit: 6 }] }))} where id=${row.id}`;
    await expect(connection`update requests set expected_impact=${connection.json(plan({ guardrails: [kept, { ...plan().guardrails[0], ...old, limit: 1 }] }))} where id=${row.id}`)
      .rejects.toMatchObject({ code: "23514" });
  });
});
