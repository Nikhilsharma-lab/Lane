/**
 * The impact read model: one pure function that turns a workspace's Request rows into the three dashboard
 * views (My work, By project, Whole org) for one viewer (#154, spec #151).
 *
 * Screens render what this returns and compute no totals of their own. Visibility is applied here as well as
 * in the database query (src/lib/data/impact.ts), so a guest never receives another person's Request.
 *
 * Rules, all enforced here:
 * - A total is only ever a sum of results whose metric, unit, audience and window match exactly (one line per
 *   exact match). Only count units are summed. Percentages and time units are never summed.
 * - Verified (pass/fail) results are tallied as good or bad, never summed.
 * - A result shared by several Requests (the same observation) is counted once; every Request is listed.
 * - Operational work and Requests closed without a result are never in a line or total.
 * - A Request with no release date is never in a period; the period is the release date (UTC).
 * - Nothing per person: no totals, averages, scores or rankings for anyone.
 */
import { agreedResult, guardrailHeld, type ClosureCorrection, type OutcomeClosure, type OutcomeException } from "./request-outcome";
import { measurementAudienceLabel, measurementPlatformLabel } from "./request-measurement";
import type { ExpectedImpact } from "./request-impact";
import { journeyStatus, requesterOf, type JourneyLabel } from "./request-journey";
import { releaseMeasurement } from "./request-release-facts";
import type { ReleaseFact, ReleaseState } from "./request-release";
import { DAY_MS } from "./utc-day";

export type ImpactViewer = { userId: string; orgId: string; role: "admin" | "member" | "guest" };
export type ImpactPeriod = { kind: "year"; year: number } | { kind: "quarter"; year: number; quarter: 1 | 2 | 3 | 4 };
export type ImpactOptions = { now?: Date; period?: ImpactPeriod | null };

/** One Request, as the read model needs it. Load it from the database with src/lib/data/impact.ts. */
export type ImpactRow = {
  id: string;
  orgId: string;
  requestNumber: number;
  title: string;
  createdBy: string;
  assignedTo: string | null;
  projectId: string | null;
  projectName: string | null;
  status: "open" | "in_progress" | "done";
  releaseState: ReleaseState | null;
  outcomeClosure: OutcomeClosure | null;
  exceptionClosure: OutcomeException | null;
  closureCorrections: ClosureCorrection[];
  expectedImpact: ExpectedImpact | null;
  noMeasurableImpactReason: string | null;
  followUpOf: string | null;
};

export type BaselineState = "known" | "unknown" | "new_capability" | "not_applicable";
export type Verdict = "good" | "bad";
export type RequestRef = { requestId: string; requestNumber: number; title: string };

/** A predicted result: what was agreed before release. */
export type Prediction = {
  metric: string;
  form: "numeric" | "pass_fail";
  unit: string;
  changeUnit: string | null;
  audience: string;
  platform: string;
  window: string;
  baselineState: BaselineState;
  baseline: number | null;
  target: number | null;
  predictedChange: number | null;
};

export type CorrectionView = { field: string; correction: string; reason: string; at: string };
export type GuardrailView = { metric: string; operator: string; limit: number; unit: string; actual: number; held: boolean };

/** One measured result for one Request. `requests` lists every Request that shares it (one, unless shared). */
export type ResultView = {
  requestId: string;
  requestNumber: number;
  title: string;
  metric: string;
  form: "numeric" | "pass_fail";
  unit: string;
  changeUnit: string | null;
  audience: string;
  platform: string;
  window: string;
  baselineState: BaselineState;
  baseline: number | null;
  actual: number | null;
  change: number | null;
  verdict: Verdict | null;
  predictedTarget: number | null;
  predictedChange: number | null;
  releaseDate: string;
  observedFrom: string;
  observedTo: string;
  evidence: string;
  guardrails: GuardrailView[];
  corrections: CorrectionView[];
  requests: RequestRef[];
};

