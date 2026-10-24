import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "@/test/test-database";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTriageToken } from "@/lib/triage-token";
import { requestEditSnapshot } from "@/lib/request-edit";

const session = vi.hoisted(() => ({ userId: "nmi-creator", orgId: "org-nmi", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG = "org-nmi";
const CREATOR = "nmi-creator";
const REASON = "Design-system token rename with no user-facing change";
const plan = {
  kind: "measurement" as const, version: 2 as const,
  primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 75, noBaseline: false, check: "" as const },
  measurement: { audience: "all" as const, platform: "web" as const, windowDays: 14 as const, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};
const base = {
  title: "Rename design tokens", description: "Engineers rename the shared colour tokens without changing the product.",
  affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
  projectId: null, requestType: "improvement" as const, priority: "high" as const,
  reframedProblem: null as string | null, extractedSolution: null as string | null,
};
const withPlan = () => ({ ...base, expectedImpact: structuredClone(plan) as typeof plan | null });
const withChoice = (reason: string) => ({ ...base, expectedImpact: { kind: "no_measurable_impact" as const, reason } as never });
const classification = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };

let sql: ReturnType<typeof postgres>;
let id: string;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 2 });
  await sql`insert into organizations(id,name,slug) values (${ORG},'No measurable impact','nmi-test')`;
  await sql`insert into profiles(id,full_name,email) values (${CREATOR},'Creator','nmi-creator@example.test')`;
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "nmi-test-secret".repeat(4));
});
beforeEach(async () => {
  session.userId = CREATOR; session.orgId = ORG; session.orgRole = "org:member";
  id = randomUUID();
  const x = withPlan();
  await sql`insert into requests(id,org_id,title,description,created_by,request_type,priority,expected_impact) values (${id},${ORG},${x.title},${x.description},${CREATOR},'improvement','high',${sql.json(plan)})`;
});
afterAll(async () => {
  await sql`delete from organizations where id = ${ORG}`;
  await sql`delete from profiles where id = ${CREATOR}`;
  await sql.end();
  vi.unstubAllEnvs();
});

const stored = () => sql`select expected_impact, no_measurable_impact_reason from requests where id = ${id}`;
const revisions = () => sql`select revision, expected_impact, no_measurable_impact_reason, author_id, recorded_as from request_expected_impact_revisions where request_id = ${id} order by revision`;
const save = async (changes: object, snapshot: string) =>
  (await import("./edit-actions")).saveRequestEdits(id, { snapshot, changes }, { orgId: ORG });
// The form's snapshot of the Request as stored: a plan, or the choice with its reason.
const planState = () => requestEditSnapshot({ ...base, expectedImpact: structuredClone(plan) });
const choiceState = (reason: string) => requestEditSnapshot({ ...base, expectedImpact: null, noMeasurableImpactReason: reason });

it("saves the choice with its reason, clears the measured plan, and records a revision by the editor", async () => {
  expect(await save(withChoice(REASON), planState())).toMatchObject({ success: true });
  const [row] = await stored();
  expect(row).toMatchObject({ expected_impact: null, no_measurable_impact_reason: REASON });
  const rows = await revisions();
  expect(rows.map((item) => [item.revision, item.expected_impact === null, item.no_measurable_impact_reason, item.recorded_as])).toEqual([
    [1, false, null, "created"],
    [2, true, REASON, "revised"],
  ]);
});

it.each(["", "   "])("refuses a choice without a reason (%j) and keeps the saved plan", async (blank) => {
  expect(await save(withChoice(blank), planState())).toHaveProperty("error");
  const [row] = await stored();
  expect(row).toMatchObject({ no_measurable_impact_reason: null });
  expect(row.expected_impact).toEqual(plan);
  expect(await revisions()).toHaveLength(1);
});

it("switches back to a measured result: the reason is cleared, the plan is saved and recorded", async () => {
  expect(await save(withChoice(REASON), planState())).toMatchObject({ success: true });
  const changed = { ...withPlan(), expectedImpact: { ...plan, primary: { ...plan.primary, target: 80 } } };
  expect(await save(changed, choiceState(REASON))).toMatchObject({ success: true });
  const [row] = await stored();
  expect(row.no_measurable_impact_reason).toBeNull();
  expect(row.expected_impact.primary.target).toBe(80);
  const rows = await revisions();
  expect(rows.map((item) => [item.revision, item.recorded_as, item.no_measurable_impact_reason])).toEqual([
    [1, "created", null],
    [2, "revised", REASON],
    [3, "revised", null],
  ]);
});

it("keeps the choice and writes no revision when the choice is resubmitted unchanged", async () => {
  expect(await save(withChoice(REASON), planState())).toMatchObject({ success: true });
  expect(await save(withChoice(REASON), choiceState(REASON))).toMatchObject({ success: true });
  const [row] = await stored();
  expect(row.no_measurable_impact_reason).toBe(REASON);
  expect(await revisions()).toHaveLength(2);
});

it("a null impact never clears a stored choice", async () => {
  expect(await save(withChoice(REASON), planState())).toMatchObject({ success: true });
  expect(await save({ ...base, expectedImpact: null }, choiceState(REASON))).toHaveProperty("error");
  const [row] = await stored();
  expect(row.no_measurable_impact_reason).toBe(REASON);
});

it("creates a Request with the choice and records its reason as the first revision", async () => {
  const x = withChoice(REASON);
  const token = createTriageToken(x as never, classification, { orgId: ORG, userId: CREATOR });
  const { saveRequest } = await import("@/app/(app)/intake/actions");
  const result = await saveRequest({ token, editedProblemText: null }, { orgId: ORG });
  expect(result).toMatchObject({ success: true });
  const createdId = (result as { requestId: string }).requestId;
  const [row] = await sql`select expected_impact, no_measurable_impact_reason from requests where id = ${createdId}`;
  expect(row).toMatchObject({ expected_impact: null, no_measurable_impact_reason: REASON });
  const [first] = await sql`select revision, expected_impact, no_measurable_impact_reason, author_id, recorded_as from request_expected_impact_revisions where request_id = ${createdId}`;
  expect(first).toMatchObject({ revision: 1, expected_impact: null, no_measurable_impact_reason: REASON, author_id: CREATOR, recorded_as: "created" });
});
