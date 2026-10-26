import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readRequestRelease } from "@/app/(app)/requests/[id]/release-actions";
import { createJourneyRefresh } from "@/components/requests/journey-refresh";
import { callAction } from "@/lib/action-call";
import { readRequestJourney } from "@/app/(app)/requests/[id]/journey-actions";

const boundary = vi.hoisted(() => ({
  session: { userId: "viewer", orgId: "org_journey", orgRole: "org:member" } as { userId: string | null; orgId: string | null; orgRole: string | null },
  rosterFailed: false, namesFailed: false, visible: true,
  row: {} as Record<string, unknown>,
  savedNames: [["departed", "Saved Requester"], ["viewer", "Saved viewer"], ["historian", "Saved historian"]],
  children: [] as unknown[][], parent: [] as unknown[][],
  afterPrimary: async (_revision: number) => { void _revision; }, afterFollowUps: () => {},
  authReads: 0, rosterReads: 0, primaryReads: 0, nameReads: 0,
  queries: [] as { sql: string; params: unknown[] }[],
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => { boundary.authReads++; return boundary.session; },
  clerkClient: async () => ({ organizations: { getOrganizationMembershipList: async () => {
    boundary.rosterReads++;
    if (boundary.rosterFailed) throw new Error("Clerk unavailable");
    return { totalCount: 1, data: [{ organization: { id: "org_journey" }, role: "org:member", publicUserData: { userId: "viewer", firstName: "Live viewer", lastName: "", identifier: "viewer@example.test" } }] };
  } } }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const { getTableColumns } = await import("drizzle-orm");
  const schema = await import("@/db/schema");
  return { ...schema, db: drizzle(async (sql, params) => {
    boundary.queries.push({ sql, params });
    if (sql.includes('from "profiles"')) {
      boundary.nameReads++;
      if (boundary.namesFailed) throw new Error("Profile query failed");
      return { rows: boundary.savedNames.filter(([id]) => params.includes(id)) };
    }
    if (sql.includes('from "request_agreement_events"')) return { rows: [["child", { input: { reason: "Saved follow-up reason" } }]] };
    if (sql.includes('"follow_up_of" =')) { boundary.afterFollowUps(); return { rows: boundary.children }; }
    if (sql.startsWith('select "id", "title", "request_number"')) return { rows: boundary.parent };
    const revision = 40 + ++boundary.primaryReads;
    await boundary.afterPrimary(revision);
    if (!boundary.visible) return { rows: [] };
    const row: Record<string, unknown> = {
      id: "00000000-0000-4000-a000-000000000001", org_id: "org_journey", created_by: "departed", status: "done",
      title: "One saved revision", description: "Shared journey", agreement_revision: revision,
      created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-20T00:00:00Z", closure_corrections: [],
      affected_people: "All shoppers", release_state: { version: 1, ownerId: "departed", history: [], release: {
        exposureDate: "2026-10-20", audience: "All shoppers", evidence: "Release log", startDate: "2026-10-20", dueDate: "2026-10-25", windowKind: "relative",
      } },
    };
    Object.assign(row, boundary.row);
    return { rows: [Object.values(getTableColumns(schema.requests)).map(column => row[column.name] ?? null)] };
  }, { schema }) };
});
beforeEach(() => {
  boundary.authReads = boundary.rosterReads = boundary.primaryReads = boundary.nameReads = 0;
  boundary.queries = [];
  boundary.session = { userId: "viewer", orgId: "org_journey", orgRole: "org:member" };
  boundary.rosterFailed = boundary.namesFailed = false;
  boundary.visible = true;
  boundary.row = {};
  boundary.children = boundary.parent = [];
  boundary.afterPrimary = async () => {};
  boundary.afterFollowUps = () => {};
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T23:59:59.999Z"));
});
afterEach(() => vi.useRealTimers());

it("derives the entire journey from one Request revision, session, roster, names and UTC day", async () => {
  const id = "00000000-0000-4000-a000-000000000001";
  const context = { orgId: "org_journey" };
  const result = await readRequestJourney(id, context);
  if ("error" in result) throw new Error(result.error);
  const { release, outcome } = result;
  expect(release).toMatchObject({ revision: 41, today: "2026-10-24", measurement: { days: 1, label: "Due in 1 day" } });
  expect(outcome).toMatchObject({ revision: 41, measurement: { days: 1, label: "Due in 1 day" } });
  expect([boundary.authReads, boundary.primaryReads, boundary.rosterReads, boundary.nameReads]).toEqual([1, 1, 1, 1]);
});


const id = "00000000-0000-4000-a000-000000000001";
const context = { orgId: "org_journey" };
async function journey() {
  const result = await readRequestJourney(id, context);
  if ("error" in result) throw new Error(result.error);
  return result;
}

it("retains saved facts and names with the existing refusal reasons during a roster outage", async () => {
  boundary.rosterFailed = true;
  const result = await journey();
  expect(result.rosterUnavailable).toBe(true);
  expect(result.release).toMatchObject({ requesterName: "Saved Requester", release: { evidence: "Release log" } });
  expect(result.outcome).toMatchObject({ state: "measuring", requesterName: "Saved Requester" });
  expect(Object.values(result.release.actions)).toEqual(Array(8).fill({ allowed: false, reason: "Your workspace membership is no longer active." }));
  expect(result.outcome.actions).toEqual(result.release.actions);
  boundary.rosterFailed = false;
  expect((await journey()).rosterUnavailable).toBe(false);
});

it("loads the union of historical people once and prefers live names", async () => {
  boundary.row = {
    release_state: { version: 1, ownerId: "viewer", release: null, history: [{ operationId: "handover", fingerprint: "saved", at: "2026-10-22T00:00:00Z", actorId: "historian", previousOwnerId: "departed", ownerId: "viewer", previousRelease: null, release: null, revision: 4, input: { kind: "transfer", ownerId: "viewer", reason: "Requester left" } }] },
    closure_corrections: [{ operationId: "correction", fingerprint: "saved", at: "2026-10-23T00:00:00Z", actorId: "historian", field: "reason", correction: "Saved correction", reason: "More context", revision: 5 }],
  };
  const result = await journey();
  expect(result.release.names).toEqual({ viewer: "Live viewer", historian: "Saved historian", departed: "Saved Requester" });
  expect(result.outcome.names).toEqual(result.release.names);
  expect(boundary.nameReads).toBe(1);
  expect(boundary.queries.find(q => q.sql.includes('from "profiles"'))!.params).toEqual(["historian", "departed"]);
});

it("does not turn a failed profile query into Former member facts", async () => {
  boundary.namesFailed = true;
  expect(await readRequestJourney(id, context)).toEqual({ error: "Could not load the journey. Try again." });
});

it("keeps a guest's Request and follow-up queries scoped to their own workspace and creator", async () => {
  boundary.session = { userId: "departed", orgId: "org_journey", orgRole: "org:guest" };
  boundary.row.follow_up_of = "parent";
  boundary.children = [["child", "Own child", 12, "departed", "2026-10-22T00:00:00Z"]];
  const result = await journey();
  expect(result.rosterUnavailable).toBe(false);
  expect(boundary.rosterReads).toBe(0);
  expect(result.outcome.followUpOf).toBeNull(); // The database withheld the invisible parent.
  expect(result.outcome.followUps).toEqual([{ id: "child", title: "Own child", requestNumber: 12, createdBy: "departed", createdAt: "2026-10-22T00:00:00.000Z", reason: "Saved follow-up reason" }]);
  for (const query of boundary.queries.filter(q => q.sql.includes('from "requests"'))) {
    expect(query.sql).toContain('"requests"."org_id" =');
    expect(query.sql).toContain('"requests"."created_by" =');
    expect(query.params).toContain("org_journey");
    expect(query.params).toContain("departed");
  }
  expect(boundary.queries.find(q => q.sql.includes('from "request_agreement_events"'))!.params).toEqual(["org_journey", "follow_up_created", "child"]);
  boundary.visible = false;
  expect(await readRequestJourney(id, context)).toEqual({ error: "Could not load the journey. Try again." });
});

it("refuses foreign workspaces before loading facts and uses explicit expiry recovery", async () => {
  boundary.session.orgId = "foreign";
  expect(await readRequestJourney(id, context)).toEqual({ error: "Could not load the journey. Try again." });
  expect(boundary.queries).toHaveLength(0);
  boundary.session.userId = null;
  const result = await callAction(() => readRequestJourney(id, context), {
    current: async () => "stale",
    renew: async () => {
      boundary.session = { userId: "viewer", orgId: "org_journey", orgRole: "org:member" };
      return "usable";
    },
  });
  expect(result).toHaveProperty("release.revision", 41);
  expect(boundary.authReads).toBe(3);
  expect(boundary.primaryReads).toBe(1);
});

it("standalone Release avoids follow-up, event and parent queries", async () => {
  boundary.row.follow_up_of = "parent";
  const result = await readRequestRelease(id, context);
  expect(result).toMatchObject({ revision: 41, today: "2026-10-24", requesterName: "Saved Requester" });
  expect(boundary.queries).toHaveLength(2); // primary Request + missing saved name
  expect(boundary.primaryReads).toBe(1);
});

it("captures one server day even when the follow-up query crosses midnight", async () => {
  boundary.session.userId = "viewer";
  boundary.row.release_state = { version: 1, ownerId: "viewer", history: [], release: { exposureDate: "2026-10-20", audience: "All shoppers", evidence: "Release log", startDate: "2026-10-20", dueDate: "2026-10-25", windowKind: "relative" } };
  boundary.afterFollowUps = () => vi.setSystemTime(new Date("2026-10-25T00:00:00Z"));
  const before = await journey();
  expect(before.release.today).toBe("2026-10-24");
  expect(before.release.measurement?.label).toBe("Due in 1 day");
  expect(before.outcome.actions.close).toEqual({ allowed: false, reason: "Opens on 25 Oct 2026.", opensOn: "2026-10-25" });
  const after = await journey();
  expect(after.release.today).toBe("2026-10-25");
  expect(after.outcome.measurement?.label).toBe("Due today");
  expect(after.release.actions.close).toEqual({ allowed: true });
});

it("the production refresh mechanism discards an older actual combined read", async () => {
  let releaseOld!: () => void;
  const held = new Promise<void>(resolve => { releaseOld = resolve });
  boundary.afterPrimary = revision => revision === 41 ? held : Promise.resolve();
  const shown: number[] = [];
  const refresh = createJourneyRefresh({ read: () => readRequestJourney(id, context), show: result => { if (!("error" in result)) shown.push(result.release.revision); } });
  refresh.activate();
  const initial = refresh.refresh();
  await vi.waitFor(() => expect(boundary.primaryReads).toBe(1));
  await refresh.refresh();
  releaseOld();
  expect(await initial).toBe(false);
  expect(shown).toEqual([42]);
});


it("keeps a taken-on Guest submission's Requester and saved correction facts in the combined Viewer journey", async () => {
  boundary.session.orgRole = "org:viewer";
  boundary.row = {
    guest_submission: true, taken_on_by: "viewer", release_state: null,
    exception_closure: { kind: "exception", actorId: "viewer", ownerId: "viewer", learned: "The original need changed.", closedAt: "2026-10-23T00:00:00Z", reasonCode: "other", reason: "Stopped", revision: 2 },
    closure_corrections: [{ actorId: "historian", field: "reason", correction: "More context", reason: "Checked", revision: 3 }],
  };
  const result = await journey();
  expect(result.release.requesterId).toBe("viewer");
  expect(result.outcome).toMatchObject({ requesterId: "viewer", state: "closed", closure: { learned: "The original need changed." }, corrections: [{ correction: "More context" }] });
  expect(Object.values(result.release.actions).every(action => !action.allowed)).toBe(true);
  expect(result.release.actions).toEqual(result.outcome.actions);
  expect([boundary.authReads, boundary.primaryReads, boundary.rosterReads]).toEqual([1, 1, 1]);
});
