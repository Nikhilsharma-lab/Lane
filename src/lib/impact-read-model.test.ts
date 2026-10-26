import { describe, expect, it } from "vitest";
import { buildDefinitionUses, buildImpactDashboard, buildIterations, buildOutcomeReport, buildTeammateWork, teammateIdsOf, type ImpactDefinition, type ImpactPeriod, type ImpactRow, type ImpactViewer } from "./impact-read-model";
import type { ExpectedImpact } from "./request-impact";
import type { ClosureCorrection, OutcomeClosure, OutcomeException } from "./request-outcome";
import type { ReleaseFact, ReleaseState } from "./request-release";

const NOW = new Date("2026-10-23T12:00:00.000Z");
const ORG = "org_impact";
const ADMIN = "user_admin";
const MEMBER = "user_member";
const LEADER = "user_leader";
const GUEST = "user_guest";

const viewer = (userId: string, role: ImpactViewer["role"]): ImpactViewer => ({ userId, orgId: ORG, role });
const ADMIN_VIEWER = viewer(ADMIN, "admin");
const MEMBER_VIEWER = viewer(MEMBER, "member");
const LEADER_VIEWER = viewer(LEADER, "member");
const GUEST_VIEWER = viewer(GUEST, "guest");

/** A measurement plan: percent conversion by default, 40 now, 50 predicted, 30 days after release. */
function plan(over: { key?: "conversion" | "adoption" | "check"; unit?: "percent" | "count" | "seconds"; current?: number | null; target?: number | null; noBaseline?: boolean; audience?: "all" | "new"; windowDays?: 30 | 90 } = {}): ExpectedImpact {
  return {
    kind: "measurement",
    version: 4,
    primary: {
      key: over.key ?? "conversion",
      name: "",
      unit: over.unit ?? "percent",
      current: over.current === undefined ? 40 : over.current,
      target: over.target === undefined ? 50 : over.target,
      noBaseline: over.noBaseline ?? false,
      check: "",
    },
    measurement: { audience: over.audience ?? "all", platform: "all", windowDays: over.windowDays ?? 30, exactDates: false, startDate: "", endDate: "" },
    guardrails: [],
  };
}

/** Released 10 Aug 2026, result due 9 Sep 2026 (30 days after release). */
const RELEASE_AUG = releaseFact("2026-08-10", "2026-09-09");
/** Released 1 Oct 2026, due 31 Oct 2026: still measuring at NOW. */
const RELEASE_OCT = releaseFact("2026-10-01", "2026-10-31");

function releaseFact(exposureDate: string, dueDate: string): ReleaseFact {
  return { exposureDate, audience: "all", evidence: "Released to all users", dueDate, startDate: exposureDate, windowKind: "relative" };
}

/** A release recorded with the value before release, as the release action stores it: in its history entry. */
function recordedState(ownerId: string, release: ReleaseFact, value: number): ReleaseState {
  const input = { kind: "release" as const, exposureDate: release.exposureDate, evidence: release.evidence, audienceConfirmed: true as const, valueBeforeRelease: { value, unit: "%" } };
  return { version: 1, ownerId, release, history: [{ operationId: "op-release", fingerprint: "fp", actorId: ownerId, at: "2026-08-10T09:00:00.000Z", input, previousRelease: null, release, previousOwnerId: ownerId, ownerId, revision: 1 }] };
}

function releaseState(ownerId: string, release: ReleaseFact | null): ReleaseState {
  return { version: 1, ownerId, release, history: [] };
}

function measuredClosure(expected: ExpectedImpact, release: ReleaseFact, actual: number, over: { evidence?: string; observedFrom?: string; observedTo?: string; passed?: boolean } = {}): OutcomeClosure {
  const primary = over.passed === undefined
    ? { kind: "numeric" as const, actual, unit: "%" }
    : { kind: "pass_fail" as const, passed: over.passed };
  return {
    version: 1,
    kind: "measured",
    actorId: "user_requester",
    ownerId: "user_requester",
    closedAt: "2026-09-10T09:00:00.000Z",
    operationId: `op-${actual}-${over.evidence ?? "default"}`,
    fingerprint: "fp",
    expected,
    release,
    primary,
    guardrails: [],
    evidence: over.evidence ?? "Dashboard export",
    observedFrom: over.observedFrom ?? release.startDate,
    observedTo: over.observedTo ?? release.dueDate,
    revision: 1,
  };
}

function row(over: Partial<ImpactRow> & Pick<ImpactRow, "id" | "requestNumber" | "createdBy">): ImpactRow {
  return {
    orgId: ORG,
    takenOnBy: null,
    title: `Request ${over.requestNumber}`,
    problem: `Problem ${over.requestNumber}`,
    assignedTo: null,
    projectId: null,
    projectName: null,
    status: "open",
    releaseState: null,
    outcomeClosure: null,
    exceptionClosure: null,
    closureCorrections: [],
    expectedImpact: plan(),
    noMeasurableImpactReason: null,
    followUpOf: null,
    definitions: [],
    // Filed one day apart, in number order, unless a test says otherwise.
    createdAt: new Date(Date.UTC(2026, 0, over.requestNumber)),
    sameProblemGroup: null,
    ...over,
  };
}

/** Every key anywhere in an output, for the no-aggregate-per-person rule. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === "object") return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
  return [];
}

const requestIds = (entries: { requestNumber: number }[]) => entries.map(entry => entry.requestNumber);

const YEAR_2026: ImpactPeriod = { kind: "year", year: 2026 };
/** The Outcome report's totals for a period (2026 unless given): where the #151 and #201 totals rules show. */
const totalsOf = (rows: ImpactRow[], period: ImpactPeriod = YEAR_2026, who: ImpactViewer = ADMIN_VIEWER) => buildOutcomeReport(who, rows, { now: NOW, period })!.totals!;
/** Every Request in the report's Project sections, for a period (2026 unless given). */
const reportEntries = (rows: ImpactRow[], period: ImpactPeriod = YEAR_2026, who: ImpactViewer = ADMIN_VIEWER) => buildOutcomeReport(who, rows, { now: NOW, period })!.projects.flatMap(section => section.requests);

describe("impact read model: viewers", () => {
  it("gives a guest only the Requests they created, and no Outcome report", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: GUEST }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER }),
    ];
    const dashboard = buildImpactDashboard(GUEST_VIEWER, rows, { now: NOW });
    expect(requestIds(dashboard.myWork.requests)).toEqual([1]);
    expect(dashboard.outcomeReport).toBeNull();
  });

  it("gives a member, an admin and a leader who is a member the same report", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46), releaseState: releaseState(MEMBER, RELEASE_AUG), status: "done", projectId: "p1", projectName: "Onboarding" }),
      row({ id: "b", requestNumber: 2, createdBy: ADMIN, status: "done", releaseState: releaseState(ADMIN, RELEASE_OCT), projectId: "p1", projectName: "Onboarding" }),
    ];
    const admin = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: YEAR_2026 });
    const member = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW, period: YEAR_2026 });
    const leader = buildImpactDashboard(LEADER_VIEWER, rows, { now: NOW, period: YEAR_2026 });
    expect(member.outcomeReport).toEqual(admin.outcomeReport);
    expect(leader.outcomeReport).toEqual(member.outcomeReport);
  });

  it("lists in My work the Requests a person requested or picked up, with their role", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, assignedTo: ADMIN }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, assignedTo: MEMBER }),
      row({ id: "c", requestNumber: 3, createdBy: ADMIN }),
    ];
    const mine = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW }).myWork.requests;
    expect(mine.map(entry => [entry.requestNumber, entry.role])).toEqual([[1, "requester"], [2, "both"]]);
    const picked = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).myWork.requests;
    expect(picked.map(entry => [entry.requestNumber, entry.role])).toEqual([[1, "picker"], [3, "requester"]]);
  });

  it("keeps My work the same whatever period the report shows", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "open" }),
    ];
    const august = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW, period: { kind: "month", year: 2026, month: 8 } });
    const q1 = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 1 } });
    expect(requestIds(august.myWork.requests)).toEqual([1, 2]);
    expect(q1.myWork).toEqual(august.myWork);
  });
});

