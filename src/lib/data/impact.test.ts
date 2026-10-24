import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ImpactPage from "@/app/(app)/impact/page";
import { loadImpactPage } from "@/lib/data/impact";

const boundary = vi.hoisted(() => ({
  queries: [] as { sql: string; params: unknown[] }[],
  reads: 0,
  rows: null as Record<string, unknown>[] | null,
  names: [["teammate", "Avery"]],
  beforeNames: () => {},
  beforeRows: () => {},
  fail: null as "requests" | "names" | null,
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "viewer", orgId: "org_impact", orgRole: "org:member" }),
}));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("@/db/schema");
  return { ...schema, db: drizzle(async (sql, params) => {
    boundary.queries.push({ sql, params });
    if (sql.includes('from "profiles"')) {
      if (boundary.fail === "names") throw new Error("Query boundary unavailable");
      boundary.beforeNames();
      return { rows: boundary.names.filter(([id]) => params.includes(id)) };
    }
    const read = ++boundary.reads;
    if (boundary.fail === "requests") throw new Error("Query boundary unavailable");
    boundary.beforeRows();
    const row: Record<string, unknown> = {
      id: `request-${read}`, org_id: "org_impact", request_number: read, title: `Saved snapshot ${read}`,
      created_by: "viewer", assigned_to: "teammate", status: "open", closure_corrections: [],
    };
    const columns = [...sql.slice(0, sql.indexOf(" from ")).matchAll(/"(?:requests|projects)"\."([^"]+)"/g)];
    return { rows: (boundary.rows ?? [row]).map(value => columns.map(([, name]) => value[name] ?? null)) };
  }, { schema }) };
});
beforeEach(() => {
  boundary.queries = [];
  boundary.reads = 0;
  boundary.rows = null;
  boundary.names = [["teammate", "Avery"]];
  boundary.beforeNames = () => {};
  boundary.beforeRows = () => {};
  boundary.fail = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T23:59:59.999Z"));
});
afterEach(() => vi.useRealTimers());

it("renders the page and selected teammate from one visible Request snapshot", async () => {
  const page = await ImpactPage({ searchParams: Promise.resolve({ period: "2026-q4", person: "teammate" }) });
  const screen = page.props.children[1].props;
  expect(boundary.reads).toBe(1);
  expect(screen.dashboard.myWork.requests).toMatchObject([{ requestId: "request-1", title: "Saved snapshot 1" }]);
  expect(screen.person).toMatchObject({ id: "teammate", name: "Avery", entries: [{ requestId: "request-1", title: "Saved snapshot 1" }] });
  expect(screen.period).toEqual({ kind: "quarter", year: 2026, quarter: 4 });
  expect(boundary.queries).toHaveLength(2);
});

const member = { userId: "viewer", orgId: "org_impact", role: "member" as const };
function measuringRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "measuring", org_id: "org_impact", request_number: 4, title: "Measure conversion",
    created_by: "viewer", assigned_to: "teammate", project_id: null, name: null, status: "done",
    release_state: { version: 1, ownerId: "viewer", history: [], release: {
      exposureDate: "2026-10-18", audience: "all", evidence: "Release log", startDate: "2026-10-18", dueDate: "2026-10-25", windowKind: "relative",
    } },
    outcome_closure: null, exception_closure: null, closure_corrections: [],
    expected_impact: { version: 4, kind: "measurement", primary: { key: "conversion", name: "", unit: "percent", current: 40, target: 50, noBaseline: false, check: "" }, measurement: { audience: "all", platform: "all", windowDays: 7, exactDates: false, startDate: "", endDate: "" }, guardrails: [] },
    no_measurable_impact_reason: null, follow_up_of: null,
    ...over,
  };
}

it("keeps the dashboard and selected person's due labels on one captured day across a name read", async () => {
  boundary.rows = [measuringRow()];
  boundary.beforeNames = () => vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
  const result = await loadImpactPage(member, { personId: "teammate" });
  expect(result.dashboard.myWork.requests[0].stillDue).toMatchObject({ dueDate: "2026-10-25", dueLabel: "Due in 1 day" });
  expect(result.person?.entries[0].stillDue).toMatchObject({ dueDate: "2026-10-25", dueLabel: "Due in 1 day" });
});

it.each([
  { selection: "absent", personId: undefined, role: "member" as const, chosen: null, names: 1 },
  { selection: "permitted", personId: "teammate", role: "member" as const, chosen: "teammate", names: 1 },
  { selection: "invalid", personId: "unknown", role: "member" as const, chosen: null, names: 1 },
  { selection: "self", personId: "viewer", role: "member" as const, chosen: null, names: 1 },
  { selection: "foreign", personId: "foreign-person", role: "member" as const, chosen: null, names: 1 },
  { selection: "guest", personId: "teammate", role: "guest" as const, chosen: null, names: 0 },
])("reads Requests once for $selection selection and resolves names only when permitted", async ({ personId, role, chosen, names }) => {
  const result = await loadImpactPage({ ...member, role }, { personId });
  expect(boundary.reads).toBe(1);
  expect(boundary.queries.filter(query => query.sql.includes('from "profiles"'))).toHaveLength(names);
  expect(result.dashboard.myWork.requests.map(entry => entry.requestId)).toEqual(["request-1"]);
  expect(result.person?.id ?? null).toBe(chosen);
  if (role === "guest") {
    expect(result.teammates).toEqual([]);
    expect(result.dashboard.wholeOrg).toBeNull();
  }
});