/** Results that match exactly on metric, unit, audience and window. `summed` is set only for count units. */
export type ResultLine = {
  metric: string;
  form: "numeric" | "pass_fail";
  unit: string;
  changeUnit: string | null;
  audience: string;
  platform: string;
  window: string;
  results: ResultView[];
  count: number;
  summed: { count: number; change: number | null } | null;
  verdicts: { good: number; neutral: number; bad: number } | null;
};

export type DueItem = {
  requestId: string;
  requestNumber: number;
  title: string;
  projectName: string | null;
  metric: string;
  predicted: Prediction;
  dueDate: string;
  dueLabel: string;
};

/** One Request as a list row, in My work and beneath each Project. */
export type RequestEntry = {
  requestId: string;
  requestNumber: number;
  title: string;
  projectId: string | null;
  projectName: string | null;
  journey: JourneyLabel;
  operationalReason: string | null;
  predicted: Prediction | null;
  result: ResultView | null;
  stillDue: DueItem | null;
  closedWithoutResult: { reasonCode: string; reason: string } | null;
  corrections: CorrectionView[];
  releaseDate: string | null;
  followUpOf: string | null;
};

export type MyWorkEntry = RequestEntry & { role: "requester" | "picker" | "both" };

export type ProjectView = {
  projectId: string | null;
  name: string;
  measured: ResultLine[];
  predictions: { requestId: string; requestNumber: number; title: string; predicted: Prediction }[];
  stillDueCount: number;
  requests: RequestEntry[];
  emptyMessage: string | null;
};

export type OrgView = {
  period: ImpactPeriod | null;
  lines: ResultLine[];
  emptyMessage: string | null;
  operational: { requestId: string; requestNumber: number; title: string; projectName: string | null; reason: string }[];
  closedWithoutResult: { requestId: string; requestNumber: number; title: string; projectName: string | null; reasonCode: string; reason: string }[];
  timeline: DueItem[];
  unreleased: RequestRef[];
  projectStacks: { projectId: string | null; name: string; counts: Partial<Record<JourneyLabel, number>> }[];
};

export type ImpactDashboard = {
  myWork: { requests: MyWorkEntry[] };
  byProject: ProjectView[];
  wholeOrg: OrgView | null;
};

const NO_PROJECT = "No Project";

/** The predicted scope of an agreed expectation. Its window reads like the closure's window, so the two can be compared. */
function predictionOf(impact: ExpectedImpact): Prediction {
  const agreed = agreedResult(impact);
  const baselineState: BaselineState = agreed.form === "pass_fail"
    ? "not_applicable"
    : impact.kind === "measurement"
      ? impact.primary.noBaseline ? "new_capability" : impact.primary.current === null ? "unknown" : "known"
      : impact.kind === "metric" && impact.noBaseline === true ? "new_capability" : agreed.baseline === null ? "unknown" : "known";
  const baseline = baselineState === "known" ? agreed.baseline : null;
  const predictedChange = baseline !== null && agreed.target !== null ? agreed.target - baseline : null;
  const measurement = impact.kind === "measurement" ? impact.measurement : null;
  const window = windowOf(impact);
  return {
    metric: agreed.label,
    form: agreed.form,
    unit: agreed.unit,
    changeUnit: changeUnitOf(agreed.form, agreed.unit),
    audience: measurement ? measurementAudienceLabel(measurement) : "All users",
    platform: measurement ? measurementPlatformLabel(measurement) : "All platforms",
    window,
    baselineState,
    baseline,
    target: agreed.target,
    predictedChange,
  };
}

/** The window as the agreed expectation records it, phrased the same way as a closed result's window. */
function windowOf(impact: ExpectedImpact): string {
  if (impact.kind === "measurement") {
    const { measurement } = impact;
    return measurement.exactDates ? `${measurement.startDate} to ${measurement.endDate}` : `${measurement.windowDays} days after release`;
  }
  return impact.kind === "verification" || impact.kind === "metric" ? `${impact.reviewAfterDays} days after release` : "";
}

function changeUnitOf(form: "numeric" | "pass_fail", unit: string): string | null {
  if (form === "pass_fail") return null;
  return unit === "%" ? "percentage points" : unit;
}