describe("impact read model: measured results", () => {
  it("shows baseline, actual, change, predicted change and window, with percentages in percentage points", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) })];
    const lines = totalsOf(rows);
    expect(lines).toHaveLength(1);
    const [line] = lines;
    expect(line).toMatchObject({ metric: "Conversion rate", unit: "%", window: "30 days after release", changeUnit: "percentage points", summed: null });
    expect(line.results[0]).toMatchObject({ requestNumber: 1, baselineState: "known", baseline: 40, actual: 46, change: 6, predictedTarget: 50, predictedChange: 10, releaseDate: "2026-08-10" });
  });

  it("groups results by release date: a quarter and a year include a release, and the next quarter has none", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) }),
    ];
    expect(totalsOf(rows, { kind: "quarter", year: 2026, quarter: 3 })).toHaveLength(1);
    expect(totalsOf(rows, { kind: "quarter", year: 2026, quarter: 4 })).toEqual([]);
    expect(totalsOf(rows, YEAR_2026)).toHaveLength(1);
  });

  it("puts a release on 30 June in Q2 and on 1 July in Q3", () => {
    const june = releaseFact("2026-06-30", "2026-07-30");
    const july = releaseFact("2026-07-01", "2026-07-31");
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, june), outcomeClosure: measuredClosure(plan(), june, 46) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, july), outcomeClosure: measuredClosure(plan(), july, 44) }),
    ];
    expect(totalsOf(rows, { kind: "quarter", year: 2026, quarter: 2 })[0].results.map(result => result.requestNumber)).toEqual([1]);
    expect(totalsOf(rows, { kind: "quarter", year: 2026, quarter: 3 })[0].results.map(result => result.requestNumber)).toEqual([2]);
  });

  it("keeps a Request with a predicted result but nothing measured out of every total", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "open" })];
    expect(totalsOf(rows)).toEqual([]);
  });
});

describe("impact read model: still due, closed without result and operational work", () => {
  it("shows a still-due result by its due date, not in any line", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) })];
    expect(totalsOf(rows)).toEqual([]);
    expect(reportEntries(rows).map(entry => entry.outcome)).toEqual([{ kind: "still_due", dueDate: "2026-10-31", dueLabel: "Due in 8 days" }]);
    expect(buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW }).myWork.requests[0].stillDue).toMatchObject({ dueDate: "2026-10-31" });
  });

  it("lists a Request closed without a result with its reason, outside every total", () => {
    const exception: OutcomeException = {
      version: 1, kind: "exception", reasonCode: "cannot_measure", reason: "No event data for this release",
      actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-x", fingerprint: "fp",
      release: RELEASE_AUG, revision: 1,
    };
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: exception })];
    const report = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: YEAR_2026 })!;
    expect(report.totals).toEqual([]);
    expect(report.closedWithoutResult).toMatchObject([{ reasonCode: "cannot_measure", requests: [{ requestNumber: 1, reason: "No event data for this release" }] }]);
    expect(buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW }).myWork.requests[0].closedWithoutResult).toMatchObject({ reason: "No event data for this release" });
  });

  it("shows operational work with its reason, outside every total", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: null, noMeasurableImpactReason: "Design token rename" })];
    expect(totalsOf(rows)).toEqual([]);
    expect(reportEntries(rows).map(entry => entry.outcome)).toEqual([{ kind: "operational", reason: "Design token rename" }]);
    expect(buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW }).myWork.requests[0].operationalReason).toBe("Design token rename");
  });

  it("keeps a Request with no release date out of every period, whether it is Done or still open", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: null }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "open", releaseState: null }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "in_progress", releaseState: null, expectedImpact: null, noMeasurableImpactReason: "Design token rename" }),
      row({ id: "d", requestNumber: 4, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG) }),
    ];
    expect(reportEntries(rows, YEAR_2026).map(entry => entry.requestNumber)).toEqual([4]);
    expect(reportEntries(rows, { kind: "year", year: 2025 })).toEqual([]);
    expect(totalsOf(rows)).toEqual([]);
  });
});

describe("impact read model: corrections, shared results and projects", () => {
  it("shows a Correction beside its original result, which stays as recorded", () => {
    const correction: ClosureCorrection = { operationId: "op-c", fingerprint: "fc", actorId: MEMBER, at: "2026-09-12T09:00:00.000Z", field: "evidence", correction: "Re-checked against the warehouse", reason: "Wrong source", revision: 2 };
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46), closureCorrections: [correction] })];
    const [line] = totalsOf(rows);
    expect(line.results[0].actual).toBe(46);
    expect(line.results[0].corrections).toMatchObject([{ field: "evidence", correction: "Re-checked against the warehouse", reason: "Wrong source" }]);
  });

  it("counts a shared result once and lists every related Request", () => {
    const observation = { observedFrom: "2026-08-10", observedTo: "2026-09-09", evidence: "Shared dashboard export" };
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46, observation) }),
      row({ id: "b", requestNumber: 2, createdBy: ADMIN, status: "done", releaseState: releaseState(ADMIN, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46, observation) }),
    ];
    const [line] = totalsOf(rows);
    expect(line.count).toBe(1);
    expect(line.results).toHaveLength(1);
    expect(line.results[0].requests.map(request => request.requestNumber)).toEqual([1, 2]);
  });

  it("shows a Project's still-due work under its Project, and leaves unreleased work out", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "open" }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) }),
    ];
    const report = buildOutcomeReport(ADMIN_VIEWER, rows, { now: NOW, period: YEAR_2026 })!;
    expect(report.projects.map(section => [section.name, requestIds(section.requests)])).toEqual([["Search", [2]]]);
    expect(report.totals).toEqual([]);
    expect(report.atAGlance).toMatchObject({ shipped: 1, stillDue: 1, measured: 0 });
  });

  it("gives a new capability its target only, and never a change", () => {
    const newCapability = plan({ current: null, target: 25, noBaseline: true });
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: newCapability, outcomeClosure: measuredClosure(newCapability, RELEASE_AUG, 20) })];
    const [line] = totalsOf(rows);
    expect(line.results[0]).toMatchObject({ baselineState: "new_capability", baseline: null, actual: 20, change: null, predictedTarget: 25, predictedChange: null });
  });

  it("shows an unknown baseline as unknown, never as zero", () => {
    const unknown = plan({ current: null, target: 50 });
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: unknown, outcomeClosure: measuredClosure(unknown, RELEASE_AUG, 46) })];
    const [line] = totalsOf(rows);
    expect(line.results[0]).toMatchObject({ baselineState: "unknown", baseline: null, actual: 46, change: null, predictedChange: null });
  });

  it("gives two metrics two lines, with a total only for a count", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130, { evidence: "Adoption export" }) }),
    ];
    const lines = totalsOf(rows);
    expect(lines).toHaveLength(2);
    expect(lines.find(line => line.unit === "count")!).toMatchObject({ metric: "Users who adopted", summed: { count: 1, change: 30 } });
    expect(lines.find(line => line.unit === "%")!.summed).toBeNull();
  });
});

describe("impact read model: totals rule", () => {
  it("without a definition, sums counts only when saved name, unit, audience and window match exactly, and never sums percentages", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const newAudience = plan({ key: "adoption", unit: "count", current: 100, target: 150, audience: "new" });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130, { evidence: "e1" }) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 120, { evidence: "e2" }) }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: newAudience, outcomeClosure: measuredClosure(newAudience, RELEASE_AUG, 110, { evidence: "e3" }) }),
      row({ id: "d", requestNumber: 4, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46, { evidence: "e4" }) }),
      row({ id: "e", requestNumber: 5, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 44, { evidence: "e5" }) }),
    ];
    const lines = totalsOf(rows);
    const adoptionLine = lines.find(line => line.metric === "Users who adopted" && line.audience === "All users")!;
    expect(adoptionLine.summed).toEqual({ count: 2, change: 50 });
    expect(lines.find(line => line.audience === "New users")!.summed).toEqual({ count: 1, change: 10 });
    const percent = lines.find(line => line.unit === "%")!;
    expect(percent.count).toBe(2);
    expect(percent.summed).toBeNull();
  });

  it("counts Verified results as good or bad and never sums them", () => {
    const check = plan({ key: "check", unit: "count", current: null, target: null });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: check, outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: true, evidence: "p1" }) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: check, outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: false, evidence: "p2" }) }),
    ];
    const [line] = totalsOf(rows);
    expect(line.verdicts).toEqual({ good: 1, bad: 1 });
    expect(line.summed).toBeNull();
    expect(line.results.map(result => result.verdict)).toEqual(["good", "bad"]);
  });

  it("shows a quarter's still-due work with no zero total", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) })];
    const report = buildOutcomeReport(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 4 } })!;
    expect(report.totals).toEqual([]);
    expect(report.atAGlance.stillDue).toBe(1);
  });
});

describe("impact read model: unknown changes and other units (#151 review)", () => {
  it("shows no change total on a line when any result on it has an unknown baseline, and keeps the count", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const unknown = plan({ key: "adoption", unit: "count", current: null, target: 150 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130, { evidence: "u1" }) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: unknown, outcomeClosure: measuredClosure(unknown, RELEASE_AUG, 120, { evidence: "u2" }) }),
    ];
    const [line] = totalsOf(rows);
    expect(line.count).toBe(2);
    expect(line.summed).toEqual({ count: 2, change: null });
  });

  it("sums a non-percentage unit that matches exactly, such as seconds", () => {
    const seconds = plan({ unit: "seconds", current: 40, target: 30 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: seconds, outcomeClosure: measuredClosure(seconds, RELEASE_AUG, 35, { evidence: "s1" }) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: seconds, outcomeClosure: measuredClosure(seconds, RELEASE_AUG, 30, { evidence: "s2" }) }),
    ];
    const [line] = totalsOf(rows);
    expect(line.unit).toBe("seconds");
    expect(line.summed).toEqual({ count: 2, change: -15 });
  });
});

