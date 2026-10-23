import { describe, expect, it } from "vitest";
import { buildImpactDashboard, type ImpactRow, type ImpactViewer } from "./impact-read-model";
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
function plan(over: { key?: "conversion" | "adoption" | "check"; unit?: "percent" | "count"; current?: number | null; target?: number | null; noBaseline?: boolean; audience?: "all" | "new"; windowDays?: 30 | 90 } = {}): ExpectedImpact {
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
    title: `Request ${over.requestNumber}`,
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

describe("impact read model: viewers", () => {
  it("gives a guest only the Requests they created, and no org view", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: GUEST }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER }),
    ];
    const dashboard = buildImpactDashboard(GUEST_VIEWER, rows, { now: NOW });
    expect(requestIds(dashboard.myWork.requests)).toEqual([1]);
    expect(dashboard.byProject.flatMap(project => requestIds(project.requests))).toEqual([1]);
    expect(dashboard.wholeOrg).toBeNull();
  });

  it("gives a member, an admin and a leader who is a member the same org data", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46), releaseState: releaseState(MEMBER, RELEASE_AUG), status: "done", projectId: "p1", projectName: "Onboarding" }),
      row({ id: "b", requestNumber: 2, createdBy: ADMIN, status: "done", releaseState: releaseState(ADMIN, RELEASE_OCT), projectId: "p1", projectName: "Onboarding" }),
    ];
    const admin = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW });
    const member = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW });
    const leader = buildImpactDashboard(LEADER_VIEWER, rows, { now: NOW });
    expect(member.byProject).toEqual(admin.byProject);
    expect(member.wholeOrg).toEqual(admin.wholeOrg);
    expect(leader.byProject).toEqual(member.byProject);
    expect(leader.wholeOrg).toEqual(member.wholeOrg);
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
});

describe("impact read model: measured results", () => {
  it("shows baseline, actual, change, predicted change and window, with percentages in percentage points", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) })];
    const org = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!;
    expect(org.lines).toHaveLength(1);
    const [line] = org.lines;
    expect(line).toMatchObject({ metric: "Conversion rate", unit: "%", window: "30 days after release", changeUnit: "percentage points", summed: null });
    expect(line.results[0]).toMatchObject({ requestNumber: 1, baselineState: "known", baseline: 40, actual: 46, change: 6, predictedTarget: 50, predictedChange: 10, releaseDate: "2026-08-10" });
  });

  it("groups results by release date: a quarter and a year include a release, and the next quarter is empty", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) }),
    ];
    const q3 = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 3 } }).wholeOrg!;
    expect(q3.lines).toHaveLength(1);
    expect(q3.emptyMessage).toBeNull();
    const q4 = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 4 } }).wholeOrg!;
    expect(q4.lines).toEqual([]);
    expect(q4.emptyMessage).toBe("Nothing measured this period yet");
    const year = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "year", year: 2026 } }).wholeOrg!;
    expect(year.lines).toHaveLength(1);
  });

  it("puts a release on 30 June in Q2 and on 1 July in Q3", () => {
    const june = releaseFact("2026-06-30", "2026-07-30");
    const july = releaseFact("2026-07-01", "2026-07-31");
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, june), outcomeClosure: measuredClosure(plan(), june, 46) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, july), outcomeClosure: measuredClosure(plan(), july, 44) }),
    ];
    const q2 = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 2 } }).wholeOrg!;
    const q3 = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 3 } }).wholeOrg!;
    expect(q2.lines[0].results.map(result => result.requestNumber)).toEqual([1]);
    expect(q3.lines[0].results.map(result => result.requestNumber)).toEqual([2]);
  });

  it("keeps a Request with a predicted result but nothing measured out of every total", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "open" })];
    const dashboard = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW });
    expect(dashboard.wholeOrg!.lines).toEqual([]);
    expect(dashboard.byProject[0].measured).toEqual([]);
  });
});

describe("impact read model: still due, closed without result and operational work", () => {
  it("places a still-due result on the timeline by its due date, not in any line", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) })];
    const dashboard = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW });
    const org = dashboard.wholeOrg!;
    expect(org.lines).toEqual([]);
    expect(org.timeline).toHaveLength(1);
    expect(org.timeline[0]).toMatchObject({ requestNumber: 1, dueDate: "2026-10-31", dueLabel: "Due in 8 days" });
    expect(dashboard.myWork.requests[0].stillDue).toMatchObject({ dueDate: "2026-10-31" });
  });

  it("lists a Request closed without a result with its reason, outside every total", () => {
    const exception: OutcomeException = {
      version: 1, kind: "exception", reasonCode: "cannot_measure", reason: "No event data for this release",
      actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-x", fingerprint: "fp",
      release: RELEASE_AUG, revision: 1,
    };
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), exceptionClosure: exception })];
    const dashboard = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW });
    expect(dashboard.wholeOrg!.lines).toEqual([]);
    expect(dashboard.wholeOrg!.closedWithoutResult).toMatchObject([{ requestNumber: 1, reasonCode: "cannot_measure", reason: "No event data for this release" }]);
    expect(dashboard.myWork.requests[0].closedWithoutResult).toMatchObject({ reason: "No event data for this release" });
  });

  it("shows operational work with its reason, outside every total", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, expectedImpact: null, noMeasurableImpactReason: "Design token rename" })];
    const dashboard = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW });
    expect(dashboard.wholeOrg!.lines).toEqual([]);
    expect(dashboard.wholeOrg!.operational).toMatchObject([{ requestNumber: 1, reason: "Design token rename" }]);
    expect(dashboard.myWork.requests[0].operationalReason).toBe("Design token rename");
  });

  it("keeps a Request with no release date out of every period, and lists it as unreleased", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: null })];
    const org = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "year", year: 2026 } }).wholeOrg!;
    expect(org.lines).toEqual([]);
    expect(org.timeline).toEqual([]);
    expect(org.unreleased).toMatchObject([{ requestNumber: 1 }]);
  });
});