const DAYS = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function windowOfRelease(release: ReleaseFact): string {
  if (release.windowKind === "fixed") return `${release.startDate} to ${release.dueDate}`;
  return `${DAYS(release.startDate, release.dueDate)} days after release`;
}

function measuredResult(row: ImpactRow, closure: OutcomeClosure): ResultView {
  const prediction = predictionOf(closure.expected);
  const passed = closure.primary.kind === "pass_fail" ? closure.primary.passed : null;
  const actual = closure.primary.kind === "numeric" ? closure.primary.actual : null;
  const known = prediction.baselineState === "known" && prediction.baseline !== null;
  const change = known && actual !== null ? actual - prediction.baseline! : null;
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    title: row.title,
    metric: prediction.metric,
    form: prediction.form,
    unit: prediction.unit,
    changeUnit: prediction.changeUnit,
    audience: prediction.audience,
    platform: prediction.platform,
    window: windowOfRelease(closure.release),
    baselineState: prediction.baselineState,
    baseline: prediction.baseline,
    actual,
    change,
    verdict: passed === null ? null : passed ? "good" : "bad",
    predictedTarget: prediction.target,
    predictedChange: prediction.predictedChange,
    releaseDate: closure.release.exposureDate,
    observedFrom: closure.observedFrom,
    observedTo: closure.observedTo,
    evidence: closure.evidence,
    guardrails: closure.guardrails.map(guardrail => ({ metric: guardrail.metric, operator: guardrail.operator, limit: guardrail.limit, unit: guardrail.unit, actual: guardrail.actual, held: guardrailHeld(guardrail) })),
    corrections: correctionsOf(row),
    requests: [{ requestId: row.id, requestNumber: row.requestNumber, title: row.title }],
  };
}

function correctionsOf(row: ImpactRow): CorrectionView[] {
  return row.closureCorrections.map(({ field, correction, reason, at }) => ({ field, correction, reason, at }));
}

/** The release date a Request's result belongs to: the measured closure's, else the current release's. */
function releaseDateOf(row: ImpactRow): string | null {
  return row.outcomeClosure?.release.exposureDate ?? row.releaseState?.release?.exposureDate ?? row.exceptionClosure?.release?.exposureDate ?? null;
}

function dueItemOf(row: ImpactRow, now: Date): DueItem | null {
  const release = row.releaseState?.release;
  if (!release || row.outcomeClosure || row.exceptionClosure || journeyStatus(row).status !== "measuring") return null;
  const predicted = row.expectedImpact ? predictionOf(row.expectedImpact) : null;
  if (!predicted) return null;
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    title: row.title,
    projectName: row.projectName,
    metric: predicted.metric,
    predicted,
    dueDate: release.dueDate,
    dueLabel: releaseMeasurement(release, now)!.label,
  };
}

function entryOf(row: ImpactRow, now: Date): RequestEntry {
  const measured = row.outcomeClosure ? measuredResult(row, row.outcomeClosure) : null;
  const source = row.outcomeClosure?.expected ?? row.expectedImpact;
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    title: row.title,
    projectId: row.projectId,
    projectName: row.projectName,
    journey: journeyStatus(row).label,
    operationalReason: row.noMeasurableImpactReason,
    predicted: source ? predictionOf(source) : null,
    result: measured,
    stillDue: dueItemOf(row, now),
    closedWithoutResult: row.exceptionClosure ? { reasonCode: row.exceptionClosure.reasonCode, reason: row.exceptionClosure.reason } : null,
    corrections: correctionsOf(row),
    releaseDate: releaseDateOf(row),
    followUpOf: row.followUpOf,
  };
}

function inPeriod(date: string | null, period: ImpactPeriod | null): boolean {
  if (period === null) return true;
  if (date === null || Number(date.slice(0, 4)) !== period.year) return false;
  if (period.kind === "year") return true;
  const month = Number(date.slice(5, 7));
  return month >= (period.quarter - 1) * 3 + 1 && month <= period.quarter * 3;
}