/** A Metric definition as the Metrics library resolves it for a Request's metric at `position` (0 the main metric). */
const ADOPTERS = { id: "def-adopters", name: "Adopters", unit: "count" as const };
const definedAs = (definition: { id: string; name: string; unit: ImpactDefinition["unit"] }, position = 0): ImpactDefinition => ({ position, ...definition });

/** A Request closed with a measured result `actual` on `expected`, its main metric resolved to `definition`. */
function closedRow(id: string, requestNumber: number, expected: ExpectedImpact, actual: number, definitions: ImpactDefinition[], over: Partial<ImpactRow> = {}): ImpactRow {
  return row({ id, requestNumber, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: expected, outcomeClosure: measuredClosure(expected, RELEASE_AUG, actual, { evidence: `evidence ${id}` }), definitions, ...over });
}

describe("impact read model: totals by Metric definition (#201)", () => {
  it("adds up results with the same definition, audience and window, whatever name each Request saved", () => {
    const builtIn = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const measured = builtIn as Extract<ExpectedImpact, { kind: "measurement" }>;
    const typed: ExpectedImpact = { ...measured, primary: { ...measured.primary, key: "custom", name: "Users adopting" } };
    const rows = [
      closedRow("a", 1, builtIn, 130, [definedAs(ADOPTERS)]),
      closedRow("b", 2, typed, 120, [definedAs(ADOPTERS)]),
    ];
    const lines = totalsOf(rows);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ definitionId: "def-adopters", metric: "Adopters", unit: "count", summed: { count: 2, change: 50 } });
  });

  it("keeps the same definition with a different audience or window on separate lines", () => {
    const all = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const newUsers = plan({ key: "adoption", unit: "count", current: 100, target: 150, audience: "new" });
    const longer = plan({ key: "adoption", unit: "count", current: 100, target: 150, windowDays: 90 });
    const rows = [
      closedRow("a", 1, all, 130, [definedAs(ADOPTERS)]),
      closedRow("b", 2, newUsers, 120, [definedAs(ADOPTERS)]),
      closedRow("c", 3, longer, 110, [definedAs(ADOPTERS)], { releaseState: releaseState(MEMBER, releaseFact("2026-08-10", "2026-11-08")), outcomeClosure: measuredClosure(longer, releaseFact("2026-08-10", "2026-11-08"), 110, { evidence: "evidence c" }) }),
    ];
    const lines = totalsOf(rows);
    expect(lines.map(line => [line.definitionId, line.audience, line.window, line.summed])).toEqual([
      ["def-adopters", "All users", "30 days after release", { count: 1, change: 30 }],
      ["def-adopters", "New users", "30 days after release", { count: 1, change: 20 }],
      ["def-adopters", "All users", "90 days after release", { count: 1, change: 10 }],
    ]);
  });

  it("never adds up two definitions with the same name", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      closedRow("a", 1, adoption, 130, [definedAs({ id: "def-signups-web", name: "Signups", unit: "count" })]),
      closedRow("b", 2, adoption, 120, [definedAs({ id: "def-signups-app", name: "Signups", unit: "count" })]),
    ];
    const lines = totalsOf(rows);
    expect(lines.map(line => [line.definitionId, line.metric, line.summed])).toEqual([
      ["def-signups-web", "Signups", { count: 1, change: 30 }],
      ["def-signups-app", "Signups", { count: 1, change: 20 }],
    ]);
  });

  it("never adds a metric the library can't place to a definition's line, even with the same name", () => {
    const typed: ExpectedImpact = { kind: "metric", metric: "Adopters", unit: "count", baseline: 100, target: 150, source: "Analytics", reviewAfterDays: 30 } as ExpectedImpact;
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      closedRow("a", 1, adoption, 130, [definedAs(ADOPTERS)]),
      closedRow("b", 2, typed, 120, []),
    ];
    const lines = totalsOf(rows);
    expect(lines.map(line => [line.definitionId, line.metric, line.count])).toEqual([["def-adopters", "Adopters", 1], [null, "Adopters", 1]]);
  });

  it("still adds up a result whose definition was archived, or merged into the one it now counts under", () => {
    // The library resolves an archived definition to itself and a merged-away one to the definition it was merged into.
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      closedRow("a", 1, adoption, 130, [definedAs({ id: "def-archived", name: "Weekly adopters", unit: "count" })]),
      closedRow("b", 2, adoption, 125, [definedAs({ id: "def-archived", name: "Weekly adopters", unit: "count" })]),
    ];
    const [line] = totalsOf(rows);
    expect(line).toMatchObject({ definitionId: "def-archived", metric: "Weekly adopters", summed: { count: 2, change: 55 } });
  });

  it("never sums a percentage definition, and labels its change in percentage points", () => {
    const conversion = { id: "def-conversion", name: "Checkout conversion", unit: "percent" as const };
    const rows = [
      closedRow("a", 1, plan(), 46, [definedAs(conversion)]),
      closedRow("b", 2, plan(), 44, [definedAs(conversion)]),
    ];
    const [line] = totalsOf(rows);
    expect(line).toMatchObject({ definitionId: "def-conversion", unit: "%", changeUnit: "percentage points", count: 2, summed: null, verdicts: null });
  });

  it("counts in the definition's unit, not the unit text the Request saved", () => {
    const legacy: ExpectedImpact = { kind: "metric", metric: "Signups", unit: "users", baseline: 100, target: 150, source: "Analytics", reviewAfterDays: 30 } as ExpectedImpact;
    const rows = [closedRow("a", 1, legacy, 130, [definedAs({ id: "def-signups", name: "Signups (users)", unit: "count" })])];
    const [line] = totalsOf(rows);
    expect(line).toMatchObject({ metric: "Signups (users)", unit: "count", changeUnit: "count", summed: { count: 1, change: 30 } });
  });

  it("tallies Pass/fail checks good or bad beside definitions, never summed", () => {
    const check = plan({ key: "check", unit: "count", current: null, target: null });
    const rows = [
      closedRow("a", 1, check, 0, [], { outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: true, evidence: "p1" }) }),
      closedRow("b", 2, check, 0, [], { outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: false, evidence: "p2" }) }),
    ];
    const [line] = totalsOf(rows);
    expect(line).toMatchObject({ definitionId: null, form: "pass_fail", verdicts: { good: 1, bad: 1 }, summed: null });
  });

  it("shows a renamed definition under its current name, on lines, My work and the report's Requests", () => {
    const trials = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const renamed = definedAs({ id: "def-trials", name: "Trials started", unit: "count" });
    const rows = [
      closedRow("a", 1, trials, 130, [renamed], { projectId: "p1", projectName: "Growth" }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT), expectedImpact: trials, definitions: [renamed], projectId: "p1", projectName: "Growth" }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "open", expectedImpact: trials, definitions: [renamed], projectId: "p1", projectName: "Growth" }),
    ];
    const dashboard = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW, period: YEAR_2026 });
    expect(dashboard.outcomeReport!.totals!.map(line => line.metric)).toEqual(["Trials started"]);
    expect(dashboard.myWork.requests.map(entry => entry.predicted?.metric)).toEqual(["Trials started", "Trials started", "Trials started"]);
    expect(dashboard.myWork.requests[0].result?.metric).toBe("Trials started");
    expect(dashboard.outcomeReport!.projects[0].requests.map(entry => [entry.requestNumber, entry.predicted?.definitionId, entry.predicted?.metric])).toEqual([[1, "def-trials", "Trials started"], [2, "def-trials", "Trials started"]]);
  });

  it("shows each guardrail under its definition's current name", () => {
    const guarded: ExpectedImpact = { ...plan(), guardrails: [
      { key: "support", definitionId: null, name: "", unit: "percent", current: 2, noBaseline: false, operator: "at_most", limit: 5 },
    ] } as ExpectedImpact;
    const closure = { ...measuredClosure(guarded, RELEASE_AUG, 46), guardrails: [{ metric: "Support contact rate", operator: "at_most" as const, limit: 5, unit: "%", actual: 3 }] };
    const rows = [closedRow("a", 1, guarded, 46, [definedAs({ id: "def-tickets", name: "Help tickets per user", unit: "percent" }, 1)], { outcomeClosure: closure })];
    const [result] = totalsOf(rows)[0].results;
    expect(result.guardrails).toEqual([{ definitionId: "def-tickets", metric: "Help tickets per user", operator: "at_most", limit: 5, unit: "%", actual: 3, held: true }]);
  });
});

