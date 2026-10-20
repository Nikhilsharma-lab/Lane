import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createTriageToken } from "@/lib/triage-token";
import { requestEditSnapshot } from "@/lib/request-edit";
const session = vi.hoisted(() => ({ userId: "edit-owner", orgId: "org-edit", orgRole: "org:member" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));
let sql: ReturnType<typeof postgres>, id: string;
const plan = { kind: "measurement" as const, version: 2 as const, primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 75, noBaseline: false, check: "" as const }, measurement: { audience: "all" as const, platform: "web" as const, windowDays: 14 as const, exactDates: false, startDate: "", endDate: "" }, guardrails: [{ key: "support" as const, name: "", unit: "percent" as const, current: 4, noBaseline: false as const, operator: "at_most" as const, limit: 6 }] };
const input = () => ({ title: "Delivery costs appear late", description: "Customers leave when delivery costs appear at payment.", affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "", projectId: null, requestType: "improvement" as const, priority: "high" as const, expectedImpact: structuredClone(plan), reframedProblem: null, extractedSolution: null });
const base = () => requestEditSnapshot(input());
const save = async (changes: ReturnType<typeof input>, token?: string, snapshot = base()) => (await import("./edit-actions")).saveRequestEdits(id, { snapshot, changes, token }, { orgId: "org-edit" });
beforeAll(async () => {
    const u = new URL(process.env.DATABASE_URL!);
    if (u.pathname !== "/lane_test" || !["localhost", "127.0.0.1"].includes(u.hostname))
        throw Error("Local test DB only");
    sql = postgres(u.toString(), { max: 2 });
    await sql `insert into organizations(id,name,slug) values ('org-edit','Edit','edit-test')`;
    await sql `insert into profiles(id,full_name,email) values ('edit-owner','Owner','edit@example.test')`;
    vi.stubEnv("TRIAGE_TOKEN_SECRET", "edit-test-secret".repeat(4));
});
beforeEach(async () => { session.userId = "edit-owner"; session.orgId = "org-edit"; session.orgRole = "org:member"; id = randomUUID(); await sql `insert into requests(id,org_id,title,description,created_by,request_type,priority,expected_impact) values (${id},'org-edit',${input().title},${input().description},'edit-owner','improvement','high',${sql.json(plan)})`; });
afterAll(async () => { await sql `delete from organizations where id='org-edit'`; await sql `delete from profiles where id='edit-owner'`; await sql.end(); vi.unstubAllEnvs(); });
it("saves guardrail definitions, target and supporting context without AI review", async () => { const x = input(); x.expectedImpact.guardrails[0].limit = 8; x.expectedImpact.primary.target = 80; x.usefulLink = "https://example.com/research"; expect(await save(x)).toMatchObject({ success: true }); const [row] = await sql `select expected_impact,useful_link,status::text from requests where id=${id}`; expect(row).toMatchObject({ expected_impact: x.expectedImpact, useful_link: x.usefulLink, status: "open" }); });
it.each(["other-user", "other-workspace", "in_progress", "done"])("rejects %s edits", async (kind) => { if (kind === "other-user")
    session.userId = "someone-else";
else if (kind === "other-workspace")
    session.orgId = "other-org";
else
    await sql `update requests set status=${kind}::request_status where id=${id}`; expect(await save(input())).toHaveProperty("error"); });