/** The same observation attributed to several Requests: one result, counted once. */
function sharedKey(result: ResultView): string {
  return JSON.stringify([result.metric, result.form, result.unit, result.audience, result.platform, result.window, result.actual, result.verdict, result.observedFrom, result.observedTo, result.evidence.trim().toLowerCase(), result.guardrails.map(guardrail => guardrail.actual)]);
}

/** Exact matches only: one line per metric, unit, audience, platform and window. */
function linesOf(results: ResultView[]): ResultLine[] {
  const shared = new Map<string, ResultView[]>();
  for (const result of [...results].sort((a, b) => a.requestNumber - b.requestNumber)) {
    const key = sharedKey(result);
    shared.set(key, [...(shared.get(key) ?? []), result]);
  }
  const distinct = [...shared.values()].map(group => ({ ...group[0], requests: group.map(({ requestId, requestNumber, title }) => ({ requestId, requestNumber, title })) }));

  const byLine = new Map<string, ResultView[]>();
  for (const result of distinct) {
    const key = JSON.stringify([result.metric, result.form, result.unit, result.audience, result.platform, result.window]);
    byLine.set(key, [...(byLine.get(key) ?? []), result]);
  }

  return [...byLine.values()].map(group => {
    const first = group[0];
    const summable = first.form === "numeric" && first.unit === "count";
    const changes = group.flatMap(result => result.change === null ? [] : [result.change]);
    return {
      metric: first.metric,
      form: first.form,
      unit: first.unit,
      changeUnit: first.changeUnit,
      audience: first.audience,
      platform: first.platform,
      window: first.window,
      results: group,
      count: group.length,
      summed: summable ? { count: group.length, change: changes.length ? changes.reduce((sum, change) => sum + change, 0) : null } : null,
      verdicts: first.form === "pass_fail" ? {
        good: group.filter(result => result.verdict === "good").length,
        neutral: 0,
        bad: group.filter(result => result.verdict === "bad").length,
      } : null,
    };
  });
}

function visibleTo(viewer: ImpactViewer, rows: ImpactRow[]): ImpactRow[] {
  return rows.filter(row => row.orgId === viewer.orgId && (viewer.role !== "guest" || row.createdBy === viewer.userId));
}

function byRequestNumber<T extends { requestNumber: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.requestNumber - b.requestNumber);
}

/** The Requests one person requested or picked up, from the rows a viewer may see, marked by the role they had. */
function workOf(visible: ImpactRow[], personId: string, now: Date): MyWorkEntry[] {
  return byRequestNumber(visible.flatMap(row => {
    const requester = requesterOf(row) === personId;
    const picker = row.assignedTo === personId;
    if (!requester && !picker) return [];
    const role: MyWorkEntry["role"] = requester && picker ? "both" : requester ? "requester" : "picker";
    return [{ ...entryOf(row, now), role }];
  }));
}

/**
 * A teammate's list (spec story 12): the same entries as My work, for one person, shown to a non-guest viewer.
 * Null for a guest, who has no view of anyone else's Requests. Holds no totals, averages, scores or rankings.
 */
export function buildTeammateWork(viewer: ImpactViewer, rows: ImpactRow[], personId: string, options: ImpactOptions = {}): MyWorkEntry[] | null {
  if (viewer.role === "guest") return null;
  return workOf(visibleTo(viewer, rows), personId, options.now ?? new Date());
}

/** A person a non-guest may open a list for, by name. */
export type Teammate = { id: string; name: string };

/**
 * The people a viewer may open a list for (spec story 12): everyone who requested or picked up a Request the viewer
 * can see, except the viewer. Null for a guest, who has no view of anyone else. Sorted and without repeats.
 */
export function teammateIdsOf(viewer: ImpactViewer, rows: ImpactRow[]): string[] | null {
  if (viewer.role === "guest") return null;
  const people = new Set<string>();
  for (const row of visibleTo(viewer, rows)) {
    people.add(requesterOf(row));
    if (row.assignedTo) people.add(row.assignedTo);
  }
  people.delete(viewer.userId);
  return [...people].sort();
}