describe("impact read model: Requests that used a Metric definition (#203)", () => {
  const TRIALS = { id: "def-trials", name: "Trials started", unit: "count" as const };
  const trials = plan({ key: "adoption", unit: "count", current: 100, target: 150 });

  it("groups the Requests that predicted it by Project, with predicted and actual side by side", () => {
    const rows = [
      closedRow("a", 1, trials, 130, [definedAs(TRIALS)], { projectId: "p2", projectName: "Onboarding" }),
      closedRow("b", 2, trials, 120, [definedAs(TRIALS)], { projectId: "p1", projectName: "Growth" }),
      closedRow("c", 3, trials, 110, [definedAs(TRIALS)]),
      closedRow("d", 4, trials, 140, [definedAs(TRIALS)], { projectId: "p1", projectName: "Growth" }),
      closedRow("e", 5, trials, 100, [definedAs(ADOPTERS)], { projectId: "p1", projectName: "Growth" }),
    ];
    const uses = buildDefinitionUses(MEMBER_VIEWER, rows, TRIALS.id, { now: NOW })!;
    expect(uses.main.map(group => [group.name, group.uses.map(use => use.requestNumber)])).toEqual([["Growth", [2, 4]], ["Onboarding", [1]], ["No Project", [3]]]);
    const [first] = uses.main[0].uses;
    expect(first.predicted).toMatchObject({ definitionId: TRIALS.id, metric: "Trials started", unit: "count", baseline: 100, target: 150, predictedChange: 50 });
    expect(first.outcome).toMatchObject({ kind: "measured", result: { actual: 120, change: 20 } });
  });

  it("shows a Request still waiting for its result as still due, with its due date once released, never as zero", () => {
    const exception: OutcomeException = {
      version: 1, kind: "exception", reasonCode: "rolled_back", reason: "Rolled back after a day",
      actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-x", fingerprint: "fp",
      release: RELEASE_AUG, revision: 1,
    };
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT), expectedImpact: trials, definitions: [definedAs(TRIALS)] }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "open", expectedImpact: trials, definitions: [definedAs(TRIALS)] }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: trials, exceptionClosure: exception, definitions: [definedAs(TRIALS)] }),
    ];
    const [group] = buildDefinitionUses(MEMBER_VIEWER, rows, TRIALS.id, { now: NOW })!.main;
    expect(group.uses.map(use => use.outcome)).toEqual([
      { kind: "still_due", due: { dueDate: "2026-10-31", dueLabel: "Due in 8 days" } },
      { kind: "still_due", due: null },
      { kind: "closed_without_result", reason: "Rolled back after a day" },
    ]);
    expect(group.uses[0].predicted).toMatchObject({ metric: "Trials started", target: 150 });
  });

  it("lists guardrail uses apart from main-metric uses, each limit beside what was measured", () => {
    const guardedBy = (limit: number): ExpectedImpact => ({ ...plan(), guardrails: [
      { key: "events", definitionId: null, name: "", unit: "count", current: 10, noBaseline: false, operator: "at_most", limit },
    ] } as ExpectedImpact);
    const closure = { ...measuredClosure(guardedBy(200), RELEASE_AUG, 46), guardrails: [{ metric: "Action count", operator: "at_most" as const, limit: 200, unit: "count", actual: 240 }] };
    const conversion = definedAs({ id: "def-conversion", name: "Checkout conversion", unit: "percent" });
    const rows = [
      closedRow("a", 1, trials, 130, [definedAs(TRIALS)]),
      closedRow("b", 2, guardedBy(200), 46, [conversion, definedAs(TRIALS, 1)], { outcomeClosure: closure, projectId: "p1", projectName: "Growth" }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "open", expectedImpact: guardedBy(300), definitions: [conversion, definedAs(TRIALS, 1)] }),
    ];
    const uses = buildDefinitionUses(MEMBER_VIEWER, rows, TRIALS.id, { now: NOW })!;
    expect(uses.main.flatMap(group => group.uses.map(use => use.requestNumber))).toEqual([1]);
    expect(uses.guardrails.map(group => [group.name, group.uses.map(use => use.requestNumber)])).toEqual([["Growth", [2]], ["No Project", [3]]]);
    expect(uses.guardrails[0].uses[0]).toMatchObject({
      mainMetric: "Checkout conversion",
      limit: { operator: "at_most", limit: 200, unit: "count" },
      outcome: { kind: "measured", actual: 240, held: false },
    });
    expect(uses.guardrails[1].uses[0]).toMatchObject({ limit: { limit: 300 }, outcome: { kind: "still_due", due: null } });
  });

  it("gives every non-guest the same list, keeps it inside the workspace, and gives a guest none", () => {
    const rows = [
      closedRow("a", 1, trials, 130, [definedAs(TRIALS)], { createdBy: ADMIN, assignedTo: MEMBER }),
      closedRow("b", 2, trials, 120, [definedAs(TRIALS)], { createdBy: GUEST }),
      closedRow("c", 3, trials, 120, [definedAs(TRIALS)], { orgId: "org_other" }),
    ];
    const admin = buildDefinitionUses(ADMIN_VIEWER, rows, TRIALS.id, { now: NOW })!;
    expect(admin.main.flatMap(group => group.uses.map(use => use.requestNumber))).toEqual([1, 2]);
    expect(buildDefinitionUses(MEMBER_VIEWER, rows, TRIALS.id, { now: NOW })).toEqual(admin);
    expect(buildDefinitionUses(LEADER_VIEWER, rows, TRIALS.id, { now: NOW })).toEqual(admin);
    expect(buildDefinitionUses(GUEST_VIEWER, rows, TRIALS.id, { now: NOW })).toBeNull();
  });

  it("names, groups and totals nobody", () => {
    const rows = [
      closedRow("a", 1, trials, 130, [definedAs(TRIALS)], { createdBy: ADMIN, assignedTo: MEMBER, projectId: "p1", projectName: "Growth" }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, assignedTo: ADMIN, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT), expectedImpact: trials, definitions: [definedAs(TRIALS)] }),
    ];
    const uses = buildDefinitionUses(MEMBER_VIEWER, rows, TRIALS.id, { now: NOW })!;
    expect(keysOf(uses).filter(key => /total|average|score|rank|mean|sum|person|people|user|createdBy|assignedTo|owner|actor|role/i.test(key))).toEqual([]);
    expect(JSON.stringify(uses)).not.toMatch(new RegExp([ADMIN, MEMBER, "user_requester"].join("|")));
  });

  it("includes Requests whose metric now counts under it after a merge, under its current name", () => {
    // The Metrics library resolves a merged-away definition to the one it was merged into, so that one lists both.
    const typed: ExpectedImpact = { kind: "metric", metric: "Trial signups", unit: "count", baseline: 100, target: 150, source: "Analytics", reviewAfterDays: 30 } as ExpectedImpact;
    const rows = [
      closedRow("a", 1, trials, 130, [definedAs(TRIALS)]),
      closedRow("b", 2, typed, 125, [definedAs(TRIALS)]),
    ];
    const [group] = buildDefinitionUses(MEMBER_VIEWER, rows, TRIALS.id, { now: NOW })!.main;
    expect(group.uses.map(use => [use.requestNumber, use.predicted.metric])).toEqual([[1, "Trials started"], [2, "Trials started"]]);
  });
});

describe("impact read model: follow-up Requests (#151 review, US7)", () => {
  it("lists on each Request the follow-up Requests linked to it", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, followUpOf: "a" }),
    ];
    const mine = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW }).myWork.requests;
    expect(mine.find(entry => entry.requestNumber === 1)!.followUps).toEqual([{ requestId: "b", requestNumber: 2, title: "Request 2" }]);
    expect(mine.find(entry => entry.requestNumber === 2)!.followUps).toEqual([]);
  });

  it("never lists a follow-up a guest cannot see", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: GUEST }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, followUpOf: "a" }),
    ];
    expect(buildImpactDashboard(GUEST_VIEWER, rows, { now: NOW }).myWork.requests[0].followUps).toEqual([]);
  });
});

describe("impact read model: output rules", () => {
  it("never produces a per-person total, average, score or ranking", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, assignedTo: ADMIN, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130) }),
      row({ id: "b", requestNumber: 2, createdBy: ADMIN, status: "done", releaseState: releaseState(ADMIN, RELEASE_OCT) }),
      row({ id: "c", requestNumber: 3, createdBy: ADMIN, noMeasurableImpactReason: "Ops", expectedImpact: null }),
    ];
    for (const who of [ADMIN_VIEWER, MEMBER_VIEWER, GUEST_VIEWER]) {
      const dashboard = buildImpactDashboard(who, rows, { now: NOW, period: YEAR_2026 });
      // The report's own totals are the workspace's, by Metric definition; nothing anywhere is totalled by person.
      expect(keysOf(dashboard.myWork).filter(key => /total|average|score|rank|mean/i.test(key))).toEqual([]);
      expect(keysOf(dashboard.outcomeReport).filter(key => /average|score|rank|mean|person|people|createdBy|assignedTo/i.test(key))).toEqual([]);
    }
  });
});

