import postgres from "postgres";
import { requireTestDatabase } from "@/test/test-database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mergeMetricDefinitions } from "@/lib/metrics-library";
import { loadDefinitionUses } from "./impact";

// #203: a Metric definition's page lists every Request that used it, from the Impact read model. The Requests come
// from the database through the Metrics library, so a definition merged into this one brings its Requests along.
// Closed Requests can never be deleted, so the workspace and its rows stay until the next reset.
const ORG = "org_definition_uses";
const OTHER = "org_definition_uses_other";
const USER = "user_definition_uses";
const NOW = new Date("2026-10-23T12:00:00.000Z");
const member = { userId: USER, orgId: ORG, role: "member" as const };
let connection: ReturnType<typeof postgres>;

const measurement = { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" };
const metric = (definitionId: string, name: string, unit: string) => ({ key: "definition", definitionId, name, unit });
const v5 = (main: ReturnType<typeof metric>, guardrails: ReturnType<typeof metric>[] = []) => ({
  kind: "measurement", version: 5, measurement,
  primary: { ...main, current: 100, target: 150, noBaseline: false, check: "" },
  guardrails: guardrails.map(guardrail => ({ ...guardrail, current: 10, noBaseline: false, operator: "at_most", limit: 20 })),
});
const release = { exposureDate: "2026-08-10", audience: "All users", evidence: "Release note", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" };

let closures = 0;
type Plan = ReturnType<typeof v5>;
async function request(title: string, plan: Plan, options: { projectId?: string; actual?: number; guardrailActual?: number; org?: string } = {}) {
  const org = options.org ?? ORG;
  const closure = options.actual === undefined ? null : {
    version: 1, kind: "measured", actorId: USER, ownerId: USER, closedAt: "2026-09-10T09:00:00.000Z",
    operationId: `7a1d2c3b-0000-4000-8000-${String(++closures).padStart(12, "0")}`, fingerprint: "b".repeat(64),
    expected: plan, release, primary: { kind: "numeric", actual: options.actual, unit: "count" },
    guardrails: plan.guardrails.map(guardrail => ({ metric: guardrail.name, operator: guardrail.operator, limit: guardrail.limit, unit: "count", actual: options.guardrailActual ?? 0 })),
    evidence: `Export ${title}`, observedFrom: "2026-08-10", observedTo: "2026-09-09", revision: 1,
  };
  await connection`insert into requests (org_id,title,description,status,created_by,project_id,expected_impact,outcome_closure)
    values (${org},${title},'Fixture',${closure ? "done" : "open"},${USER},${options.projectId ?? null},${connection.json(plan as never)},${closure ? connection.json(closure as never) : null})`;
}
const definition = async (name: string, org = ORG) =>
  (await connection`insert into metric_definitions (org_id,name,unit,created_by) values (${org},${name},'count',${USER}) returning id`)[0].id as string;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  connection = postgres(url.toString(), { max: 1, prepare: false });
  for (const org of [ORG, OTHER]) await connection`insert into organizations (id,name,slug) values (${org},'Definition uses',${org.replaceAll("_", "-")})`;
  await connection`insert into profiles (id,full_name,email) values (${USER},'Uses','definition-uses@example.test')`;
});
afterAll(async () => {
  await connection?.end();
});

describe("Requests that used a Metric definition", () => {
  it("lists main-metric and guardrail uses by Project, including a definition merged into it, and nothing from another workspace", async () => {
    const kept = await definition("Trials started");
    const duplicate = await definition("Trial starts");
    const errors = await definition("Errors");
    const conversion = await definition("Orders");
    const elsewhere = await definition("Trials started", OTHER);
    const [growth] = await connection`insert into projects (org_id,name,created_by) values (${ORG},'Growth',${USER}) returning id`;

    await request("Kept", v5(metric(kept, "Trials started", "count")), { projectId: growth.id, actual: 130 });
    await request("Duplicate", v5(metric(duplicate, "Trial starts", "count")), { actual: 140 });
    await request("Guarded", v5(metric(conversion, "Orders", "count"), [metric(kept, "Trials started", "count")]), { projectId: growth.id, actual: 50, guardrailActual: 25 });
    await request("Waiting", v5(metric(kept, "Trials started", "count"), [metric(errors, "Errors", "count")]));
    await request("Other workspace", v5(metric(elsewhere, "Trials started", "count")), { org: OTHER, actual: 120 });
    const merging = await mergeMetricDefinitions({ orgId: ORG }, USER, { keptId: kept, mergedId: duplicate });
    expect(merging).toEqual({ changed: true });

    const uses = (await loadDefinitionUses(member, kept, { now: NOW }))!;
    expect(uses.main.map(group => [group.name, group.uses.map(use => [use.title, use.outcome.kind])])).toEqual([
      ["Growth", [["Kept", "measured"]]],
      ["No Project", [["Duplicate", "measured"], ["Waiting", "still_due"]]],
    ]);
    expect(uses.main[1].uses[0].predicted.metric).toBe("Trials started");
    expect(uses.guardrails.map(group => [group.name, group.uses.map(use => [use.title, use.mainMetric, use.outcome])])).toEqual([
      ["Growth", [["Guarded", "Orders", { kind: "measured", actual: 25, held: false }]]],
    ]);
    expect((await loadDefinitionUses(member, errors, { now: NOW }))!.guardrails.flatMap(group => group.uses.map(use => use.title))).toEqual(["Waiting"]);
    expect(await loadDefinitionUses(member, elsewhere, { now: NOW })).toEqual({ definitionId: elsewhere, main: [], guardrails: [] });
  });

  it("gives a guest nothing", async () => {
    expect(await loadDefinitionUses({ ...member, role: "guest" }, "00000000-0000-4000-8000-000000000000", { now: NOW })).toBeNull();
  });
});