export function buildImpactDashboard(viewer: ImpactViewer, rows: ImpactRow[], options: ImpactOptions = {}): ImpactDashboard {
  const now = options.now ?? new Date();
  const period = options.period ?? null;
  const visible = visibleTo(viewer, rows);

  const myWork = workOf(visible, viewer.userId, now);

  const projectKey = (row: ImpactRow) => row.projectId ?? "";
  const projectGroups = new Map<string, ImpactRow[]>();
  for (const row of visible) projectGroups.set(projectKey(row), [...(projectGroups.get(projectKey(row)) ?? []), row]);
  const projectName = (rowsInProject: ImpactRow[]) => rowsInProject[0].projectName ?? NO_PROJECT;

  const byProject: ProjectView[] = [...projectGroups.values()].map(rowsInProject => {
    const entries = byRequestNumber(rowsInProject.map(row => entryOf(row, now)));
    const measured = linesOf(entries.flatMap(entry => entry.result && inPeriod(entry.releaseDate, period) ? [entry.result] : []));
    // Predictions with nothing measured yet: open or released-and-waiting work, not closed and not operational.
    const predictions = entries.flatMap(entry => entry.predicted && !entry.result && !entry.stillDue && !entry.closedWithoutResult && !entry.operationalReason
      ? [{ requestId: entry.requestId, requestNumber: entry.requestNumber, title: entry.title, predicted: entry.predicted }]
      : []);
    return {
      projectId: rowsInProject[0].projectId,
      name: projectName(rowsInProject),
      measured,
      predictions,
      stillDueCount: entries.filter(entry => entry.stillDue).length,
      requests: entries,
      // Spec #151 (US35): a Project with nothing measured says so in the same words, whatever the period.
      emptyMessage: measured.length === 0 ? "Nothing measured this period yet" : null,
    };
  }).sort((a, b) => (a.projectId === null) !== (b.projectId === null) ? (a.projectId === null ? 1 : -1) : a.name.localeCompare(b.name));

  if (viewer.role === "guest") return { myWork: { requests: myWork }, byProject, wholeOrg: null };

  const entries = visible.map(row => ({ row, entry: entryOf(row, now) }));
  const measuredResults = entries.flatMap(({ entry }) => entry.result && inPeriod(entry.releaseDate, period) ? [entry.result] : []);
  const lines = linesOf(measuredResults);
  const timeline = entries.flatMap(({ entry }) => entry.stillDue ? [entry.stillDue] : []).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.requestNumber - b.requestNumber);

  const projectStacks = [...projectGroups.entries()].map(([key, rowsInProject]) => {
    const counts: Partial<Record<JourneyLabel, number>> = {};
    for (const row of rowsInProject) {
      const label = journeyStatus(row).label;
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return { projectId: key === "" ? null : key, name: projectName(rowsInProject), counts };
  }).sort((a, b) => (a.projectId === null) !== (b.projectId === null) ? (a.projectId === null ? 1 : -1) : a.name.localeCompare(b.name));

  return {
    myWork: { requests: myWork },
    byProject,
    wholeOrg: {
      period,
      lines,
      emptyMessage: lines.length === 0 ? "Nothing measured this period yet" : null,
      operational: byRequestNumber(entries.flatMap(({ row }) => row.noMeasurableImpactReason ? [{ requestId: row.id, requestNumber: row.requestNumber, title: row.title, projectName: row.projectName, reason: row.noMeasurableImpactReason }] : [])),
      closedWithoutResult: byRequestNumber(entries.flatMap(({ row }) => row.exceptionClosure ? [{ requestId: row.id, requestNumber: row.requestNumber, title: row.title, projectName: row.projectName, reasonCode: row.exceptionClosure.reasonCode, reason: row.exceptionClosure.reason }] : [])),
      timeline,
      // Spec #151 (US32, decisions): a Request with no release date is never in a period, whether Done or still open.
      // Operational work and closed-without-result Requests already sit in their own excluded sections.
      unreleased: byRequestNumber(entries.flatMap(({ row, entry }) => entry.releaseDate === null && !row.noMeasurableImpactReason && !row.exceptionClosure ? [{ requestId: row.id, requestNumber: row.requestNumber, title: row.title }] : [])),
      projectStacks,
    },
  };
}
