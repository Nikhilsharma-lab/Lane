import { describe, expect, it } from "vitest";
import { buildImpactDashboard, type ImpactRow, type ImpactViewer } from "./impact-read-model";
import { byProjectSections } from "./impact-by-project-view";
import type { ExpectedImpact } from "./request-impact";
import type { OutcomeClosure } from "./request-outcome";
import type { ReleaseFact, ReleaseState } from "./request-release";

// Fixtures go through the read model's public builder; the presenter only formats what the read model returns.

const NOW = new Date("2026-10-23T12:00:00.000Z");
const ORG = "org_impact";
const ADMIN_VIEWER: ImpactViewer = { userId: "user_admin", orgId: ORG, role: "admin" };
const MEMBER = "user_member";

function plan(over: { key?: "conversion" | "adoption" | "check";unit?: "percent" | "count"; current?: number | null; target?: number | null } = {}): ExpectedImpact {
  return {
    kind: "measurement",
    version: 4,
    primary: { key: over.key ?? "conversion", name: "", unit: over.unit ?? "percent", current: over.current === undefined ? 40 : over.current, target: over.target === undefined ? 50 : over.target, noBaseline: false, check: "" },
    measurement: { audience: "all", platform: "all", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
    guardrails: [],
  };
}

const RELEASE_AUG: ReleaseFact = { exposureDate: "2026-08-10", audience: "all", evidence: "Released to all users", dueDate: "2026-09-09", startDate: "2026-08-10", windowKind: "relative" };
const RELEASE_OCT: ReleaseFact = { exposureDate: "2026-10-01", audience: "all", evidence: "Released to all users", dueDate: "2026-10-31", startDate: "2026-10-01", windowKind: "relative" };

const releaseState = (release: ReleaseFact): ReleaseState => ({ version: 1, ownerId: MEMBER, release, history: [] });
/** A release recorded with the value before release, as the release action stores it: in its history entry. */
function recordedState(ownerId: string, release: ReleaseFact, value: number): ReleaseState {
  const input = { kind: "release" as const, exposureDate: release.exposureDate, evidence: release.evidence, audienceConfirmed: true as const, valueBeforeRelease: { value, unit: "%" } };
  return { version: 1, ownerId, release, history: [{ operationId: "op-release", fingerprint: "fp", actorId: ownerId, at: "2026-08-10T09:00:00.000Z", input, previousRelease: null, release, previousOwnerId: ownerId, ownerId, revision: 1 }] };
}

function measured(expected: ExpectedImpact, release: ReleaseFact, actual: number, evidence: string, passed?: boolean): OutcomeClosure {
  const primary = passed === undefined ? { kind: "numeric" as const, actual, unit: "%" } : { kind: "pass_fail" as const, passed };
  return {
    version: 1, kind: "measured", actorId: MEMBER, ownerId: MEMBER, closedAt: "2026-09-10T09:00:00.000Z", operationId: `op-${evidence}`, fingerprint: "fp",
    expected, release, primary, guardrails: [], evidence, observedFrom: release.startDate, observedTo: release.dueDate, revision: 1,
  };
}

function row(over: Partial<ImpactRow> & Pick<ImpactRow, "id" | "requestNumber">): ImpactRow {
  return {
    orgId: ORG, title: `Request ${over.requestNumber}`, createdBy: MEMBER, assignedTo: null, projectId: null, projectName: null, status: "open",
    releaseState: null, outcomeClosure: null, exceptionClosure: null, closureCorrections: [], expectedImpact: plan(), noMeasurableImpactReason: null, followUpOf: null,
    ...over,
  };
}

/** The read model's Project views for the admin viewer, rendered as sections. */
function sectionsOf(rows: ImpactRow[]) {
  return byProjectSections(buildImpactDashboard(ADMIN_VIEWER, rows, { now: NOW }).byProject);
}

describe("By project view: a Project with measured results", () => {
  it("leads with each measured result on one line: baseline, actual, change, predicted change and window", () => {
    const [search] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), outcomeClosure: measured(plan(), RELEASE_AUG, 46, "Export") }),
    ]);
    expect(search.heading).toBe("Search");
    expect(search.measured).toHaveLength(1);
    const [line] = search.measured;
    expect(line.metric).toBe("Conversion rate");
    expect(line.window).toBe("30 days after release");
    expect(line.cells).toEqual({ baseline: "Planning baseline 40%", actual: "46%", change: "+6 percentage points", predicted: "+10 percentage points (planned baseline 40%)" });
    expect(line.results).toHaveLength(1);
    expect(search.emptyMessage).toBeNull();
  });

  it("gives each measured line the same chart Whole org draws for it, and none for a Verified result", () => {
    const check = plan({ key: "check", unit: "count", current: null, target: null });
    const [search] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), outcomeClosure: measured(plan(), RELEASE_AUG, 46, "Export") }),
      row({ id: "b", requestNumber: 2, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), expectedImpact: check, outcomeClosure: measured(check, RELEASE_AUG, 0, "Check", true) }),
    ]);
    const [chartLine, verifiedLine] = search.measured;
    expect(chartLine.chart).toMatchObject({ metric: "Conversion rate", unit: "%", scaleMax: 50 });
    expect(chartLine.chart?.groups).toHaveLength(1);
    expect(verifiedLine.chart).toBeNull();
  });

  it("lists the Project's Requests beneath, each with its actual value", () => {
    const [search] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), outcomeClosure: measured(plan(), RELEASE_AUG, 46, "Export") }),
      row({ id: "b", requestNumber: 2, projectId: "p1", projectName: "Search", status: "open" }),
    ]);
    expect(search.requests.map(request => [request.requestNumber, request.note])).toEqual([[1, "Actual 46%"], [2, null]]);
  });

  it("keeps two metrics in one Project on separate lines, with a total only for a count", () => {
    const adoption = plan({ key: "adoption", unit: "count", current: 100, target: 150 });
    const [search] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), outcomeClosure: measured(plan(), RELEASE_AUG, 46, "e1") }),
      row({ id: "b", requestNumber: 2, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measured(adoption, RELEASE_AUG, 130, "e2") }),
      row({ id: "c", requestNumber: 3, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), expectedImpact: adoption, outcomeClosure: measured(adoption, RELEASE_AUG, 120, "e3") }),
    ]);
    expect(search.measured.map(line => line.metric)).toEqual(["Conversion rate", "Users who adopted"]);
    const [percent, count] = search.measured;
    expect(percent.total).toBeNull();
    expect(percent.cells).toEqual({ baseline: "Planning baseline 40%", actual: "46%", change: "+6 percentage points", predicted: "+10 percentage points (planned baseline 40%)" });
    expect(count.cells).toBeNull();
    expect(count.total).toBe("+50 in total");
    expect(count.results.map(result => result.cells.actual)).toEqual(["130", "120"]);
  });

  it("shows an unknown baseline as unknown, never as zero, and still shows the predicted target", () => {
    const [search] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), expectedImpact: plan({ current: null, target: 50 }), outcomeClosure: measured(plan({ current: null, target: 50 }), RELEASE_AUG, 46, "Export") }),
    ]);
    expect(search.measured[0].cells).toEqual({ baseline: "Baseline unknown", actual: "46%", change: "Not shown", predicted: "Target 50%" });
  });

  it("shows a Verified result as a good or bad tally, never as a summed number", () => {
    const check = plan({ key: "check" });
    const [search] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), expectedImpact: check, outcomeClosure: measured(check, RELEASE_AUG, 0, "p1", true) }),
      row({ id: "b", requestNumber: 2, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_AUG), expectedImpact: check, outcomeClosure: measured(check, RELEASE_AUG, 0, "p2", false) }),
    ]);
    const verified = search.measured.find(line => line.cells === null);
    expect(verified).toBeDefined();
    expect(verified!.total).toBeNull();
    expect(verified!.summary).toBe("1 good, 1 bad");
  });
});

