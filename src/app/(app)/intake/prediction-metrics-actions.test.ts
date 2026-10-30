import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";
import { createTriageToken } from "@/lib/triage-token";
import { requestEditSnapshot } from "@/lib/request-edit";

// #198: predictions and guardrails pick Metric definitions. Seam: the Intake and edit actions, the picker's
// read action and the library's edit action, called directly on the real database with Clerk's session faked.
const ORG = "org_prediction_metrics";
const OTHER = "org_prediction_metrics_other";
const OWNER = "user_prediction_owner";
const ADMIN = "user_prediction_admin";
const session = vi.hoisted(() => ({ userId: "user_prediction_owner", orgId: "org_prediction_metrics", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ ...session }) }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/ai/triage", () => ({ triageRequest: async () => ({ ok: true, triage: { classification: "problem", reframedProblem: null, extractedSolution: null } }) }));

let sql: ReturnType<typeof postgres>;
let signups: string, errors: string, retired: string, foreign: string;
const triage = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };

const metric = (id: string, name: string, unit: string) => ({ key: "definition" as const, definitionId: id, name, unit });
function plan(over: Record<string, unknown> = {}) {
  return {
    kind: "measurement" as const, version: 5 as const,
    primary: { ...metric(signups, "Signups", "count"), current: 120, target: 150, noBaseline: false, check: "" as const },
    measurement: { audience: "all" as const, platform: "all" as const, windowDays: 30 as const, exactDates: false, startDate: "", endDate: "" },
    guardrails: [{ ...metric(errors, "User error rate (app)", "percent"), current: 2, noBaseline: false as const, operator: "at_most" as const, limit: 3 }],
    ...over,
  };
}
const draft = (expectedImpact: unknown) => ({ title: "Signups drop at the plan step", description: "People leave signup when they reach the plan step.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", expectedImpact });
const as = (userId: string, orgRole = "org:member") => { session.userId = userId; session.orgId = ORG; session.orgRole = orgRole; };

async function create(expectedImpact: unknown) {
  const { saveRequest } = await import("./actions");
  const token = createTriageToken(draft(expectedImpact) as never, triage, { orgId: ORG, userId: session.userId });
  const requestId = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).requestId as string;
  return { result: await saveRequest({ token, editedProblemText: null }, { orgId: ORG }), requestId };
}
const savedImpact = async (id: string) => (await sql`select expected_impact from requests where id=${id}`)[0]?.expected_impact;
async function addDefinition(name: string, unit: string, org = ORG) {
  return (await sql`insert into metric_definitions (org_id,name,unit,created_by,link,how_counted) values (${org},${name},${unit},${OWNER},${"https://analytics.example.test/" + encodeURIComponent(name)},${"How " + name + " is counted."}) returning id`)[0].id as string;
}
async function edit(requestId: string, expectedImpact: unknown) {
  const [stored] = await sql`select title, description, affected_people, desired_change, observed_evidence, uncertainty, useful_link, project_id, request_type, priority, label_keys, reframed_problem, extracted_solution, expected_impact, no_measurable_impact_reason, measurement_draft from requests where id=${requestId}`;
  const current = { title: stored.title, description: stored.description, affectedPeople: stored.affected_people ?? "", desiredChange: stored.desired_change ?? "", observedEvidence: stored.observed_evidence ?? "", uncertainty: stored.uncertainty ?? "", usefulLink: stored.useful_link ?? "", projectId: stored.project_id, requestType: stored.request_type, priority: stored.priority, labelKeys: stored.label_keys, reframedProblem: stored.reframed_problem, extractedSolution: stored.extracted_solution, expectedImpact: stored.expected_impact, noMeasurableImpactReason: stored.no_measurable_impact_reason, measurementDraft: stored.measurement_draft };
  const { saveRequestEdits } = await import("../requests/[id]/edit-actions");
  return saveRequestEdits(requestId, { snapshot: requestEditSnapshot(current as never), changes: { ...current, expectedImpact } }, { orgId: ORG });
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 2, prepare: false });
  await sql`insert into organizations (id,name,slug) values (${ORG},'Prediction metrics','prediction-metrics'), (${OTHER},'Other','prediction-metrics-other')`;
  await sql`insert into profiles (id,full_name,email) values (${OWNER},'Owner','prediction-owner@example.test'), (${ADMIN},'Admin','prediction-admin@example.test')`;
  signups = await addDefinition("Signups", "count");
  errors = await addDefinition("User error rate (app)", "percent");
  retired = await addDefinition("Retired metric", "count");
  await sql`update metric_definitions set archived_at=now() where id=${retired}`;
  foreign = await addDefinition("Signups", "count", OTHER);
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "prediction-metrics-test-secret".repeat(3));
});
beforeEach(() => as(OWNER));
afterAll(async () => {
  if (!sql) return;
  await sql`delete from organizations where id in (${ORG}, ${OTHER})`;
  await sql`delete from profiles where id in (${OWNER}, ${ADMIN})`;
  await sql.end();
  vi.unstubAllEnvs();
});

