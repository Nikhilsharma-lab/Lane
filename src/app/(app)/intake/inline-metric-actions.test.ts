import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { requireTestDatabase } from "@/test/test-database";
import { createTriageToken } from "@/lib/triage-token";

// #199: adding a metric inline from the prediction form. Seam: the prediction form's add action, called directly
// on the real database with Clerk's session faked; what it saved is read back through the Metrics library.
const ORG = "org_inline_metric";
const OTHER = "org_inline_metric_other";
const MEMBER = "user_inline_metric_member";
const session = vi.hoisted(() => ({ userId: "user_inline_metric_member", orgId: "org_inline_metric", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ ...session }) }));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: async () => ({ allowed: true }) }));

let sql: ReturnType<typeof postgres>;
const as = (orgRole: string) => { session.userId = MEMBER; session.orgId = ORG; session.orgRole = orgRole; };
const add = async (data: { name: string; unit: string }, orgId = ORG) => (await import("./metric-actions")).addPredictionMetric(data, { orgId });
const library = async () => import("@/lib/metrics-library");
const definitionsNamed = async (name: string) => sql`select id from metric_definitions where org_id=${ORG} and lower(name)=lower(${name})`;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 2, prepare: false });
  await sql`insert into organizations (id,name,slug) values (${ORG},'Inline metric','inline-metric'), (${OTHER},'Other','inline-metric-other')`;
  await sql`insert into profiles (id,full_name,email) values (${MEMBER},'Mira Member','inline-member@example.test')`;
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "inline-metric-test-secret".repeat(3));
});
beforeEach(() => as("org:member"));
afterAll(async () => {
  if (!sql) return;
  await sql`delete from organizations where id in (${ORG}, ${OTHER})`;
  await sql`delete from profiles where id=${MEMBER}`;
  await sql.end();
  vi.unstubAllEnvs();
});

describe("adding a metric inline", () => {
  it("adds the definition with its name and unit, ready to pick, and the Metrics page lists it with its history", async () => {
    const result = await add({ name: "  Checkout   completions ", unit: "count" });
    if (!("ok" in result)) throw new Error(result.error);
    expect(result).toEqual({ ok: true, existing: false, metric: { id: expect.any(String), name: "Checkout completions", unit: "count", link: null, howCounted: null, archived: false } });

    const { listMetricDefinitions, readMetricDefinitionHistory } = await library();
    expect((await listMetricDefinitions({ orgId: ORG })).map(definition => definition.id)).toContain(result.metric.id);
    expect(await readMetricDefinitionHistory({ orgId: ORG }, result.metric.id)).toEqual([expect.objectContaining({
      revision: 1, kind: "created", before: null, authorId: MEMBER, authorName: "Mira Member",
      after: expect.objectContaining({ name: "Checkout completions", unit: "count", link: null, howCounted: null }),
    })]);
  });

  it("offers the active definition that already has the name, whatever its case, spacing or unit, and adds nothing", async () => {
    const first = await add({ name: "Refund requests", unit: "count" });
    if (!("ok" in first)) throw new Error(first.error);
    const again = await add({ name: "refund   REQUESTS", unit: "percent" });
    expect(again).toEqual({ ok: true, existing: true, metric: first.metric });
    expect(await definitionsNamed("Refund requests")).toHaveLength(1);
    const { readMetricDefinitionHistory } = await library();
    expect(await readMetricDefinitionHistory({ orgId: ORG }, first.metric.id)).toHaveLength(1);
  });

  it("offers a starter metric by name, even in a workspace whose library hasn't been opened yet", async () => {
    session.orgId = OTHER; session.orgRole = "org:admin";
    const result = await add({ name: "conversion rate", unit: "count" }, OTHER);
    expect(result).toMatchObject({ ok: true, existing: true, metric: { name: "Conversion rate", unit: "percent", archived: false } });
    expect(await sql`select id from metric_definitions where org_id=${OTHER} and lower(name)='conversion rate'`).toHaveLength(1);
  });

  it("adds a new definition when the only one with that name is archived", async () => {
    const old = await add({ name: "Legacy exports", unit: "count" });
    if (!("ok" in old)) throw new Error(old.error);
    await sql`update metric_definitions set archived_at=now() where id=${old.metric.id}`;
    const result = await add({ name: "Legacy exports", unit: "count" });
    expect(result).toMatchObject({ ok: true, existing: false });
    expect("ok" in result && result.metric.id).not.toBe(old.metric.id);
  });

  it("asks only for a name and a unit: anything else sent is not saved", async () => {
    const result = await add({ name: "Saved carts", unit: "count", link: "https://example.test/carts", howCounted: "Carts saved." } as never);
    if (!("ok" in result)) throw new Error(result.error);
    expect(result.metric).toMatchObject({ link: null, howCounted: null });
  });

  it("says which field is missing", async () => {
    expect(await add({ name: "  ", unit: "count" })).toEqual({ error: "Check the highlighted fields.", fields: { name: "Give the metric a name." } });
    expect(await add({ name: "Exports", unit: "" })).toEqual({ error: "Check the highlighted fields.", fields: { unit: "Choose a unit." } });
  });
});

describe("who can add inline", () => {
  it("tells the prediction form that Members and Admins can add, and Guests can't", async () => {
    const { listPredictionMetrics } = await import("./metric-actions");
    const canAdd = async (orgRole: string) => { as(orgRole); return (await listPredictionMetrics({ impact: null }, { orgId: ORG }) as { canAddMetrics?: boolean }).canAddMetrics; };
    expect(await canAdd("org:admin")).toBe(true);
    expect(await canAdd("org:member")).toBe(true);
    expect(await canAdd("org:guest")).toBe(false);
  });

  it("refuses Guests and adds nothing", async () => {
    as("org:guest");
    expect(await add({ name: "Guest metric", unit: "count" })).toEqual({ error: "Guests can't add metrics to the Metrics library. Pick one that's there, or ask a Member to add it." });
    expect(await definitionsNamed("Guest metric")).toHaveLength(0);
  });

  it("refuses a workspace other than the session's", async () => {
    expect(await add({ name: "Elsewhere", unit: "count" }, OTHER)).toHaveProperty("error");
    expect(await sql`select id from metric_definitions where org_id=${OTHER} and name='Elsewhere'`).toHaveLength(0);
  });
});

describe("carrying on with the prediction", () => {
  it("saves a prediction that picks the definition just added", async () => {
    const added = await add({ name: "Trial starts", unit: "count" });
    if (!("ok" in added)) throw new Error(added.error);
    const { pickDefinition, createMeasurementPrimary, createEmptyMeasurementPlan } = await import("@/lib/request-measurement");
    const expectedImpact = { ...createEmptyMeasurementPlan(), primary: { ...pickDefinition(createMeasurementPrimary(), added.metric), current: 40, target: 60 } };
    const { saveRequest } = await import("./actions");
    const draft = { title: "Trials stall at the card step", description: "People stop when asked for a card.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", expectedImpact };
    const token = createTriageToken(draft as never, { classification: "problem", reframedProblem: null, extractedSolution: null }, { orgId: ORG, userId: MEMBER });
    const requestId = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).requestId as string;
    expect(await saveRequest({ token, editedProblemText: null }, { orgId: ORG })).toMatchObject({ success: true });
    const [saved] = await sql`select expected_impact from requests where id=${requestId}`;
    expect(saved.expected_impact.primary).toMatchObject({ key: "definition", definitionId: added.metric.id, name: "Trial starts", unit: "count", current: 40, target: 60 });
  });
});