it("skips name queries when all visible Requests belong only to the viewer", async () => {
  boundary.rows = [measuringRow({ assigned_to: null })];
  const result = await loadImpactPage(member, { personId: "viewer" });
  expect(result.teammates).toEqual([]);
  expect(result.person).toBeNull();
  expect(result.dashboard.myWork.requests).toHaveLength(1);
  expect(boundary.queries).toHaveLength(1);
});

it("uses the handover Requester, deduplicates people and resolves a selected person's saved name once", async () => {
  boundary.rows = [
    measuringRow({ id: "transferred", created_by: "old-author", release_state: { version: 1, ownerId: "handover", history: [], release: null } }),
    measuringRow({ id: "second", request_number: 5 }),
    measuringRow({ id: "departed", request_number: 6, created_by: "departed", assigned_to: null, release_state: null }),
  ];
  boundary.names = [["teammate", "Avery"], ["handover", "Zoe"]];
  const result = await loadImpactPage(member, { personId: "handover" });
  expect(result.teammates).toEqual([{ id: "teammate", name: "Avery" }, { id: "departed", name: "Former member" }, { id: "handover", name: "Zoe" }]);
  expect(result.person).toMatchObject({ id: "handover", name: "Zoe", entries: [{ requestId: "transferred", role: "requester" }] });
  expect(result.person?.entries).toHaveLength(1);
  expect(Object.keys(result.person!).sort()).toEqual(["entries", "id", "name"]);
  expect(boundary.queries.filter(query => query.sql.includes('from "profiles"')).map(query => query.params)).toEqual([["departed", "handover", "teammate"]]);
});

it.each(["member", "guest"] as const)("keeps SQL workspace/guest restrictions and pure visibility defense for a %s", async role => {
  boundary.rows = [
    measuringRow(),
    measuringRow({ id: "foreign", org_id: "org_other", created_by: "foreign-person", assigned_to: "foreign-person", release_state: null }),
    measuringRow({ id: "other-person", created_by: "other-person", assigned_to: null, release_state: null }),
  ];
  const result = await loadImpactPage({ ...member, role }, { personId: "foreign-person" });
  expect(result.dashboard.myWork.requests.map(entry => entry.requestId)).toEqual(["measuring"]);
  expect(result.person).toBeNull();
  expect(result.teammates.map(person => person.id)).toEqual(role === "guest" ? [] : ["teammate", "other-person"]);
  const query = boundary.queries[0];
  expect(query.sql).toContain('"requests"."org_id" =');
  expect(query.sql).toContain('"projects"."org_id" =');
  expect(query.params).toEqual(role === "guest" ? ["org_impact", "org_impact", "viewer"] : ["org_impact", "org_impact"]);
  if (role === "guest") {
    expect(query.sql).toContain('"requests"."created_by" =');
    expect(result.dashboard.wholeOrg).toBeNull();
    expect(result.dashboard.byProject.flatMap(project => project.requests.map(entry => entry.requestId))).toEqual(["measuring"]);
  } else {
    expect(result.dashboard.byProject.flatMap(project => project.requests.map(entry => entry.requestId))).toEqual(["measuring", "other-person"]);
  }
});

it.each(["requests", "names"] as const)("propagates a failed %s query through the actual page instead of rendering partial facts", async failure => {
  boundary.fail = failure;
  await expect(ImpactPage({ searchParams: Promise.resolve({ person: "teammate" }) })).rejects.toMatchObject({ cause: { message: "Query boundary unavailable" } });
  expect(boundary.reads).toBe(1);
  expect(boundary.queries).toHaveLength(failure === "requests" ? 1 : 2);
});

it("retains genuine empty states after a successful empty Request read", async () => {
  boundary.rows = [];
  const result = await loadImpactPage(member, { personId: "teammate" });
  expect(result).toMatchObject({ dashboard: { myWork: { requests: [] }, byProject: [], wholeOrg: { lines: [], emptyMessage: "Nothing measured this period yet" } }, teammates: [], person: null });
  expect(boundary.queries).toHaveLength(1);
});

it("captures the default day before the Request read and respects an explicit clock", async () => {
  boundary.rows = [measuringRow()];
  boundary.beforeRows = () => vi.setSystemTime(new Date("2026-10-26T00:00:00Z"));
  const result = await loadImpactPage(member, { personId: "teammate", period: { kind: "year", year: 2025 } });
  expect(result.dashboard.wholeOrg?.period).toEqual({ kind: "year", year: 2025 });
  expect(result.dashboard.myWork.requests[0].stillDue?.dueLabel).toBe("Due in 1 day");
  expect(result.person?.entries[0].stillDue?.dueLabel).toBe("Due in 1 day");
  const controlled = await loadImpactPage(member, { personId: "teammate", now: new Date("2026-10-23T00:00:00Z") });
  expect(controlled.dashboard.myWork.requests[0].stillDue?.dueLabel).toBe("Due in 2 days");
  expect(controlled.person?.entries[0].stillDue?.dueLabel).toBe("Due in 2 days");
});