describe("the picker's library", () => {
  it("offers the workspace's active definitions with unit, link and how it's counted", async () => {
    const { listPredictionMetrics } = await import("./metric-actions");
    const result = await listPredictionMetrics({ impact: null }, { orgId: ORG });
    if (!("metrics" in result)) throw new Error(result.error);
    const offered = result.metrics.map(choice => choice.id);
    expect(offered).toContain(signups);
    expect(offered).not.toContain(retired);
    expect(offered).not.toContain(foreign);
    expect(result.metrics.find(choice => choice.id === signups)).toEqual({
      id: signups, name: "Signups", unit: "count", link: "https://analytics.example.test/Signups", howCounted: "How Signups is counted.", archived: false,
    });
    // The starter metrics are part of every library.
    expect(result.metrics.map(choice => choice.name)).toContain("Conversion rate");
  });

  it("keeps an archived definition the Request already uses, marked archived, and resolves older plans by position", async () => {
    const { listPredictionMetrics } = await import("./metric-actions");
    const saved = plan({ guardrails: [{ ...plan().guardrails[0], ...metric(retired, "Retired metric", "count") }] });
    const result = await listPredictionMetrics({ impact: saved }, { orgId: ORG });
    if (!("metrics" in result)) throw new Error(result.error);
    expect(result.metrics.find(choice => choice.id === retired)).toMatchObject({ archived: true });
    expect(result.saved.map(choice => choice?.id)).toEqual([signups, retired]);
    const v4 = { ...plan(), version: 4, primary: { key: "conversion", name: "", unit: "percent", current: 1, target: 2, noBaseline: false, check: "" }, guardrails: [] };
    const older = await listPredictionMetrics({ impact: v4 }, { orgId: ORG });
    if (!("metrics" in older)) throw new Error(older.error);
    expect(older.saved[0]).toMatchObject({ name: "Conversion rate", unit: "percent", archived: false });
  });

  it("is refused outside the session's workspace", async () => {
    const { listPredictionMetrics } = await import("./metric-actions");
    expect(await listPredictionMetrics({ impact: null }, { orgId: OTHER })).toHaveProperty("error");
  });
});

describe("saving a prediction", () => {
  it("saves the main metric and guardrails with their definition and a copy of its name and unit", async () => {
    const { result, requestId } = await create(plan());
    expect(result).toMatchObject({ success: true });
    expect(await savedImpact(requestId)).toEqual(plan());
  });

  it("copies the library's name, not whatever name the form sent", async () => {
    const { requestId } = await create(plan({ primary: { ...plan().primary, name: "Something else" } }));
    expect((await savedImpact(requestId)).primary.name).toBe("Signups");
  });

  it("refuses a definition from another workspace", async () => {
    const { result, requestId } = await create(plan({ primary: { ...plan().primary, definitionId: foreign } }));
    expect(result).toMatchObject({ success: false, error: { field: "expectedImpact" } });
    expect(await savedImpact(requestId)).toBeUndefined();
  });

  it("refuses an archived definition for a new pick", async () => {
    const { result } = await create(plan({ guardrails: [{ ...plan().guardrails[0], ...metric(retired, "Retired metric", "count") }] }));
    expect(result).toMatchObject({ success: false, error: { field: "expectedImpact", message: expect.stringContaining("Retired metric") } });
  });

  it("refuses a definition picked in another unit", async () => {
    const { result } = await create(plan({ primary: { ...plan().primary, unit: "percent", current: 12, target: 15 } }));
    expect(result).toMatchObject({ success: false, error: { field: "expectedImpact" } });
  });

  it("refuses a typed metric", async () => {
    const typed = { ...plan(), version: 4, primary: { key: "custom", name: "Signups", unit: "count", current: 1, target: 2, noBaseline: false, check: "" }, guardrails: [] };
    const { result } = await create(typed);
    expect(result).toMatchObject({ success: false });
  });

  it("checks the definitions in the review step before any review is spent", async () => {
    const { runTriage } = await import("./actions");
    const refused = await runTriage(draft(plan({ primary: { ...plan().primary, definitionId: foreign } })) as never, { orgId: ORG });
    expect(refused).toMatchObject({ success: false, error: { code: "validation", field: "expectedImpact" } });
    expect(await runTriage(draft(plan()) as never, { orgId: ORG })).toMatchObject({ success: true });
  });
});