describe("impact read model: a teammate's list (#155, spec story 12)", () => {
  it("lists the Requests a teammate requested or picked up, with their role, for a non-guest viewer", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, assignedTo: ADMIN }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, assignedTo: MEMBER }),
      row({ id: "c", requestNumber: 3, createdBy: ADMIN }),
    ];
    const theirs = buildTeammateWork(ADMIN_VIEWER, rows, MEMBER, { now: NOW });
    expect(theirs?.map(entry => [entry.requestNumber, entry.role])).toEqual([[1, "requester"], [2, "both"]]);
    const seenByLeader = buildTeammateWork(LEADER_VIEWER, rows, ADMIN, { now: NOW });
    expect(seenByLeader?.map(entry => [entry.requestNumber, entry.role])).toEqual([[1, "picker"], [3, "requester"]]);
  });

  it("shows a teammate's results in the same entry shape as My work, with no totals, averages, scores or rankings", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, assignedTo: ADMIN, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) }),
    ];
    const theirs = buildTeammateWork(MEMBER_VIEWER, rows, ADMIN, { now: NOW })!;
    expect(theirs[0].result).toMatchObject({ actual: 130, predictedTarget: 150, window: "30 days after release" });
    expect(keysOf(theirs).filter(key => /total|average|score|rank|mean|count/i.test(key))).toEqual([]);
  });

  it("gives a guest no teammate list, and hides other people's Requests from a guest who asks for one", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, assignedTo: GUEST })];
    expect(buildTeammateWork(GUEST_VIEWER, rows, MEMBER, { now: NOW })).toBeNull();
  });

  it("lists the teammates a non-guest can open: everyone who requested or picked up a visible Request, not the viewer", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, assignedTo: ADMIN }),
      row({ id: "b", requestNumber: 2, createdBy: ADMIN, assignedTo: "user_picker" }),
      row({ id: "c", requestNumber: 3, createdBy: "user_elsewhere", orgId: "org_other", assignedTo: "user_outsider" }),
    ];
    expect(teammateIdsOf(ADMIN_VIEWER, rows)).toEqual([MEMBER, "user_picker"]);
    expect(teammateIdsOf(MEMBER_VIEWER, rows)).toEqual([ADMIN, "user_picker"]);
  });

  it("gives a guest no list of teammates", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, assignedTo: GUEST })];
    expect(teammateIdsOf(GUEST_VIEWER, rows)).toBeNull();
  });

  it("keeps a teammate's list inside the viewer's workspace", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, orgId: "org_other" })];
    expect(buildTeammateWork(MEMBER_VIEWER, rows, MEMBER, { now: NOW })).toEqual([]);
  });
});

describe("impact read model: value before release (#151 decision 3)", () => {
  it("measures change from the value recorded before release, and keeps the planned baseline visible", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: recordedState(MEMBER, RELEASE_AUG, 42), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) })];
    const [result] = totalsOf(rows)[0].results;
    expect(result).toMatchObject({ baselineState: "known", baseline: 42, baselineSource: "release", plannedBaseline: 40, actual: 46, change: 4, predictedChange: 10 });
  });

  it("falls back to the planning baseline for a release recorded before this change, and says so", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) })];
    const [result] = totalsOf(rows)[0].results;
    expect(result).toMatchObject({ baseline: 40, baselineSource: "planning", plannedBaseline: 40, actual: 46, change: 6 });
  });

  it("gives a new capability no change and no baseline, whatever the release recorded", () => {
    const newCapability = plan({ current: null, target: 25, noBaseline: true });
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: recordedState(MEMBER, RELEASE_AUG, 42), outcomeClosure: measuredClosure(newCapability, RELEASE_AUG, 20) })];
    const [result] = totalsOf(rows)[0].results;
    expect(result).toMatchObject({ baselineState: "new_capability", baseline: null, baselineSource: null, change: null, plannedBaseline: null });
  });
});

describe("Outcome report (#208): periods", () => {
  const released = (id: string, requestNumber: number, exposureDate: string) => {
    const release = releaseFact(exposureDate, exposureDate);
    return row({ id, requestNumber, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, release), outcomeClosure: measuredClosure(plan(), release, 46, { evidence: `e${id}` }) });
  };
  const rows = [
    released("a", 1, "2026-06-30"),
    released("b", 2, "2026-07-01"),
    released("c", 3, "2026-08-31"),
    released("d", 4, "2025-12-31"),
    row({ id: "e", requestNumber: 5, createdBy: MEMBER, status: "done", releaseState: null }),
  ];
  const shown = (period: ImpactPeriod) => buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period })!.projects.flatMap(section => requestIds(section.requests));

  it("lists only the work Released in the chosen month, quarter or year, by its UTC release date", () => {
    expect(shown({ kind: "month", year: 2026, month: 7 })).toEqual([2]);
    expect(shown({ kind: "month", year: 2026, month: 6 })).toEqual([1]);
    expect(shown({ kind: "quarter", year: 2026, quarter: 3 })).toEqual([2, 3]);
    expect(shown({ kind: "year", year: 2026 })).toEqual([1, 2, 3]);
    expect(shown({ kind: "year", year: 2025 })).toEqual([4]);
  });

  it("reports the current quarter when no period is chosen, and says which period it shows", () => {
    expect(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW })!.period).toEqual({ kind: "quarter", year: 2026, quarter: 4 });
    expect(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: { kind: "month", year: 2026, month: 7 } })!.period).toEqual({ kind: "month", year: 2026, month: 7 });
  });
});

/** Closed without a result for `reasonCode`, on the August release unless `release` says otherwise. */
function exceptionClosure(reasonCode: OutcomeException["reasonCode"], reason: string, release: ReleaseFact | null = RELEASE_AUG): OutcomeException {
  return { version: 1, kind: "exception", reasonCode, reason, actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-09-10T09:00:00.000Z", operationId: `op-${reasonCode}-${reason}`, fingerprint: "fp", release, revision: 1 };
}

const Q3: ImpactPeriod = { kind: "quarter", year: 2026, quarter: 3 };
const AUGUST: ImpactPeriod = { kind: "month", year: 2026, month: 8 };

describe("Outcome report (#208): up to date and at a glance", () => {
  it("says the date it is up to date as of, and counts what shipped, was measured, is still due or closed without a result", () => {
    const measuredAug = (id: string, requestNumber: number) => closedRow(id, requestNumber, plan(), 46, []);
    const stillDue = (id: string, requestNumber: number) => row({ id, requestNumber, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG) });
    const rows = [
      measuredAug("a", 1),
      measuredAug("b", 2),
      stillDue("c", 3),
      row({ id: "d", requestNumber: 4, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: exceptionClosure("rolled_back", "Broke checkout") }),
      // Closed without a result (10 Sep) before it was ever Released: it never shipped, but it was closed in Q3.
      row({ id: "e", requestNumber: 5, createdBy: MEMBER, status: "in_progress", exceptionClosure: exceptionClosure("other", "Dropped", null) }),
      // Released in October, outside the period.
      row({ id: "f", requestNumber: 6, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) }),
      // Not Released at all.
      row({ id: "g", requestNumber: 7, createdBy: MEMBER, status: "open" }),
    ];
    const report = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!;
    expect(report.asOf).toBe("2026-10-23");
    expect(report.atAGlance).toEqual({ shipped: 4, measured: 2, stillDue: 1, closedWithoutResult: 2 });
  });

  it("counts Released operational work as shipped but never as still due, since it is never measured", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: null, noMeasurableImpactReason: "Design token rename" })];
    expect(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!.atAGlance).toEqual({ shipped: 1, measured: 0, stillDue: 0, closedWithoutResult: 0 });
  });
});

describe("Outcome report: closed without a result before any Release (decision 2026-10-26)", () => {
  const unreleased = (id: string, requestNumber: number, closedAt: string) =>
    row({ id, requestNumber, createdBy: MEMBER, status: "in_progress", exceptionClosure: { ...exceptionClosure("rolled_back", `Dropped ${id}`, null), closedAt } });

  it("lists it under Closed without a result in the period it was closed, never as shipped or in a total", () => {
    const rows = [unreleased("a", 1, "2026-09-30T23:30:00.000Z"), unreleased("b", 2, "2026-10-01T00:30:00.000Z"), closedRow("c", 3, plan(), 46, [])];
    const q3 = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!;
    expect(q3.atAGlance).toEqual({ shipped: 1, measured: 1, stillDue: 0, closedWithoutResult: 1 });
    expect(q3.closedWithoutResult).toMatchObject([{ reasonCode: "rolled_back", requests: [{ requestNumber: 1, releaseDate: null, closedOn: "2026-09-30", reason: "Dropped a" }] }]);
    expect(q3.projects.flatMap(section => requestIds(section.requests))).toEqual([3]);
    expect(q3.totals!.flatMap(line => line.results.map(result => result.requestNumber))).toEqual([3]);
    const q4 = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 4 } })!;
    expect(q4.atAGlance).toEqual({ shipped: 0, measured: 0, stillDue: 0, closedWithoutResult: 1 });
    expect(q4.closedWithoutResult[0].requests.map(item => item.requestNumber)).toEqual([2]);
  });

  it("keeps Released work closed without a result in its release's period, whenever it was closed", () => {
    const released = row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: { ...exceptionClosure("rolled_back", "Broke Safari"), closedAt: "2026-10-05T09:00:00.000Z" } });
    expect(buildOutcomeReport(MEMBER_VIEWER, [released], { now: NOW, period: Q3 })!.closedWithoutResult[0].requests[0]).toMatchObject({ releaseDate: "2026-08-10", closedOn: "2026-10-05" });
    expect(buildOutcomeReport(MEMBER_VIEWER, [released], { now: NOW, period: { kind: "quarter", year: 2026, quarter: 4 } })!.closedWithoutResult).toEqual([]);
  });

  it("isn't an empty report when the only thing in the period was closed before any Release", () => {
    expect(buildOutcomeReport(MEMBER_VIEWER, [unreleased("a", 1, "2026-09-30T12:00:00.000Z")], { now: NOW, period: Q3 })!.emptyMessage).toBeNull();
  });
});