it("requires a matching signed review when source content changes", async () => { const x = input(); x.title = "Customers leave checkout early"; expect(await save(x)).toHaveProperty("error"); const token = createTriageToken(x, { classification: "problem", reframedProblem: null, extractedSolution: null }, { orgId: "org-edit", userId: "edit-owner" }); expect(await save(x, token)).toMatchObject({ success: true }); });
it("rejects a review for different content", async () => { const x = input(); x.title = "Changed title without review"; const token = createTriageToken(input(), { classification: "problem", reframedProblem: null, extractedSolution: null }, { orgId: "org-edit", userId: "edit-owner" }); expect(await save(x, token)).toHaveProperty("error"); });
it("rejects stale edits instead of overwriting another save", async () => { const x = input(); x.expectedImpact.guardrails[0].limit = 9; expect(await save(x)).toMatchObject({ success: true }); expect(await save(input())).toHaveProperty("error"); });
it("rejects invalid guardrail values", async () => { const x = input(); x.expectedImpact.guardrails[0].limit = 101; expect(await save(x)).toHaveProperty("error"); });
it("preserves the Request-type constraint for no baseline", async () => {
    const x = input();
    x.expectedImpact.primary.noBaseline = true;
    expect(await save(x)).toHaveProperty("error");
});
it("requires confirmed framing for a hybrid review", async () => {
    const x = input();
    x.title = "Make delivery costs visible earlier";
    const token = createTriageToken(x, { classification: "hybrid", reframedProblem: "Customers abandon checkout after unexpected delivery costs.", extractedSolution: "Display delivery costs earlier." }, { orgId: "org-edit", userId: "edit-owner" });
    expect(await save(x, token)).toHaveProperty("error");
});
it.each([
    { kind: "metric", metric: "Revenue per visit", baseline: null, target: 12.5, unit: "USD / visit", source: "Saved report", reviewAfterDays: 45, guardrail: { metric: "Refund cost", operator: "at_most", limit: 3.5, unit: "USD" } },
    { kind: "verification", result: "Customers can recover their saved basket.", source: "Customer session", reviewAfterDays: 21 },
])("preserves older $kind measurements on save", async (expectedImpact) => {
    await sql`update requests set expected_impact=${sql.json(expectedImpact)} where id=${id}`;
    const changes = { ...input(), expectedImpact };
    const { requestEditSchema } = await import("@/lib/request-edit");
    const parsed = requestEditSchema.parse(changes);
    const result = await (await import("./edit-actions")).saveRequestEdits(id, { snapshot: requestEditSnapshot(parsed), changes: parsed }, { orgId: "org-edit" });
    expect(result).toMatchObject({ success: true });
    const [saved] = await sql`select expected_impact from requests where id=${id}`;
    expect(saved.expected_impact).toEqual(expectedImpact);
});
it("saves and reloads the complete editor fields on an older Request", async () => {
    const original = { kind: "metric" as const, metric: "Revenue per visit", baseline: 0, target: 12.5, unit: "USD / visit", source: "Saved report", reviewAfterDays: 45,
        guardrail: { metric: "Refund cost", operator: "at_most" as const, limit: 3.5, unit: "USD" } };
    await sql`update requests set expected_impact=${sql.json(original)} where id=${id}`;
    const { measurementEditorValue, measurementEditorChanges } = await import("@/lib/request-measurement-editor");
    const { requestEditSchema } = await import("@/lib/request-edit");
    const editor = measurementEditorValue(original);
    editor.measurement = { ...editor.measurement, audience: "custom", audienceName: "Returning buyers", platform: "web", exactDates: true, startDate: "2026-10-01", endDate: "2026-10-15" };
    editor.guardrails[0].current = 2;
    editor.guardrails.push({ ...editor.guardrails[0], name: "Additional guardrail", limit: 5 });
    const changes = requestEditSchema.parse({ ...input(), expectedImpact: measurementEditorChanges(editor, original) });
    const result = await (await import("./edit-actions")).saveRequestEdits(id, { snapshot: requestEditSnapshot({ ...input(), expectedImpact: original }), changes }, { orgId: "org-edit" });
    expect(result).toMatchObject({ success: true });
    const [row] = await sql`select expected_impact from requests where id=${id}`;
    expect(row.expected_impact).toMatchObject(original);
    expect(measurementEditorValue(row.expected_impact)).toEqual(editor);
    expect(requestEditSchema.safeParse({ ...changes, expectedImpact: { ...row.expected_impact, measurement: { ...row.expected_impact.measurement, endDate: "2026-02-30" } } }).success).toBe(false);
    expect(requestEditSchema.safeParse({ ...changes, expectedImpact: { ...row.expected_impact, noBaseline: true } }).success).toBe(false);
});
it("saves scope on a historical Request without inventing a metric, and reloads it", async () => {
    await sql`update requests set expected_impact=null where id=${id}`;
    const original = { ...input(), expectedImpact: null };
    const partial = { kind: "metric", metric: "", baseline: null, target: null, unit: "", source: "", reviewAfterDays: null,
        measurement: { audience: "returning", platform: "web", exactDates: false, startDate: "", endDate: "" } };
    const action = (await import("./edit-actions")).saveRequestEdits;
    expect(await action(id, { snapshot: requestEditSnapshot(original), changes: { ...original, expectedImpact: partial } }, { orgId: "org-edit" })).toEqual({ success: true });
    const [row] = await sql`select * from requests where id=${id}`;
    expect(row.expected_impact).toBeNull();
    expect(row.measurement_draft).toEqual(partial);
    expect(row.title).toBe(original.title);
    expect(row.description).toBe(original.description);
    expect(row.priority).toBe("high");
    expect(row.affected_people).toBeNull();
    expect(row.useful_link).toBeNull();
    const { requestEditValues } = await import("@/lib/request-edit");
    const reopened = requestEditValues({ ...original, measurementDraft: row.measurement_draft });
    expect(reopened.expectedImpact).toEqual(partial);
    expect(await action(id, { snapshot: requestEditSnapshot({ ...original, measurementDraft: row.measurement_draft }), changes: reopened }, { orgId: "org-edit" })).toEqual({ success: true });
    const { requestSchema } = await import("@/lib/request-schema");
    expect(requestSchema.safeParse(reopened).success).toBe(false);
});
it("does not let a completed measurement be downgraded to an incomplete draft", async () => {
    expect(await (await import("./edit-actions")).saveRequestEdits(id, { snapshot: base(), changes: { ...input(), expectedImpact: { kind: "metric", metric: "", unit: "", baseline: null, target: null, source: "", reviewAfterDays: null } } }, { orgId: "org-edit" })).toHaveProperty("error");
    const [row] = await sql`select expected_impact from requests where id=${id}`;
    expect(row.expected_impact).toEqual(plan);
});
it("promotes a completed historical draft and rejects stale partial saves", async () => {
    const draft = { kind: "metric" as const, metric: "", unit: "", baseline: null, target: null, source: "", reviewAfterDays: null };
    await sql`update requests set expected_impact=null, measurement_draft=${sql.json(draft)} where id=${id}`;
    const stored = { ...input(), expectedImpact: null, measurementDraft: draft };
    const action = (await import("./edit-actions")).saveRequestEdits;
    const completed = { ...draft, metric: "Revenue", unit: "USD", target: 20, reviewAfterDays: 14 };
    expect(await action(id, { snapshot: requestEditSnapshot(stored), changes: { ...input(), expectedImpact: completed } }, { orgId: "org-edit" })).toEqual({ success: true });
    const [row] = await sql`select expected_impact,measurement_draft from requests where id=${id}`;
    expect(row).toEqual({ expected_impact: completed, measurement_draft: null });
    expect(await action(id, { snapshot: requestEditSnapshot(stored), changes: { ...input(), expectedImpact: draft } }, { orgId: "org-edit" })).toHaveProperty("error");
});

it("allows a workspace admin to edit another creator's Open Request without changing ownership", async () => {
 session.userId="edit-admin"; session.orgRole="org:admin";
 const changes=input();changes.expectedImpact.primary.target=82;
 expect(await save(changes)).toMatchObject({success:true});
 const [row]=await sql`select created_by,expected_impact from requests where id=${id}`;
 expect(row.created_by).toBe("edit-owner");expect(row.expected_impact.primary.target).toBe(82);
});
it.each(["in_progress","done"])("admin cannot edit %s Requests",async(status)=>{
 session.userId="edit-admin";session.orgRole="org:admin";
 await sql`update requests set status=${status}::request_status where id=${id}`;
 expect(await save(input())).toHaveProperty("error");
});
