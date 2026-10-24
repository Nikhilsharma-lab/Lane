/** Opt-in audit of a private staging export. All writes go to guarded lane_test. */
import { readFileSync } from "node:fs";
import { requireTestDatabase } from "@/test/test-database";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { requestEditSnapshot, requestEditValues } from "@/lib/request-edit";
import { EMPTY_METRIC_IMPACT } from "@/lib/request-impact";
import { measurementEditorChanges, measurementEditorValue } from "@/lib/request-measurement-editor";
import type { RequestDetail } from "@/components/requests/detail-view";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "snapshot-audit-owner", orgId: "org-snapshot-audit", orgRole: "org:member" }) }));
const path = process.env.LANE_REQUEST_AUDIT_SNAPSHOT;
type Snapshot = { id: string; request_number: number; project_id: string | null; status: string; title: string; description: string; affected_people: string | null; desired_change: string | null; observed_evidence: string | null; uncertainty: string | null; useful_link: string | null; request_type: RequestDetail["requestType"]; priority: RequestDetail["priority"]; expected_impact: RequestDetail["expectedImpact"]; measurement_draft: RequestDetail["measurementDraft"]; reframed_problem: string | null; extracted_solution: string | null; classification: RequestDetail["classification"] };
const rows: Snapshot[] = path ? JSON.parse(readFileSync(path, "utf8")) : [];
let sql: ReturnType<typeof postgres>;
describe.skipIf(!path)("older Request snapshot save/reopen audit (local copies only)", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    requireTestDatabase(process.env.DATABASE_URL);
    sql = postgres(url.toString(), { max: 1 });
    await sql`insert into organizations(id,name,slug) values ('org-snapshot-audit','Audit','snapshot-audit')`;
    await sql`insert into profiles(id,full_name,email) values ('snapshot-audit-owner','Audit','snapshot-audit@example.test')`;
    for (const projectId of new Set(rows.map(row => row.project_id).filter((id): id is string => Boolean(id)))) {
      await sql`insert into projects(id,org_id,name,created_by) values (${projectId},'org-snapshot-audit',${`Audit ${projectId}`},'snapshot-audit-owner')`;
    }
  });
  afterAll(async () => { if (sql) { await sql`delete from organizations where id='org-snapshot-audit'`; await sql`delete from profiles where id='snapshot-audit-owner'`; await sql.end(); } });
  it.each(rows.filter(row => row.request_number <= 16))("LAN-$request_number preserves saved values and missing measurements", async row => {
    const id = randomUUID();
    const original = { title: row.title, description: row.description, affectedPeople: row.affected_people, desiredChange: row.desired_change, observedEvidence: row.observed_evidence, uncertainty: row.uncertainty, usefulLink: row.useful_link, requestType: row.request_type, priority: row.priority, projectId: row.project_id, expectedImpact: row.expected_impact, measurementDraft: row.measurement_draft, reframedProblem: row.reframed_problem, extractedSolution: row.extracted_solution };
    await sql`insert into requests(id,org_id,created_by,project_id,title,description,affected_people,desired_change,observed_evidence,uncertainty,useful_link,request_type,priority,expected_impact,measurement_draft,reframed_problem,extracted_solution,classification,status) values (${id},'org-snapshot-audit','snapshot-audit-owner',${row.project_id},${row.title},${row.description},${row.affected_people},${row.desired_change},${row.observed_evidence},${row.uncertainty},${row.useful_link},${row.request_type ?? null},${row.priority},${row.expected_impact ? sql.json(row.expected_impact) : null},${row.measurement_draft ? sql.json(row.measurement_draft) : null},${row.reframed_problem},${row.extracted_solution},${row.classification},${row.status})`;
    const originalImpact = row.expected_impact ?? row.measurement_draft ?? { ...EMPTY_METRIC_IMPACT, unit: "" };
    const editor = measurementEditorValue(originalImpact);
    expect(measurementEditorChanges(editor, originalImpact)).toEqual(originalImpact);
    if (!row.expected_impact && !row.measurement_draft) {
      expect(editor.measurement).toMatchObject({ audience: "", platform: "", windowDays: null });
      expect(editor.primary).toMatchObject({ name: "", unit: "", current: null, target: null });
    }
    const action = (await import("@/app/(app)/requests/[id]/edit-actions")).saveRequestEdits;
    const unchanged = { ...requestEditValues(original), expectedImpact: originalImpact };
    if (row.status !== "open") {
      expect(await action(id, { snapshot: requestEditSnapshot(original), changes: unchanged }, { orgId: "org-snapshot-audit" })).toHaveProperty("error");
      // Only this disposable copy is opened to exercise the saved data format.
      await sql`update requests set status='open' where id=${id}`;
    }
    expect(await action(id, { snapshot: requestEditSnapshot(original), changes: unchanged }, { orgId: "org-snapshot-audit" })).toEqual({ success: true });
    const [saved] = await sql`select * from requests where id=${id}`;
    for (const key of ["project_id","title","description","affected_people","desired_change","observed_evidence","uncertainty","useful_link","request_type","priority","reframed_problem","extracted_solution","classification"] as const) expect(saved[key], key).toEqual(row[key]);
    expect(saved.expected_impact).toEqual(row.expected_impact);
    expect(saved.expected_impact ?? saved.measurement_draft).toEqual(originalImpact);
    editor.measurement.audience = "returning";
    editor.measurement.platform = "web";
    const changes = { ...unchanged, expectedImpact: measurementEditorChanges(editor, originalImpact) };
    expect(await action(id, { snapshot: requestEditSnapshot(unchanged), changes }, { orgId: "org-snapshot-audit" })).toEqual({ success: true });
    const [reopened] = await sql`select expected_impact,measurement_draft from requests where id=${id}`;
    const reopenedImpact = reopened.expected_impact ?? reopened.measurement_draft;
    expect(measurementEditorValue(reopenedImpact).measurement).toMatchObject({ audience: "returning", platform: "web" });
    const { measurement: _scope, ...savedMeasurement } = reopenedImpact;
    const { measurement: _originalScope, ...originalMeasurement } = originalImpact.kind === "measurement" ? {} : originalImpact;
    void _scope; void _originalScope;
    expect(savedMeasurement).toEqual(originalMeasurement);
  });
});