describe("Outcome report (#208): totals", () => {
  const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
  const rows = [
    closedRow("a", 1, adoption, 130, [definedAs(ADOPTERS)]),
    closedRow("b", 2, adoption, 120, [definedAs(ADOPTERS)]),
    closedRow("c", 3, plan(), 46, []),
    closedRow("d", 4, plan(), 44, []),
  ];

  it("totals a quarter and a year by the #151 rules and the Metrics library match", () => {
    for (const period of [Q3, { kind: "year", year: 2026 } as const]) {
      const totals = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period })!.totals!;
      expect(totals.map(line => [line.definitionId, line.metric, line.count, line.summed])).toEqual([
        ["def-adopters", "Adopters", 2, { count: 2, change: 50 }],
        [null, "Conversion rate", 2, null],
      ]);
    }
  });

  it("gives a month no totals at all, even with results in it", () => {
    const report = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: AUGUST })!;
    expect(report.totals).toBeNull();
    expect(report.atAGlance.measured).toBe(4);
  });

  it("counts a merged definition's results under the definition it was merged into", () => {
    // The Metrics library resolves a merged-away definition to the one it was merged into.
    const typed: ExpectedImpact = { kind: "metric", metric: "Weekly adopters", unit: "count", baseline: 100, target: 150, source: "Analytics", reviewAfterDays: 30 } as ExpectedImpact;
    const merged = [closedRow("a", 1, adoption, 130, [definedAs(ADOPTERS)]), closedRow("b", 2, typed, 125, [definedAs(ADOPTERS)])];
    const [line] = buildOutcomeReport(MEMBER_VIEWER, merged, { now: NOW, period: Q3 })!.totals!;
    expect(line).toMatchObject({ definitionId: ADOPTERS.id, metric: "Adopters", summed: { count: 2, change: 55 } });
  });

  it("leaves out of every total work closed without a result, operational work and results still due", () => {
    const others = [
      row({ id: "x", requestNumber: 5, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, definitions: [definedAs(ADOPTERS)], exceptionClosure: exceptionClosure("cannot_measure", "No data") }),
      row({ id: "y", requestNumber: 6, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: null, noMeasurableImpactReason: "Copy fix" }),
      row({ id: "z", requestNumber: 7, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, definitions: [definedAs(ADOPTERS)] }),
    ];
    expect(buildOutcomeReport(MEMBER_VIEWER, others, { now: NOW, period: Q3 })!.totals).toEqual([]);
  });
});

describe("Outcome report (#208): Project sections and each Request", () => {
  it("puts each Request under its current Project, Projects A to Z, then No Project", () => {
    const rows = [
      closedRow("a", 1, plan(), 46, [], { projectId: "p2", projectName: "Search" }),
      closedRow("b", 2, plan(), 44, []),
      closedRow("c", 3, plan(), 45, [], { projectId: "p1", projectName: "Onboarding" }),
      closedRow("d", 4, plan(), 47, [], { projectId: "p2", projectName: "Search" }),
    ];
    const { projects } = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!;
    expect(projects.map(section => [section.projectId, section.name, requestIds(section.requests)])).toEqual([
      ["p1", "Onboarding", [3]],
      ["p2", "Search", [1, 4]],
      [null, "No Project", [2]],
    ]);
  });

  it("shows a measured Request's problem, prediction, actual result and guardrails", () => {
    const guarded: ExpectedImpact = { ...plan(), guardrails: [
      { key: "support", definitionId: null, name: "", unit: "percent", current: 2, noBaseline: false, operator: "at_most", limit: 5 },
    ] } as ExpectedImpact;
    const closure = { ...measuredClosure(guarded, RELEASE_AUG, 46), guardrails: [{ metric: "Support contact rate", operator: "at_most" as const, limit: 5, unit: "%", actual: 7 }] };
    const rows = [closedRow("a", 1, guarded, 46, [], { problem: "Shoppers abandon checkout at the address step", outcomeClosure: closure })];
    const [entry] = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!.projects[0].requests;
    expect(entry).toMatchObject({ requestNumber: 1, problem: "Shoppers abandon checkout at the address step", releaseDate: "2026-08-10", journey: "Closed" });
    expect(entry.predicted).toMatchObject({ metric: "Conversion rate", baseline: 40, target: 50, predictedChange: 10 });
    expect(entry.outcome).toMatchObject({ kind: "measured", result: { actual: 46, change: 6 } });
    expect(entry.guardrails).toEqual([{ definitionId: null, metric: "Support contact rate", operator: "at_most", limit: 5, unit: "%", actual: 7, held: false }]);
  });

  it("shows a Request still waiting for its result with its prediction, guardrail limits and the date the result is due", () => {
    const guarded: ExpectedImpact = { ...plan(), guardrails: [
      { key: "support", definitionId: null, name: "", unit: "percent", current: 2, noBaseline: false, operator: "at_most", limit: 5 },
    ] } as ExpectedImpact;
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT), expectedImpact: guarded })];
    const [entry] = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW })!.projects[0].requests;
    expect(entry).toMatchObject({ journey: "Measuring", predicted: { metric: "Conversion rate", target: 50 } });
    expect(entry.outcome).toEqual({ kind: "still_due", dueDate: "2026-10-31", dueLabel: "Due in 8 days" });
    expect(entry.guardrails).toEqual([{ definitionId: null, metric: "Support contact rate", operator: "at_most", limit: 5, unit: "%", actual: null, held: null }]);
  });

  it("shows Released operational work with its reason and no prediction", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: null, noMeasurableImpactReason: "Design token rename" })];
    const [entry] = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!.projects[0].requests;
    expect(entry).toMatchObject({ predicted: null, outcome: { kind: "operational", reason: "Design token rename" }, guardrails: [] });
  });

  it("lists each Request's Follow-up Requests, whenever they were made", () => {
    const rows = [
      closedRow("a", 1, plan(), 46, []),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, followUpOf: "a" }),
    ];
    const [entry] = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!.projects[0].requests;
    expect(entry.followUps).toEqual([{ requestId: "b", requestNumber: 2, title: "Request 2" }]);
  });
});

describe("Outcome report (#208): closed without a result and corrections", () => {
  const closedWithout = (id: string, requestNumber: number, exception: OutcomeException, over: Partial<ImpactRow> = {}) =>
    row({ id, requestNumber, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: exception, ...over });

  it("lists Released work closed without a result by reason, Rolled back, Can't be measured, then Other, outside the Project sections", () => {
    const rows = [
      closedWithout("a", 1, exceptionClosure("other", "Superseded by a redesign"), { projectId: "p1", projectName: "Search" }),
      closedWithout("b", 2, exceptionClosure("rolled_back", "Broke checkout on Safari")),
      closedWithout("c", 3, exceptionClosure("cannot_measure", "No event data")),
      closedWithout("d", 4, exceptionClosure("rolled_back", "Slowed the page")),
      closedRow("e", 5, plan(), 46, []),
    ];
    const report = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!;
    expect(report.closedWithoutResult.map(group => [group.reasonCode, group.label, requestIds(group.requests)])).toEqual([
      ["rolled_back", "Rolled back", [2, 4]],
      ["cannot_measure", "Can’t be measured", [3]],
      ["other", "Other", [1]],
    ]);
    expect(report.closedWithoutResult[2].requests[0]).toMatchObject({ problem: "Problem 1", projectName: "Search", reason: "Superseded by a redesign", releaseDate: "2026-08-10" });
    expect(report.projects.flatMap(section => requestIds(section.requests))).toEqual([5]);
  });

  it("leaves out a reason no Released work was closed for", () => {
    const rows = [closedWithout("a", 1, exceptionClosure("cannot_measure", "No event data"))];
    expect(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!.closedWithoutResult.map(group => group.reasonCode)).toEqual(["cannot_measure"]);
  });

  it("marks a corrected value as corrected, showing the latest Correction for each field", () => {
    const correction = (field: ClosureCorrection["field"], text: string, at: string, revision: number): ClosureCorrection => ({ operationId: `op-${revision}`, fingerprint: "fc", actorId: MEMBER, at, field, correction: text, reason: "Wrong export", revision });
    const rows = [
      closedRow("a", 1, plan(), 46, [], { closureCorrections: [
        correction("actual", "47%", "2026-09-12T09:00:00.000Z", 2),
        correction("evidence", "Warehouse query", "2026-09-13T09:00:00.000Z", 3),
        correction("actual", "48%", "2026-09-14T09:00:00.000Z", 4),
      ] }),
      closedWithout("b", 2, exceptionClosure("other", "Dropped"), { closureCorrections: [correction("reason", "Merged into LAN-9", "2026-09-12T09:00:00.000Z", 2)] }),
    ];
    const report = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!;
    const [entry] = report.projects[0].requests;
    expect(entry.corrected).toEqual([
      { field: "actual", label: "Actual result", value: "48%", at: "2026-09-14T09:00:00.000Z" },
      { field: "evidence", label: "Evidence", value: "Warehouse query", at: "2026-09-13T09:00:00.000Z" },
    ]);
    // Text-only Corrections (from before corrected values were recorded) leave the closing value counted.
    expect(entry.outcome).toMatchObject({ kind: "measured", result: { actual: 46, correctedFrom: null } });
    expect(report.closedWithoutResult[0].requests[0]).toMatchObject({ reason: "Dropped", corrected: [{ field: "reason", label: "Reason", value: "Merged into LAN-9" }] });
  });
});