describe("impact read model: corrections, shared results and projects", () => {
  it("shows a Correction beside its original result, which stays as recorded", () => {
    const correction: ClosureCorrection = { operationId: "op-c", fingerprint: "fc", actorId: MEMBER, at: "2026-09-12T09:00:00.000Z", field: "evidence", correction: "Re-checked against the warehouse", reason: "Wrong source", revision: 2 };
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46), closureCorrections: [correction] })];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line.results[0].actual).toBe(46);
    expect(line.results[0].corrections).toMatchObject([{ field: "evidence", correction: "Re-checked against the warehouse", reason: "Wrong source" }]);
  });

  it("counts a shared result once and lists every related Request", () => {
    const observation = { observedFrom: "2026-08-10", observedTo: "2026-09-09", evidence: "Shared dashboard export" };
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46, observation) }),
      row({ id: "b", requestNumber: 2, createdBy: ADMIN, status: "done", releaseState: releaseState(ADMIN, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46, observation) }),
    ];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line.count).toBe(1);
    expect(line.results).toHaveLength(1);
    expect(line.results[0].requests.map(request => request.requestNumber)).toEqual([1, 2]);
  });

  it("shows a Project with predictions but nothing measured as predictions and a still-due count, with no measured total", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "open" }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) }),
    ];
    const [project] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).byProject;
    expect(project.name).toBe("Search");
    expect(project.measured).toEqual([]);
    expect(project.predictions.map(prediction => prediction.requestNumber)).toEqual([1]);
    expect(project.stillDueCount).toBe(1);
    expect(project.emptyMessage).toBe("Nothing measured this period yet");
  });

  it("gives a new capability its target only, and never a change", () => {
    const newCapability = plan({ current: null, target: 25, noBaseline: true });
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: newCapability, outcomeClosure: measuredClosure(newCapability, RELEASE_AUG, 20) })];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line.results[0]).toMatchObject({ baselineState: "new_capability", baseline: null, actual: 20, change: null, predictedTarget: 25, predictedChange: null });
  });

  it("shows an unknown baseline as unknown, never as zero", () => {
    const unknown = plan({ current: null, target: 50 });
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: unknown, outcomeClosure: measuredClosure(unknown, RELEASE_AUG, 46) })];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line.results[0]).toMatchObject({ baselineState: "unknown", baseline: null, actual: 46, change: null, predictedChange: null });
  });

  it("gives two metrics in the same Project two lines, with a total only for a count", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130, { evidence: "Adoption export" }) }),
    ];
    const [project] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).byProject;
    expect(project.measured).toHaveLength(2);
    const count = project.measured.find(line => line.unit === "count")!;
    expect(count).toMatchObject({ metric: "Users who adopted", summed: { count: 1, change: 30 } });
    expect(project.measured.find(line => line.unit === "%")!.summed).toBeNull();
  });
});

describe("impact read model: totals rule", () => {
  it("sums counts only when metric, unit, audience and window match exactly, and never sums percentages", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const newAudience = plan({ key: "adoption", unit: "count", current: 100, target: 150, audience: "new" });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130, { evidence: "e1" }) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 120, { evidence: "e2" }) }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: newAudience, outcomeClosure: measuredClosure(newAudience, RELEASE_AUG, 110, { evidence: "e3" }) }),
      row({ id: "d", requestNumber: 4, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46, { evidence: "e4" }) }),
      row({ id: "e", requestNumber: 5, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 44, { evidence: "e5" }) }),
    ];
    const lines = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
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
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line.verdicts).toEqual({ good: 1, neutral: 0, bad: 1 });
    expect(line.summed).toBeNull();
    expect(line.results.map(result => result.verdict)).toEqual(["good", "bad"]);
  });

  it("shows an empty quarter's still-due items, with no zero total", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT) })];
    const org = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "quarter", year: 2026, quarter: 4 } }).wholeOrg!;
    expect(org.lines).toEqual([]);
    expect(org.emptyMessage).toBe("Nothing measured this period yet");
    expect(org.timeline).toHaveLength(1);
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
      const dashboard = buildImpactDashboard(who, rows, { now: NOW });
      const keys = keysOf(dashboard).filter(key => /total|average|score|rank|mean/i.test(key));
      expect(keys).toEqual([]);
    }
  });
});
