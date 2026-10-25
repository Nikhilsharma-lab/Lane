import { describe, expect, it } from "vitest";
import { buildDefinitionUses, buildImpactDashboard, buildTeammateWork, teammateIdsOf, type ImpactDefinition, type ImpactRow, type ImpactViewer } from "./impact-read-model";
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
    definitions: [],
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

  it("lists a Request with no release date under no release date whether it is Done or still open", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: null }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "open", releaseState: null }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "in_progress", releaseState: null }),
      row({ id: "d", requestNumber: 4, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG) }),
    ];
    const org = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!;
    expect(org.unreleased.map(item => item.requestNumber)).toEqual([1, 2, 3]);
    expect(org.lines).toEqual([]);
    expect(org.timeline.map(item => item.requestNumber)).toEqual([4]);
  });

  it("never counts an open Request with no release date in a period total", () => {
    const rows = [row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "open", releaseState: null, expectedImpact: plan(), outcomeClosure: null })];
    const org = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW, period: { kind: "year", year: 2026 } }).wholeOrg!;
    expect(org.lines).toEqual([]);
    expect(org.unreleased.map(item => item.requestNumber)).toEqual([2]);
  });

  it("does not list operational work or a closed-without-result Request as unreleased", () => {
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "open", releaseState: null, expectedImpact: null, noMeasurableImpactReason: "Design token rename" }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "open", releaseState: null, exceptionClosure: { version: 1, kind: "exception", reasonCode: "other", reason: "Dropped", actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-09-10T09:00:00.000Z", operationId: "op-d", fingerprint: "fp", revision: 1 } as OutcomeException }),
    ];
    const org = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!;
    expect(org.unreleased).toEqual([]);
    expect(org.operational.map(item => item.requestNumber)).toEqual([1]);
    expect(org.closedWithoutResult.map(item => item.requestNumber)).toEqual([2]);
  });

  it("says nothing measured this period yet when no period is selected either", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "open", releaseState: null })];
    expect(buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.emptyMessage).toBe("Nothing measured this period yet");
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
    expect(line.verdicts).toEqual({ good: 1, bad: 1 });
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