describe("Outcome report: a corrected result counts at its corrected value (decision 2026-10-26)", () => {
  const corrected = (value: ClosureCorrection["value"], revision = 2, text = "Re-ran the export"): ClosureCorrection =>
    ({ operationId: `op-v${revision}`, fingerprint: "fc", actorId: MEMBER, at: `2026-09-1${revision}T09:00:00.000Z`, field: "actual", correction: text, reason: "Wrong export", value, revision });
  const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });

  it("counts the latest corrected value in the totals, marked corrected, with the value recorded at closing kept", () => {
    const rows = [
      closedRow("a", 1, adoption, 130, [definedAs(ADOPTERS)], { closureCorrections: [corrected({ kind: "numeric", actual: 140 }, 2), corrected({ kind: "numeric", actual: 135 }, 3)] }),
      closedRow("b", 2, adoption, 120, [definedAs(ADOPTERS)]),
    ];
    const [line] = totalsOf(rows, Q3);
    // 135 - 100 corrected, plus 120 - 100 as recorded.
    expect(line.summed).toEqual({ count: 2, change: 55 });
    expect(line.results.map(result => [result.requestNumber, result.actual, result.change, result.correctedFrom])).toEqual([
      [1, 135, 35, { actual: 130, verdict: null }],
      [2, 120, 20, null],
    ]);
  });

  it("shows the corrected value on the report's Request, and not again among its corrected text", () => {
    const rows = [closedRow("a", 1, adoption, 130, [definedAs(ADOPTERS)], { closureCorrections: [corrected({ kind: "numeric", actual: 140 }, 2, "It was 140")] })];
    const [entry] = reportEntries(rows, Q3);
    expect(entry.outcome).toMatchObject({ kind: "measured", result: { actual: 140, change: 40, correctedFrom: { actual: 130 } } });
    expect(entry.corrected).toEqual([]);
  });

  it("tallies a Pass/fail check at its corrected answer", () => {
    const check = plan({ key: "check" });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: check, outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: false, evidence: "a" }), closureCorrections: [corrected({ kind: "pass_fail", passed: true })] }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: check, outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: false, evidence: "b" }) }),
    ];
    const [line] = totalsOf(rows, Q3);
    expect(line.verdicts).toEqual({ good: 1, bad: 1 });
    expect(line.results[0]).toMatchObject({ verdict: "good", correctedFrom: { actual: null, verdict: "bad" } });
  });

  it("keeps counting the closing value after a text-only Correction of the actual result", () => {
    const rows = [closedRow("a", 1, adoption, 130, [definedAs(ADOPTERS)], { closureCorrections: [{ ...corrected(undefined, 2), value: undefined }] })];
    expect(totalsOf(rows, Q3)[0].summed).toEqual({ count: 1, change: 30 });
  });
});

describe("Outcome report (#208): who sees it, and empty periods", () => {
  const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
  const rows = [
    closedRow("a", 1, adoption, 130, [definedAs(ADOPTERS)], { createdBy: ADMIN, assignedTo: MEMBER, projectId: "p1", projectName: "Growth" }),
    closedRow("b", 2, adoption, 120, [definedAs(ADOPTERS)], { createdBy: GUEST, assignedTo: ADMIN }),
    row({ id: "c", requestNumber: 3, createdBy: MEMBER, assignedTo: ADMIN, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: exceptionClosure("rolled_back", "Broke checkout") }),
    row({ id: "d", requestNumber: 4, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT), followUpOf: "a" }),
    closedRow("e", 5, adoption, 110, [definedAs(ADOPTERS)], { orgId: "org_other" }),
  ];

  it("gives a guest nothing, and every other role the same report of the whole workspace", () => {
    expect(buildOutcomeReport(GUEST_VIEWER, rows, { now: NOW, period: Q3 })).toBeNull();
    const admin = buildOutcomeReport(ADMIN_VIEWER, rows, { now: NOW, period: Q3 })!;
    expect(admin.projects.flatMap(section => requestIds(section.requests))).toEqual([1, 2]);
    expect(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })).toEqual(admin);
    expect(buildOutcomeReport(LEADER_VIEWER, rows, { now: NOW, period: Q3 })).toEqual(admin);
  });

  it("gives a Viewer (#210) the same report and teammate lists a Member gets", () => {
    const reader = viewer("user_company_leader", "viewer");
    expect(buildOutcomeReport(reader, rows, { now: NOW, period: Q3 })).toEqual(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 }));
    expect(teammateIdsOf(reader, rows)).toEqual(expect.arrayContaining([ADMIN, MEMBER]));
    expect(buildTeammateWork(reader, rows, MEMBER, { now: NOW })).toEqual(buildTeammateWork(ADMIN_VIEWER, rows, MEMBER, { now: NOW }));
    expect(buildDefinitionUses(reader, rows, ADOPTERS.id, { now: NOW })).toEqual(buildDefinitionUses(MEMBER_VIEWER, rows, ADOPTERS.id, { now: NOW }));
  });

  it("gives a guest no Outcome report on the Impact page", () => {
    expect(buildImpactDashboard(GUEST_VIEWER, rows, { now: NOW, period: Q3 }).outcomeReport).toBeNull();
    expect(buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW, period: Q3 }).outcomeReport).toEqual(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 }));
  });

  it("names, groups and ranks nobody", () => {
    for (const period of [Q3, AUGUST, { kind: "year", year: 2026 } as const]) {
      const report = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period })!;
      expect(keysOf(report).filter(key => /average|score|rank|mean|person|people|user|createdBy|assignedTo|owner|actor|role|requester|picker/i.test(key))).toEqual([]);
      expect(JSON.stringify(report)).not.toMatch(new RegExp([ADMIN, MEMBER, GUEST, "user_requester"].join("|")));
    }
  });

  it("says plainly when nothing was Released in the period", () => {
    const empty = buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 1 } })!;
    expect(empty).toMatchObject({ atAGlance: { shipped: 0, measured: 0, stillDue: 0, closedWithoutResult: 0 }, totals: [], projects: [], closedWithoutResult: [] });
    expect(empty.emptyMessage).toBe("Nothing was Released in Q1 2026.");
    expect(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: { kind: "month", year: 2026, month: 2 } })!.emptyMessage).toBe("Nothing was Released in February 2026.");
    expect(buildOutcomeReport(MEMBER_VIEWER, rows, { now: NOW, period: Q3 })!.emptyMessage).toBeNull();
  });
});

describe("Outcome report (#209): What we learned", () => {
  const learnedCorrection = (text: string, revision: number): ClosureCorrection => ({ operationId: `op-l${revision}`, fingerprint: "fc", actorId: MEMBER, at: `2026-09-1${revision}T09:00:00.000Z`, field: "learned", correction: text, reason: "Clearer", revision });
  const withLearned = (id: string, requestNumber: number, learned: string | undefined, corrections: ClosureCorrection[] = []) => {
    const closed = closedRow(id, requestNumber, plan(), 46, []);
    return { ...closed, outcomeClosure: { ...closed.outcomeClosure!, ...(learned ? { learned } : {}) }, closureCorrections: corrections };
  };

  it("shows each Request's What we learned line, or none when it wasn't given", () => {
    const [first, second] = reportEntries([withLearned("a", 1, "Shorter forms convert"), withLearned("b", 2, undefined)], Q3);
    expect(first.learned).toEqual({ text: "Shorter forms convert", corrected: false });
    expect(second.learned).toBeNull();
  });

  it("shows the latest Correction marked corrected, and keeps it out of the other corrected values", () => {
    const rows = [
      withLearned("a", 1, "First wording", [learnedCorrection("Second wording", 2), learnedCorrection("Third wording", 3)]),
      withLearned("b", 2, undefined, [learnedCorrection("Added by a Correction", 2)]),
    ];
    const [first, second] = reportEntries(rows, Q3);
    expect(first.learned).toEqual({ text: "Third wording", corrected: true });
    expect(first.corrected).toEqual([]);
    expect(second.learned).toEqual({ text: "Added by a Correction", corrected: true });
  });

  it("shows What we learned on work closed without a result", () => {
    const rolledBack = row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: { ...exceptionClosure("rolled_back", "Broke Safari"), learned: "Test on Safari first" } });
    const [group] = buildOutcomeReport(MEMBER_VIEWER, [rolledBack], { now: NOW, period: Q3 })!.closedWithoutResult;
    expect(group.requests[0].learned).toEqual({ text: "Test on Safari first", corrected: false });
  });
});