describe("editing a prediction", () => {
  it("keeps an archived definition already saved on the Request when other fields change", async () => {
    const kept = await addDefinition("Soon archived", "count");
    const saved = plan({ guardrails: [{ ...plan().guardrails[0], ...metric(kept, "Soon archived", "count"), limit: 5 }] });
    const { requestId } = await create(saved);
    await sql`update metric_definitions set archived_at=now() where id=${kept}`;
    const changed = { ...saved, primary: { ...saved.primary, target: 170 } };
    expect(await edit(requestId, changed)).toEqual({ success: true });
    expect(await savedImpact(requestId)).toEqual(changed);
    // ...but it can't be newly picked into another slot of that Request.
    const another = { ...changed, guardrails: [...changed.guardrails, { ...plan().guardrails[0], ...metric(retired, "Retired metric", "count"), limit: 1 }] };
    expect(await edit(requestId, another)).toHaveProperty("error");
  });

  it("refuses a definition from another workspace", async () => {
    const { requestId } = await create(plan());
    expect(await edit(requestId, plan({ primary: { ...plan().primary, definitionId: foreign } }))).toHaveProperty("error");
    expect(await savedImpact(requestId)).toEqual(plan());
  });

  it("keeps the name copied at prediction time after a rename, while the Request page shows the new name", async () => {
    const renamed = await addDefinition("Trial starts", "count");
    const saved = plan({ primary: { ...plan().primary, ...metric(renamed, "Trial starts", "count") } });
    const { requestId } = await create(saved);
    as(ADMIN, "org:admin");
    const { editMetricDefinition } = await import("../settings/metrics/actions");
    expect(await editMetricDefinition({ id: renamed, name: "Trials started", unit: "count", link: "", howCounted: "" }, { orgId: ORG })).toEqual({ ok: true });
    // History: the saved plan (and its Expected impact revision) still says "Trial starts".
    expect((await savedImpact(requestId)).primary.name).toBe("Trial starts");
    const [revision] = await sql`select expected_impact from request_expected_impact_revisions where request_id=${requestId} order by revision desc limit 1`;
    expect(revision.expected_impact.primary.name).toBe("Trial starts");
    // The Request page: the definition's current name.
    as(OWNER);
    const { loadRequestDetail } = await import("@/lib/data/requests");
    const detail = await loadRequestDetail({ userId: OWNER, orgId: ORG, role: "member" }, requestId);
    expect(detail?.request.metricNames).toMatchObject({ [renamed]: "Trials started" });
  });
});

describe("a definition's unit", () => {
  it("can change while no Request uses it, and is locked once one does", async () => {
    const { editMetricDefinition } = await import("../settings/metrics/actions");
    const unused = await addDefinition("Unused yet", "count");
    expect(await editMetricDefinition({ id: unused, name: "Unused yet", unit: "percent", link: "", howCounted: "" }, { orgId: ORG })).toEqual({ ok: true });
    const used = await addDefinition("Used now", "count");
    await create(plan({ guardrails: [{ ...plan().guardrails[0], ...metric(used, "Used now", "count"), limit: 5 }] }));
    expect(await editMetricDefinition({ id: used, name: "Used now", unit: "percent", link: "", howCounted: "" }, { orgId: ORG }))
      .toMatchObject({ error: expect.stringContaining("unit"), fields: { unit: expect.any(String) } });
    // Other fields stay editable.
    expect(await editMetricDefinition({ id: used, name: "Used now", unit: "count", link: "", howCounted: "Counted daily." }, { orgId: ORG })).toEqual({ ok: true });
  });

  it("is locked when older Requests use it through the built-in metric", async () => {
    const { result } = await create({ ...plan(), version: 4, primary: { key: "events", name: "", unit: "count", current: 1, target: 2, noBaseline: false, check: "" }, guardrails: [] });
    expect(result).toMatchObject({ success: true });
    const [starter] = await sql`select id, name from metric_definitions where org_id=${ORG} and starter_key='events'`;
    const { editMetricDefinition } = await import("../settings/metrics/actions");
    expect(await editMetricDefinition({ id: starter.id, name: starter.name, unit: "percent", link: "", howCounted: "" }, { orgId: ORG })).toHaveProperty("error");
  });
});