describe("By project view: a Project with predictions but nothing measured", () => {
  it("shows predictions and a still-due count, with no measured total", () => {
    const [search] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Search", status: "open" }),
      row({ id: "b", requestNumber: 2, projectId: "p1", projectName: "Search", status: "done", releaseState: releaseState(RELEASE_OCT) }),
    ]);
    expect(search.measured).toEqual([]);
    expect(search.emptyMessage).toBe("Nothing measured this period yet");
    expect(search.stillDueLabel).toBe("1 still due");
    expect(search.predictions).toMatchObject([{ requestNumber: 1, metric: "Conversion rate", predicted: "+10 percentage points (planned baseline 40%)", window: "30 days after release" }]);
  });
});

describe("By project view: an empty Project", () => {
  it("says nothing measured this period yet, with no predictions and no still-due count", () => {
    const [empty] = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: "p1", projectName: "Billing", status: "open", expectedImpact: null }),
    ]);
    expect(empty.heading).toBe("Billing");
    expect(empty.measured).toEqual([]);
    expect(empty.emptyMessage).toBe("Nothing measured this period yet");
    expect(empty.predictions).toEqual([]);
    expect(empty.stillDueLabel).toBeNull();
    expect(empty.requests.map(request => request.requestNumber)).toEqual([1]);
  });
});

describe("By project view: Requests without a Project", () => {
  it("sits under its own heading, with its own results", () => {
    const sections = sectionsOf([
      row({ id: "a", requestNumber: 1, projectId: null, status: "done", releaseState: releaseState(RELEASE_AUG), outcomeClosure: measured(plan(), RELEASE_AUG, 46, "Export") }),
      row({ id: "b", requestNumber: 2, projectId: "p1", projectName: "Search", status: "open" }),
    ]);
    const unassigned = sections.find(section => section.projectId === null)!;
    expect(unassigned.heading).toBe("Requests without a Project");
    expect(unassigned.measured[0].cells?.actual).toBe("46%");
    expect(sections.find(section => section.projectId === "p1")!.heading).toBe("Search");
  });
});

describe("impact by project: value before release (#151 decision 3)", () => {
  it("shows the value recorded before release as the baseline, with the planned baseline beside the predicted change", () => {
    const rows = [row({ id: "a", requestNumber: 1, releaseState: recordedState(MEMBER, RELEASE_AUG, 42), outcomeClosure: measured(plan(), RELEASE_AUG, 46, "e1") })];
    expect(sectionsOf(rows)[0].measured[0].cells).toEqual({ baseline: "Before release 42%", actual: "46%", change: "+4 percentage points", predicted: "+10 percentage points (planned baseline 40%)" });
  });
});