describe("Outcome report (#209): Quarter notes", () => {
  const note = (year: number, quarter: 1 | 2 | 3 | 4, text: string) => ({ year, quarter, text, editorName: "Ada Admin", editedAt: `${year}-0${quarter * 3}-15T10:00:00.000Z` });
  const notes = [note(2026, 1, "Winter"), note(2026, 3, "Checkout rebuilt"), note(2025, 3, "Last year")];
  const report = (period: ImpactPeriod, quarterNotes = notes) => buildOutcomeReport(MEMBER_VIEWER, [], { now: NOW, period, quarterNotes })!;

  it("ends a quarter's report with that quarter's note, its last editor and edit time", () => {
    expect(report(Q3).quarterNotes).toEqual([
      { year: 2026, quarter: 3, label: "Q3 2026", note: { text: "Checkout rebuilt", editorName: "Ada Admin", editedAt: "2026-09-15T10:00:00.000Z" } },
    ]);
  });

  it("gives a quarter with no note an empty place for one", () => {
    expect(report({ kind: "quarter", year: 2026, quarter: 2 }).quarterNotes).toEqual([{ year: 2026, quarter: 2, label: "Q2 2026", note: null }]);
  });

  it("shows all four of a year's notes in order, empty ones included", () => {
    expect(report(YEAR_2026).quarterNotes.map(slot => [slot.label, slot.note?.text ?? null])).toEqual([
      ["Q1 2026", "Winter"], ["Q2 2026", null], ["Q3 2026", "Checkout rebuilt"], ["Q4 2026", null],
    ]);
  });

  it("shows no Quarter note on a month", () => {
    expect(report(AUGUST).quarterNotes).toEqual([]);
  });

  it("shows the note even when nothing was Released, and to every role except a guest", () => {
    expect(report(Q3).emptyMessage).toBe("Nothing was Released in Q3 2026.");
    expect(buildOutcomeReport(ADMIN_VIEWER, [], { now: NOW, period: Q3, quarterNotes: notes })).toEqual(report(Q3));
    expect(buildOutcomeReport(GUEST_VIEWER, [], { now: NOW, period: Q3, quarterNotes: notes })).toBeNull();
  });
});

describe("Same problem iterations (#218)", () => {
  const GROUP = "group-checkout";
  const VIEWER_ROLE = viewer("user_viewer", "viewer");
  const rolledBack = (id: string, requestNumber: number, over: Partial<ImpactRow> = {}) =>
    row({ id, requestNumber, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: exceptionClosure("rolled_back", "Broke Safari checkout"), sameProblemGroup: GROUP, ...over });
  /** Three attempts at one problem, filed in the order c, a, b (numbers don't decide the order: filing time does). */
  const attempts = () => [
    closedRow("a", 7, plan(), 46, [], { sameProblemGroup: GROUP, createdAt: new Date("2026-03-01T00:00:00Z") }),
    row({ id: "b", requestNumber: 3, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT), sameProblemGroup: GROUP, createdAt: new Date("2026-06-01T00:00:00Z") }),
    rolledBack("c", 9, { createdAt: new Date("2026-01-15T00:00:00Z") }),
    row({ id: "d", requestNumber: 4, createdBy: MEMBER }),
  ];

  it("lists the group oldest first, numbered from 1, with the Request being read highlighted", () => {
    const iterations = buildIterations(MEMBER_VIEWER, attempts(), "a", { now: NOW })!;
    expect(iterations.iterations.map(entry => [entry.requestNumber, entry.number, entry.label, entry.current])).toEqual([
      [9, 1, "1st iteration", false],
      [7, 2, "2nd iteration", true],
      [3, 3, "3rd iteration", false],
    ]);
    expect(iterations.current).toEqual({ number: 2, label: "2nd iteration" });
  });

  it("shows each iteration's status, prediction and result, or its reason when Closed without a result", () => {
    const [first, second, third] = buildIterations(MEMBER_VIEWER, attempts(), "b", { now: NOW })!.iterations;
    expect(first).toMatchObject({ title: "Request 9", journey: "Closed without a result", outcome: { kind: "closed_without_result", label: "Rolled back", reason: "Broke Safari checkout" } });
    expect(second).toMatchObject({ journey: "Closed", predicted: { baseline: 40, target: 50 }, outcome: { kind: "measured", result: { actual: 46 } } });
    expect(third).toMatchObject({ journey: "Measuring", predicted: { target: 50 }, outcome: { kind: "still_due", due: { dueDate: "2026-10-31", dueLabel: "Due in 8 days" } } });
  });

  it("says when an iteration isn't Released yet, and when it is operational work", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, sameProblemGroup: GROUP }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, sameProblemGroup: GROUP, expectedImpact: null, noMeasurableImpactReason: "Copy change only" }),
    ];
    expect(buildIterations(MEMBER_VIEWER, rows, "a", { now: NOW })!.iterations.map(entry => entry.outcome)).toEqual([
      { kind: "still_due", due: null },
      { kind: "operational", reason: "Copy change only" },
    ]);
  });

  it("works the number out again when the group changes: it is never stored", () => {
    const rows = attempts().filter(entry => entry.id !== "c");
    expect(buildIterations(MEMBER_VIEWER, rows, "a", { now: NOW })!.current).toEqual({ number: 1, label: "1st iteration" });
  });

  it("names the 11th to 13th and the 21st to 23rd iterations as people say them", () => {
    const many = Array.from({ length: 23 }, (_, index) => row({ id: `r${index + 1}`, requestNumber: index + 1, createdBy: MEMBER, sameProblemGroup: GROUP }));
    const labels = buildIterations(MEMBER_VIEWER, many, "r1", { now: NOW })!.iterations.map(entry => entry.label);
    expect([labels[0], labels[1], labels[2], labels[3], labels[10], labels[11], labels[12], labels[20], labels[21], labels[22]]).toEqual([
      "1st iteration", "2nd iteration", "3rd iteration", "4th iteration", "11th iteration", "12th iteration", "13th iteration", "21st iteration", "22nd iteration", "23rd iteration",
    ]);
  });

  it("doesn't count a Follow-up as an iteration unless it is also linked as Same problem", () => {
    const rows = [...attempts(), row({ id: "e", requestNumber: 5, createdBy: MEMBER, followUpOf: "a", createdAt: new Date("2026-09-01T00:00:00Z") })];
    expect(buildIterations(MEMBER_VIEWER, rows, "a", { now: NOW })!.iterations.map(entry => entry.requestNumber)).toEqual([9, 7, 3]);
    expect(buildIterations(MEMBER_VIEWER, rows, "e", { now: NOW })).toBeNull();
    const linked = rows.map(entry => entry.id === "e" ? { ...entry, sameProblemGroup: GROUP } : entry);
    expect(buildIterations(MEMBER_VIEWER, linked, "a", { now: NOW })!.iterations.map(entry => entry.requestNumber)).toEqual([9, 7, 3, 5]);
  });

  it("has nothing for a Request in no group", () => {
    expect(buildIterations(MEMBER_VIEWER, attempts(), "d", { now: NOW })).toBeNull();
  });

  it("shows a Viewer every link, and a guest none", () => {
    expect(buildIterations(VIEWER_ROLE, attempts(), "a", { now: NOW })).toEqual(buildIterations(MEMBER_VIEWER, attempts(), "a", { now: NOW }));
    const own = attempts().map(entry => ({ ...entry, createdBy: GUEST }));
    expect(buildIterations(GUEST_VIEWER, own, "a", { now: NOW })).toBeNull();
  });

  it("names no person in the list", () => {
    const iterations = buildIterations(MEMBER_VIEWER, attempts(), "a", { now: NOW });
    expect(keysOf(iterations).filter(key => /total|average|score|rank|person|people|createdBy|assignedTo/i.test(key))).toEqual([]);
  });

  it("gives each Request in the Outcome report its iteration note, and none to a Request in no group", () => {
    const report = buildOutcomeReport(MEMBER_VIEWER, [...attempts(), closedRow("f", 6, plan(), 44, [])], { now: NOW, period: YEAR_2026 })!;
    const entries = report.projects.flatMap(section => section.requests);
    expect(entries.map(entry => [entry.requestNumber, entry.iteration])).toEqual([
      [3, { number: 3, label: "3rd iteration" }],
      [6, null],
      [7, { number: 2, label: "2nd iteration" }],
    ]);
    expect(report.closedWithoutResult.flatMap(group => group.requests).map(entry => [entry.requestNumber, entry.iteration])).toEqual([[9, { number: 1, label: "1st iteration" }]]);
  });
});
