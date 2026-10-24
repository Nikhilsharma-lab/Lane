import { randomUUID } from "node:crypto";
import { requireTestDatabase } from "@/test/test-database";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTriageToken } from "@/lib/triage-token";
import { requestEditSnapshot } from "@/lib/request-edit";

const session = vi.hoisted(() => ({ userId: "history-creator", orgId: "org-history", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));

const ORG = "org-history";
const CREATOR = "history-creator";
const EDITOR = "history-admin";
const plan = (target: number) => ({
  kind: "measurement" as const, version: 2 as const,
  primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target, noBaseline: false, check: "" as const },
  measurement: { audience: "all" as const, platform: "web" as const, windowDays: 14 as const, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
});
const input = (target = 75) => ({
  title: "Delivery costs appear late", description: "Customers leave when delivery costs appear at payment.",
  affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
  projectId: null, requestType: "improvement" as const, priority: "high" as const,
  expectedImpact: structuredClone(plan(target)), reframedProblem: null as string | null, extractedSolution: null as string | null,
});
const classification = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };

let sql: ReturnType<typeof postgres>;
let id: string;

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  requireTestDatabase(process.env.DATABASE_URL);
  sql = postgres(url.toString(), { max: 2 });
  await sql`insert into organizations(id,name,slug) values (${ORG},'History','history-test')`;
  await sql`insert into profiles(id,full_name,email) values (${CREATOR},'Creator','history-creator@example.test'), (${EDITOR},'Admin','history-admin@example.test')`;
  vi.stubEnv("TRIAGE_TOKEN_SECRET", "history-test-secret".repeat(4));
});
beforeEach(async () => {
  session.userId = CREATOR; session.orgId = ORG; session.orgRole = "org:member";
  id = randomUUID();
  const x = input();
  await sql`insert into requests(id,org_id,title,description,created_by,request_type,priority,expected_impact) values (${id},${ORG},${x.title},${x.description},${CREATOR},'improvement','high',${sql.json(x.expectedImpact)})`;
});
afterAll(async () => {
  await sql`delete from organizations where id = ${ORG}`;
  await sql`delete from profiles where id in (${CREATOR}, ${EDITOR})`;
  await sql.end();
  vi.unstubAllEnvs();
});

const revisions = () => sql`select revision, expected_impact, author_id, recorded_as from request_expected_impact_revisions where request_id = ${id} order by revision`;
const save = async (changes: ReturnType<typeof input>, snapshot = requestEditSnapshot(input())) =>
  (await import("./edit-actions")).saveRequestEdits(id, { snapshot, changes }, { orgId: ORG });

it("records the first revision when a Request is created, with the person who created it", async () => {
  const x = input(75);
  const token = createTriageToken(x, classification, { orgId: ORG, userId: CREATOR });
  const { saveRequest } = await import("@/app/(app)/intake/actions");
  const result = await saveRequest({ token, editedProblemText: null }, { orgId: ORG });
  expect(result).toMatchObject({ success: true });
  const createdId = (result as { requestId: string }).requestId;
  const [first] = await sql`select revision, expected_impact, author_id, recorded_as from request_expected_impact_revisions where request_id = ${createdId} order by revision`;
  expect(first).toMatchObject({ revision: 1, author_id: CREATOR, recorded_as: "created", expected_impact: x.expectedImpact });
});

it("records a new revision with the editor and time when the Expected impact changes, and keeps the earlier one readable", async () => {
  session.userId = EDITOR; session.orgRole = "org:admin";
  expect(await save(input(80))).toMatchObject({ success: true });
  const rows = await revisions();
  expect(rows.map((row) => [row.revision, row.author_id, row.recorded_as, row.expected_impact.primary.target])).toEqual([
    [1, CREATOR, "created", 75],
    [2, EDITOR, "revised", 80],
  ]);
  const [current] = await sql`select expected_impact from requests where id = ${id}`;
  expect(current.expected_impact.primary.target).toBe(80);
});

it("writes no revision when the Request is edited without changing its Expected impact", async () => {
  const x = input(75);
  x.usefulLink = "https://example.com/research";
  expect(await save(x)).toMatchObject({ success: true });
  expect(await revisions()).toHaveLength(1);
});