describe("impact read model: unknown changes and other units (#151 review)", () => {
  it("shows no change total on a line when any result on it has an unknown baseline, and keeps the count", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const unknown = plan({ key: "adoption", unit: "count", current: null, target: 150 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measuredClosure(adoption, RELEASE_AUG, 130, { evidence: "u1" }) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: unknown, outcomeClosure: measuredClosure(unknown, RELEASE_AUG, 120, { evidence: "u2" }) }),
    ];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line.count).toBe(2);
    expect(line.summed).toEqual({ count: 2, change: null });
  });

  it("sums a non-percentage unit that matches exactly, such as seconds", () => {
    const seconds = plan({ unit: "seconds", current: 40, target: 30 });
    const rows = [
      row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: seconds, outcomeClosure: measuredClosure(seconds, RELEASE_AUG, 35, { evidence: "s1" }) }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), expectedImpact: seconds, outcomeClosure: measuredClosure(seconds, RELEASE_AUG, 30, { evidence: "s2" }) }),
    ];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
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
    const lines = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
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
    const lines = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
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
    const lines = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
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
    const lines = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(lines.map(line => [line.definitionId, line.metric, line.count])).toEqual([["def-adopters", "Adopters", 1], [null, "Adopters", 1]]);
  });

  it("still adds up a result whose definition was archived, or merged into the one it now counts under", () => {
    // The library resolves an archived definition to itself and a merged-away one to the definition it was merged into.
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const rows = [
      closedRow("a", 1, adoption, 130, [definedAs({ id: "def-archived", name: "Weekly adopters", unit: "count" })]),
      closedRow("b", 2, adoption, 125, [definedAs({ id: "def-archived", name: "Weekly adopters", unit: "count" })]),
    ];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line).toMatchObject({ definitionId: "def-archived", metric: "Weekly adopters", summed: { count: 2, change: 55 } });
  });

  it("never sums a percentage definition, and labels its change in percentage points", () => {
    const conversion = { id: "def-conversion", name: "Checkout conversion", unit: "percent" as const };
    const rows = [
      closedRow("a", 1, plan(), 46, [definedAs(conversion)]),
      closedRow("b", 2, plan(), 44, [definedAs(conversion)]),
    ];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line).toMatchObject({ definitionId: "def-conversion", unit: "%", changeUnit: "percentage points", count: 2, summed: null, verdicts: null });
  });

  it("counts in the definition's unit, not the unit text the Request saved", () => {
    const legacy: ExpectedImpact = { kind: "metric", metric: "Signups", unit: "users", baseline: 100, target: 150, source: "Analytics", reviewAfterDays: 30 } as ExpectedImpact;
    const rows = [closedRow("a", 1, legacy, 130, [definedAs({ id: "def-signups", name: "Signups (users)", unit: "count" })])];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line).toMatchObject({ metric: "Signups (users)", unit: "count", changeUnit: "count", summed: { count: 1, change: 30 } });
  });

  it("tallies Pass/fail checks good or bad beside definitions, never summed", () => {
    const check = plan({ key: "check", unit: "count", current: null, target: null });
    const rows = [
      closedRow("a", 1, check, 0, [], { outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: true, evidence: "p1" }) }),
      closedRow("b", 2, check, 0, [], { outcomeClosure: measuredClosure(check, RELEASE_AUG, 0, { passed: false, evidence: "p2" }) }),
    ];
    const [line] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines;
    expect(line).toMatchObject({ definitionId: null, form: "pass_fail", verdicts: { good: 1, bad: 1 }, summed: null });
  });

  it("shows a renamed definition under its current name, on lines, Requests, predictions and the still-due timeline", () => {
    const trials = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const renamed = definedAs({ id: "def-trials", name: "Trials started", unit: "count" });
    const rows = [
      closedRow("a", 1, trials, 130, [renamed], { projectId: "p1", projectName: "Growth" }),
      row({ id: "b", requestNumber: 2, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_OCT), expectedImpact: trials, definitions: [renamed], projectId: "p1", projectName: "Growth" }),
      row({ id: "c", requestNumber: 3, createdBy: MEMBER, status: "open", expectedImpact: trials, definitions: [renamed], projectId: "p1", projectName: "Growth" }),
    ];
    const dashboard = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW });
    expect(dashboard.wholeOrg!.lines.map(line => line.metric)).toEqual(["Trials started"]);
    expect(dashboard.myWork.requests.map(entry => entry.predicted?.metric)).toEqual(["Trials started", "Trials started", "Trials started"]);
    expect(dashboard.myWork.requests[0].result?.metric).toBe("Trials started");
    expect(dashboard.wholeOrg!.timeline.map(item => item.metric)).toEqual(["Trials started"]);
    expect(dashboard.byProject[0].predictions.map(prediction => [prediction.predicted.definitionId, prediction.predicted.metric])).toEqual([["def-trials", "Trials started"]]);
  });

  it("shows each guardrail under its definition's current name", () => {
    const guarded: ExpectedImpact = { ...plan(), guardrails: [
      { key: "support", definitionId: null, name: "", unit: "percent", current: 2, noBaseline: false, operator: "at_most", limit: 5 },
    ] } as ExpectedImpact;
    const closure = { ...measuredClosure(guarded, RELEASE_AUG, 46), guardrails: [{ metric: "Support contact rate", operator: "at_most" as const, limit: 5, unit: "%", actual: 3 }] };
    const rows = [closedRow("a", 1, guarded, 46, [definedAs({ id: "def-tickets", name: "Help tickets per user", unit: "percent" }, 1)], { outcomeClosure: closure })];
    const [result] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines[0].results;
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
    const project = buildImpactDashboard(MEMBER_VIEWER, rows, { now: NOW }).byProject[0];
    expect(project.requests.find(entry => entry.requestNumber === 1)!.followUps.map(request => request.requestNumber)).toEqual([2]);
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
      const dashboard = buildImpactDashboard(who, rows, { now: NOW });
      const keys = keysOf(dashboard).filter(key => /total|average|score|rank|mean/i.test(key));
      expect(keys).toEqual([]);
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
    const [result] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines[0].results;
    expect(result).toMatchObject({ baselineState: "known", baseline: 42, baselineSource: "release", plannedBaseline: 40, actual: 46, change: 4, predictedChange: 10 });
  });

  it("falls back to the planning baseline for a release recorded before this change, and says so", () => {
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: releaseState(MEMBER, RELEASE_AUG), outcomeClosure: measuredClosure(plan(), RELEASE_AUG, 46) })];
    const [result] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines[0].results;
    expect(result).toMatchObject({ baseline: 40, baselineSource: "planning", plannedBaseline: 40, actual: 46, change: 6 });
  });

  it("gives a new capability no change and no baseline, whatever the release recorded", () => {
    const newCapability = plan({ current: null, target: 25, noBaseline: true });
    const rows = [row({ id: "a", requestNumber: 1, createdBy: MEMBER, status: "done", releaseState: recordedState(MEMBER, RELEASE_AUG, 42), outcomeClosure: measuredClosure(newCapability, RELEASE_AUG, 20) })];
    const [result] = buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).wholeOrg!.lines[0].results;
    expect(result).toMatchObject({ baselineState: "new_capability", baseline: null, baselineSource: null, change: null, plannedBaseline: null });
  });
});
