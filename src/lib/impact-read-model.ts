/**
 * The impact read model: pure functions that turn a workspace's Request rows into the Impact page for one viewer:
 * My work (#155) and the Outcome report for a month, quarter or year (#208, which merged the earlier By project and
 * Whole org views), plus a Metric definition's uses (#203). Spec #151, #195.
 *
 * Screens render what this returns and compute no totals of their own. Visibility is applied here as well as
 * in the database query (src/lib/data/impact.ts), so a guest never receives another person's Request.
 *
 * Rules, all enforced here:
 * - A total is only ever a sum of results that share a Metric definition, audience (platform included) and window
 *   (#201): one line per match, named with the definition's current name and counted in its unit. Two definitions
 *   with the same name never share a line; a merged definition counts as the one it was merged into, and an archived
 *   one still counts. A metric the Metrics library can't place, and every Pass/fail check (never a definition), keeps
 *   a line per saved name and unit, never shared with a definition's. Percentages are never summed.
 * - Verified (pass/fail) results are tallied as good or bad, never summed.
 * - A result shared by several Requests (the same observation) is counted once; every Request is listed.
 * - A result corrected after closing counts at its latest corrected value (`correctedFrom` keeps the value recorded at
 *   closing); a text-only Correction from before corrected values were recorded leaves the closing value counted.
 * - Operational work and Requests closed without a result are never in a line or total.
 * - A Request is in the period of its release date (UTC). One never Released is in no period, except one closed without a
 *   result before any Release: it is listed (never as shipped or in a total) in the period it was closed (UTC).
 * - Nothing per person: no totals, averages, scores or rankings for anyone.
 */
import { agreedResult, CORRECTION_FIELD_OPTIONS, EXCEPTION_REASON_OPTIONS, guardrailHeld, type ClosureCorrection, type ExceptionReason, type OutcomeClosure, type OutcomeException } from "./request-outcome";
import { measurementAudienceLabel, measurementPlatformLabel, measurementUnitLabel } from "./request-measurement";
import type { MetricUnit } from "./metric-definition-rules";
import type { GuardrailOperator } from "./guardrail-comparison";
import { impactStateOf, type ExpectedImpact } from "./request-impact";
import { journeyStatus, requesterOf, type JourneyLabel } from "./request-journey";
import { releaseMeasurement, valueBeforeReleaseFor } from "./request-release-facts";
import type { ReleaseFact, ReleaseState } from "./request-release";
import { DAY_MS, utcDay } from "./utc-day";
import type { WorkspacePermission } from "./auth-guard";
import { inPeriod, periodLabel, quarterOf, quartersOf, type ImpactPeriod, type Month, type Quarter } from "./impact-period";
import { iterationLabel } from "./same-problem-rules";

/** A Viewer (#210) reads exactly what a Member reads; only a Guest is narrowed to their own Requests. */
export type ImpactViewer = { userId: string; orgId: string; role: WorkspacePermission };
export type { ImpactPeriod, Month };
export type ImpactOptions = {
  now?: Date;
  period?: ImpactPeriod | null;
  /** The workspace's Quarter notes (#209), each with its last editor's name. The loader reads only the period's quarters. */
  quarterNotes?: QuarterNote[];
};

/** A workspace's Quarter note as the loader gives it: plain text, who last edited it (by name) and when. */
export type QuarterNote = { year: number; quarter: Quarter; text: string; editorName: string; editedAt: string };

/** One Request, as the read model needs it. Load it from the database with src/lib/data/impact.ts. */
export type ImpactRow = {
  id: string;
  orgId: string;
  requestNumber: number;
  title: string;
  /** The problem the Request states: its reframed problem, else its description. */
  problem: string;
  createdBy: string;
  /** The Member who took a Guest submission on (#212): the Requester unless it was handed over since. */
  takenOnBy: string | null;
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
  /** When the Request was filed: the order of its Same problem group's Iterations (#218). */
  createdAt: Date;
  /** The Same problem group the Request is in (#218), or null. Never a Follow-up's link, which is `followUpOf`. */
  sameProblemGroup: string | null;
  /**
   * The Metric definitions this Request's metrics count under now (after any merge), by saved position: 0 the main
   * metric, then guardrails from 1. They resolve the prediction a result is judged against: the closed result's
   * `expected` once Closed, otherwise the Expected impact. A metric with no entry has no definition (a Pass/fail check,
   * or one the library can't place). The loader fills this through the Metrics library (`resolveSavedMetrics`).
   */
  definitions: ImpactDefinition[];
};

/** A Metric definition one of a Request's metrics resolves to, at its saved position. */
export type ImpactDefinition = { position: number; id: string; name: string; unit: MetricUnit };

export type BaselineState = "known" | "unknown" | "new_capability" | "not_applicable";
/** Where a known baseline came from: the value recorded before release, or (a release from before #151 decision 3) the planning baseline. */
export type BaselineSource = "release" | "planning";
export type Verdict = "good" | "bad";
export type RequestRef = { requestId: string; requestNumber: number; title: string };

/** A predicted result: what was agreed before release. */
export type Prediction = {
  /** The Metric definition the main metric counts under, or null (a Pass/fail check, or a metric the library can't place). */
  definitionId: string | null;
  /** The definition's current name, else the name the Request saved. */
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
export type GuardrailView = { definitionId: string | null; metric: string; operator: string; limit: number; unit: string; actual: number; held: boolean };

/** One measured result for one Request. `requests` lists every Request that shares it (one, unless shared). */
export type ResultView = {
  requestId: string;
  requestNumber: number;
  title: string;
  definitionId: string | null;
  metric: string;
  form: "numeric" | "pass_fail";
  unit: string;
  changeUnit: string | null;
  audience: string;
  platform: string;
  window: string;
  baselineState: BaselineState;
  /** The baseline the change is measured from: the value before release, else the planning baseline (legacy). */
  baseline: number | null;
  baselineSource: BaselineSource | null;
  /** The planning baseline entered at Request creation, shown beside the predicted change so the plan stays visible. */
  plannedBaseline: number | null;
  /** The actual result counted: the latest corrected value, else the one recorded at closing. */
  actual: number | null;
  change: number | null;
  verdict: Verdict | null;
  /** The result as recorded at closing, set only when a Correction stated another value (shown marked "corrected"). */
  correctedFrom: { actual: number | null; verdict: Verdict | null } | null;
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

/**
 * Results that share a Metric definition, audience and window (without a definition: the same saved name and unit).
 * `summed` is set only for numeric lines that are not percentages.
 */
export type ResultLine = {
  definitionId: string | null;
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
  /** Verified results tallied as good or bad. Never summed as numbers, and never a neutral count (neutral is not produced). */
  verdicts: { good: number; bad: number } | null;
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
  /** The follow-up Requests linked to this one that the viewer may see (spec US7). */
  followUps: RequestRef[];
};

export type MyWorkEntry = RequestEntry & { role: "requester" | "picker" | "both" };

/** The Impact page (#208): My work for everyone, and the Outcome report for everyone except a guest (null for a guest). */
export type ImpactDashboard = {
  myWork: { requests: MyWorkEntry[] };
  outcomeReport: OutcomeReport | null;
};

export const NO_PROJECT = "No Project";

const definitionAt = (definitions: ImpactDefinition[], position: number) => definitions.find(definition => definition.position === position) ?? null;

/**
 * The predicted scope of an agreed expectation. Its window reads like the closure's window, so the two can be compared.
 * A main metric with a Metric definition takes the definition's current name and unit; a Pass/fail check never has one.
 */
function predictionOf(impact: ExpectedImpact, definitions: ImpactDefinition[]): Prediction {
  const saved = agreedResult(impact);
  const definition = saved.form === "numeric" ? definitionAt(definitions, 0) : null;
  const agreed = definition ? { ...saved, label: definition.name, unit: measurementUnitLabel(definition.unit) } : saved;
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
    definitionId: definition?.id ?? null,
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

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

function windowOfRelease(release: ReleaseFact): string {
  if (release.windowKind === "fixed") return `${release.startDate} to ${release.dueDate}`;
  return `${daysBetween(release.startDate, release.dueDate)} days after release`;
}

/**
 * The saved position (see `ImpactRow.definitions`) of each guardrail `agreedResult` lists, in its order: a measurement
 * plan's guardrails count from 1 and skip any without a limit; older kinds number `guardrail` 1, then
 * `additionalGuardrails` from 2 (as `savedMetricsOf` does).
 */
function guardrailPositions(impact: ExpectedImpact): number[] {
  if (impact.kind === "measurement") return impact.guardrails.flatMap((guardrail, index) => guardrail.limit === null ? [] : [index + 1]);
  return [impact.guardrail ? [1] : [], (impact.additionalGuardrails ?? []).flatMap((guardrail, index) => guardrail ? [index + 2] : [])].flat();
}

function guardrailViews(row: ImpactRow, closure: OutcomeClosure): GuardrailView[] {
  const positions = guardrailPositions(closure.expected);
  return closure.guardrails.map((guardrail, index) => {
    const definition = definitionAt(row.definitions, positions[index] ?? -1);
    return {
      definitionId: definition?.id ?? null,
      metric: definition?.name ?? guardrail.metric,
      operator: guardrail.operator,
      limit: guardrail.limit,
      unit: definition ? measurementUnitLabel(definition.unit) : guardrail.unit,
      actual: guardrail.actual,
      held: guardrailHeld(guardrail),
    };
  });
}

/** The latest Correction of the actual result that stated a value of the closure's own form, if any. */
function correctedResultOf(row: ImpactRow, closure: OutcomeClosure): ClosureCorrection | null {
  return row.closureCorrections.filter(correction => correction.field === "actual" && correction.value?.kind === closure.primary.kind)
    .sort((a, b) => a.revision - b.revision).at(-1) ?? null;
}

const verdictOf = (passed: boolean | null): Verdict | null => passed === null ? null : passed ? "good" : "bad";

function measuredResult(row: ImpactRow, closure: OutcomeClosure): ResultView {
  const prediction = predictionOf(closure.expected, row.definitions);
  const recorded = { actual: closure.primary.kind === "numeric" ? closure.primary.actual : null, verdict: verdictOf(closure.primary.kind === "pass_fail" ? closure.primary.passed : null) };
  const correctedTo = correctedResultOf(row, closure)?.value ?? null;
  const actual = correctedTo ? correctedTo.kind === "numeric" ? correctedTo.actual : null : recorded.actual;
  const verdict = correctedTo ? verdictOf(correctedTo.kind === "pass_fail" ? correctedTo.passed : null) : recorded.verdict;
  // Change is measured from the value recorded before release (#151 decision 3). A release recorded before that has none,
  // so it keeps the planning baseline, and every view labels it as such. A new capability or unknown baseline has no change.
  const planned = prediction.baselineState === "known" ? prediction.baseline : null;
  const before = valueBeforeReleaseFor(row.releaseState, closure.release);
  const baselineSource: BaselineSource | null = planned === null ? null : before ? "release" : "planning";
  const baseline = baselineSource === "release" ? before!.value : planned;
  const change = baseline !== null && actual !== null ? actual - baseline : null;
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    title: row.title,
    definitionId: prediction.definitionId,
    metric: prediction.metric,
    form: prediction.form,
    unit: prediction.unit,
    changeUnit: prediction.changeUnit,
    audience: prediction.audience,
    platform: prediction.platform,
    window: windowOfRelease(closure.release),
    baselineState: prediction.baselineState,
    baseline,
    baselineSource,
    plannedBaseline: prediction.baseline,
    actual,
    change,
    verdict,
    correctedFrom: correctedTo ? recorded : null,
    predictedTarget: prediction.target,
    predictedChange: prediction.predictedChange,
    releaseDate: closure.release.exposureDate,
    observedFrom: closure.observedFrom,
    observedTo: closure.observedTo,
    evidence: closure.evidence,
    guardrails: guardrailViews(row, closure),
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
  const state = impactStateOf(row);
  const predicted = state.kind === "measured" ? predictionOf(state.plan, row.definitions) : null;
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

/** One Request's entry. `visible` is the viewer's Requests, so a follow-up the viewer cannot see is never listed. */
function entryOf(row: ImpactRow, now: Date, visible: ImpactRow[]): RequestEntry {
  const measured = row.outcomeClosure ? measuredResult(row, row.outcomeClosure) : null;
  const state = impactStateOf(row);
  const source = row.outcomeClosure?.expected ?? (state.kind === "measured" ? state.plan : null);
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    title: row.title,
    projectId: row.projectId,
    projectName: row.projectName,
    journey: journeyStatus(row).label,
    operationalReason: state.kind === "operational" ? state.reason : null,
    predicted: source ? predictionOf(source, row.definitions) : null,
    result: measured,
    stillDue: dueItemOf(row, now),
    closedWithoutResult: row.exceptionClosure ? { reasonCode: row.exceptionClosure.reasonCode, reason: row.exceptionClosure.reason } : null,
    corrections: correctionsOf(row),
    releaseDate: releaseDateOf(row),
    followUpOf: row.followUpOf,
    followUps: followUpsOf(row, visible),
  };
}

function followUpsOf(row: ImpactRow, visible: ImpactRow[]): RequestRef[] {
  return byRequestNumber(visible.filter(other => other.followUpOf === row.id).map(({ id, requestNumber, title }) => ({ requestId: id, requestNumber, title })));
}

/**
 * The totals rule (#201): one line per Metric definition, audience, platform and window. A result without a definition
 * (a Pass/fail check, or a metric the library can't place) lines up only with others of the same saved name, form and
 * unit, and never with a definition's results, even one with the same name.
 */
function lineKey(result: ResultView): unknown[] {
  const metric = result.definitionId === null ? ["saved", result.metric, result.form, result.unit] : ["definition", result.definitionId];
  return [...metric, result.audience, result.platform, result.window];
}

/** The same observation attributed to several Requests: one result, counted once. */
function sharedKey(result: ResultView): string {
  return JSON.stringify([...lineKey(result), result.actual, result.verdict, result.observedFrom, result.observedTo, result.evidence.trim().toLowerCase(), result.guardrails.map(guardrail => guardrail.actual)]);
}

/** Percentages are labelled as percentage points and are never summed or averaged (spec US24). */
function isPercentage(unit: string): boolean {
  return ["%", "percent", "percentage", "percentage points", "percentage point"].includes(unit.trim().toLowerCase());
}

function linesOf(results: ResultView[]): ResultLine[] {
  const shared = new Map<string, ResultView[]>();
  for (const result of [...results].sort((a, b) => a.requestNumber - b.requestNumber)) {
    const key = sharedKey(result);
    shared.set(key, [...(shared.get(key) ?? []), result]);
  }
  const distinct = [...shared.values()].map(group => ({ ...group[0], requests: group.map(({ requestId, requestNumber, title }) => ({ requestId, requestNumber, title })) }));

  const byLine = new Map<string, ResultView[]>();
  for (const result of distinct) {
    const key = JSON.stringify(lineKey(result));
    byLine.set(key, [...(byLine.get(key) ?? []), result]);
  }

  return [...byLine.values()].map(group => {
    const first = group[0];
    // Only a line of a non-percentage unit is summed, and only when every result on it has a known change:
    // an unknown baseline or a new capability (no change) keeps the count but never a partial total (spec US37).
    const summable = first.form === "numeric" && !isPercentage(first.unit);
    const changes = group.flatMap(result => result.change === null ? [] : [result.change]);
    return {
      definitionId: first.definitionId,
      metric: first.metric,
      form: first.form,
      unit: first.unit,
      changeUnit: first.changeUnit,
      audience: first.audience,
      platform: first.platform,
      window: first.window,
      results: group,
      count: group.length,
      summed: summable ? { count: group.length, change: changes.length === group.length ? changes.reduce((sum, change) => sum + change, 0) : null } : null,
      verdicts: first.form === "pass_fail" ? {
        good: group.filter(result => result.verdict === "good").length,
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
function entriesForPerson(visible: ImpactRow[], personId: string, now: Date): MyWorkEntry[] {
  return byRequestNumber(visible.flatMap(row => {
    const requester = requesterOf(row) === personId;
    const picker = row.assignedTo === personId;
    if (!requester && !picker) return [];
    const role: MyWorkEntry["role"] = requester && picker ? "both" : requester ? "requester" : "picker";
    return [{ ...entryOf(row, now, visible), role }];
  }));
}

/**
 * A teammate's list (spec story 12): the same entries as My work, for one person, shown to a non-guest viewer.
 * Null for a guest, who has no view of anyone else's Requests. Holds no totals, averages, scores or rankings.
 */
export function buildTeammateWork(viewer: ImpactViewer, rows: ImpactRow[], personId: string, options: ImpactOptions = {}): MyWorkEntry[] | null {
  if (viewer.role === "guest") return null;
  return entriesForPerson(visibleTo(viewer, rows), personId, options.now ?? new Date());
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

/** How a use of a Metric definition stands: measured, still due (never zero), or closed without a result. */
export type DefinitionUseOutcome<Measured> =
  | ({ kind: "measured" } & Measured)
  | { kind: "still_due"; due: { dueDate: string; dueLabel: string } | null }
  | { kind: "closed_without_result"; reason: string };

/** A Request whose main metric counts under the definition: what it predicted beside what happened. */
export type DefinitionMainUse = RequestRef & {
  journey: JourneyLabel;
  predicted: Prediction;
  outcome: DefinitionUseOutcome<{ result: ResultView }>;
};

/** A Request with a guardrail that counts under the definition: the limit it agreed beside what was measured. */
export type DefinitionGuardrailUse = RequestRef & {
  journey: JourneyLabel;
  /** The guardrail's saved position (guardrails count from 1), so one Request's two guardrails stay apart. */
  position: number;
  /** The Request's main metric, which the guardrail protected. */
  mainMetric: string;
  limit: { operator: GuardrailOperator; limit: number; unit: string };
  outcome: DefinitionUseOutcome<{ actual: number | null; held: boolean | null }>;
};

/** Requests that used a definition in one Project ("No Project" last). */
export type DefinitionUseGroup<Use> = { projectId: string | null; name: string; uses: Use[] };

/** Every Request that used one Metric definition (#203), main-metric uses apart from guardrail uses. Nothing by person. */
export type DefinitionUses = {
  definitionId: string;
  main: DefinitionUseGroup<DefinitionMainUse>[];
  guardrails: DefinitionUseGroup<DefinitionGuardrailUse>[];
};

/** A use with no measured result: closed without one, else still due (from its release's due date, once released). */
function waitingOutcome(row: ImpactRow, now: Date): Exclude<DefinitionUseOutcome<object>, { kind: "measured" }> {
  if (row.exceptionClosure) return { kind: "closed_without_result", reason: row.exceptionClosure.reason };
  const release = row.releaseState?.release ?? null;
  const due = releaseMeasurement(release, now);
  return { kind: "still_due", due: release && due ? { dueDate: release.dueDate, dueLabel: due.label } : null };
}

function byProjectGroups<Use extends RequestRef>(items: { row: ImpactRow; use: Use }[]): DefinitionUseGroup<Use>[] {
  const groups = new Map<string, { row: ImpactRow; use: Use }[]>();
  for (const item of items) groups.set(item.row.projectId ?? "", [...(groups.get(item.row.projectId ?? "") ?? []), item]);
  return [...groups.values()].map(group => ({
    projectId: group[0].row.projectId,
    name: group[0].row.projectName ?? NO_PROJECT,
    uses: byRequestNumber(group.map(item => item.use)),
  })).sort((a, b) => (a.projectId === null) !== (b.projectId === null) ? (a.projectId === null ? 1 : -1) : a.name.localeCompare(b.name));
}

/**
 * Every Request the viewer may see that predicted one Metric definition (#203, spec stories 38–43), grouped by Project.
 * Uses follow the definitions each Request resolves to now, so a definition merged into this one brings its Requests.
 * Null for a guest, who can't open the Metrics library.
 */
export function buildDefinitionUses(viewer: ImpactViewer, rows: ImpactRow[], definitionId: string, options: ImpactOptions = {}): DefinitionUses | null {
  if (viewer.role === "guest") return null;
  const now = options.now ?? new Date();
  const visible = visibleTo(viewer, rows);
  const main = visible.flatMap(row => {
    if (definitionAt(row.definitions, 0)?.id !== definitionId) return [];
    const entry = entryOf(row, now, visible);
    if (!entry.predicted || entry.predicted.definitionId !== definitionId) return [];
    const outcome: DefinitionMainUse["outcome"] = entry.result ? { kind: "measured", result: entry.result } : waitingOutcome(row, now);
    return [{ row, use: { requestId: row.id, requestNumber: row.requestNumber, title: row.title, journey: entry.journey, predicted: entry.predicted, outcome } }];
  });
  const guardrails = visible.flatMap(row => {
    const state = impactStateOf(row);
    const source = row.outcomeClosure?.expected ?? (state.kind === "measured" ? state.plan : null);
    if (!source) return [];
    const positions = guardrailPositions(source);
    return agreedResult(source).guardrails.flatMap((guardrail, index) => {
      const definition = definitionAt(row.definitions, positions[index] ?? -1);
      if (!definition || definition.id !== definitionId) return [];
      const entry = entryOf(row, now, visible);
      const measured = row.outcomeClosure?.guardrails[index] ?? null;
      const outcome: DefinitionGuardrailUse["outcome"] = row.outcomeClosure
        ? { kind: "measured", actual: measured?.actual ?? null, held: measured ? guardrailHeld(measured) : null }
        : waitingOutcome(row, now);
      const use: DefinitionGuardrailUse = {
        requestId: row.id, requestNumber: row.requestNumber, title: row.title, journey: entry.journey, position: positions[index],
        mainMetric: entry.predicted?.metric ?? "",
        limit: { operator: guardrail.operator, limit: guardrail.limit, unit: measurementUnitLabel(definition.unit) },
        outcome,
      };
      return [{ row, use }];
    });
  });
  return { definitionId, main: byProjectGroups(main), guardrails: byProjectGroups(guardrails) };
}

/**
 * The Impact page for one viewer (#208): My work (unchanged since #155) and the Outcome report for the chosen period.
 * The period only shapes the report; My work lists every Request the viewer requested or picked up.
 */
export function buildImpactDashboard(viewer: ImpactViewer, rows: ImpactRow[], options: ImpactOptions = {}): ImpactDashboard {
  const now = options.now ?? new Date();
  const myWork = entriesForPerson(visibleTo(viewer, rows), viewer.userId, now);
  return { myWork: { requests: myWork }, outcomeReport: buildOutcomeReport(viewer, rows, { ...options, now }) };
}

/** A guardrail as the report shows it: its limit, and what was measured once the result is recorded (null until then). */
export type ReportGuardrail = Omit<GuardrailView, "actual" | "held"> & { actual: number | null; held: boolean | null };

/** What a Released Request did: its measured result, the date its result is due, or operational work (never measured). */
export type ReportOutcome =
  | { kind: "measured"; result: ResultView }
  | { kind: "still_due"; dueDate: string; dueLabel: string }
  | { kind: "operational"; reason: string };

/** One Request Released in the report's period, in its current Project's section. */
export type OutcomeReportEntry = RequestRef & {
  problem: string;
  journey: JourneyLabel;
  releaseDate: string;
  predicted: Prediction | null;
  outcome: ReportOutcome;
  guardrails: ReportGuardrail[];
  corrected: CorrectedValue[];
  /** What we learned (#209), or null when it wasn't given. */
  learned: LearnedLine | null;
  /** The Follow-up Requests linked to this one that the viewer may see. */
  followUps: RequestRef[];
  /** Its place among the attempts at its problem (#218), "3rd iteration", or null when it is in no Same problem group. */
  iteration: IterationNote | null;
};

/**
 * What we learned (#209): the line given at closing, or its latest Correction marked corrected. The Request page keeps
 * the original beside every Correction; the report shows the current wording.
 */
export type LearnedLine = { text: string; corrected: boolean };

/**
 * A closed record's part as its latest Correction words it, shown marked "corrected". The record itself never changes;
 * the Request page shows the original beside every Correction. A stated corrected result is in `ResultView` instead.
 */
export type CorrectedValue = { field: ClosureCorrection["field"]; label: string; value: string; at: string };

/**
 * A Request closed without a result: Released in the period, or (`releaseDate` null) closed in the period before any
 * Release. `closedOn` is the UTC day it was closed.
 */
export type ReportClosedItem = RequestRef & { problem: string; projectName: string | null; releaseDate: string | null; closedOn: string; reason: string; corrected: CorrectedValue[]; learned: LearnedLine | null; iteration: IterationNote | null };

/** One quarter's place for its Quarter note at the end of the report (#209): the note, or null when none is written. */
export type QuarterNoteSlot = { year: number; quarter: Quarter; label: string; note: Omit<QuarterNote, "year" | "quarter"> | null };

/** Closed without a result, one group per reason that has any, in the closing form's order. */
export type ReportClosedGroup = { reasonCode: ExceptionReason; label: string; requests: ReportClosedItem[] };

/** A current Project's section of the report, or "No Project" (last). */
export type OutcomeReportSection = { projectId: string | null; name: string; requests: OutcomeReportEntry[] };

/** The Outcome report (#208): what was Released in one month, quarter or year, and what it did. Nothing by person. */
export type OutcomeReport = {
  period: ImpactPeriod;
  /** The UTC date the report is up to date as of: it is live, read when the page is opened. */
  asOf: string;
  /**
   * Requests Released in the period: all of them, those with a measured result and those still due; and those closed
   * without a result, Released in the period or closed in it before any Release.
   */
  atAGlance: { shipped: number; measured: number; stillDue: number; closedWithoutResult: number };
  /** One line per Metric definition match (#151 rules, #201). Quarters and years only: null for a month, so small samples don't mislead. */
  totals: ResultLine[] | null;
  projects: OutcomeReportSection[];
  closedWithoutResult: ReportClosedGroup[];
  /** Set only when nothing was Released in the period, nor closed in it before any Release. */
  emptyMessage: string | null;
  /** The Quarter notes the report ends with: the quarter's own, all four of a year's (empty ones included), none for a month. */
  quarterNotes: QuarterNoteSlot[];
};

/** A Request's guardrails: as measured once its result is recorded, else the limits it agreed, under each definition's current name. */
function reportGuardrails(row: ImpactRow, source: ExpectedImpact | null): ReportGuardrail[] {
  if (row.outcomeClosure) return guardrailViews(row, row.outcomeClosure);
  if (!source) return [];
  const positions = guardrailPositions(source);
  return agreedResult(source).guardrails.map((guardrail, index) => {
    const definition = definitionAt(row.definitions, positions[index] ?? -1);
    return {
      definitionId: definition?.id ?? null,
      metric: definition?.name ?? guardrail.metric,
      operator: guardrail.operator,
      limit: guardrail.limit,
      unit: definition ? measurementUnitLabel(definition.unit) : guardrail.unit,
      actual: null,
      held: null,
    };
  });
}

function reportEntryOf(row: ImpactRow, releaseDate: string, now: Date, visible: ImpactRow[], notes: Map<string, IterationNote>): OutcomeReportEntry {
  const state = impactStateOf(row);
  const source = row.outcomeClosure?.expected ?? (state.kind === "measured" ? state.plan : null);
  const release = row.releaseState?.release ?? null;
  const outcome: ReportOutcome = row.outcomeClosure
    ? { kind: "measured", result: measuredResult(row, row.outcomeClosure) }
    : state.kind === "operational"
      ? { kind: "operational", reason: state.reason }
      : { kind: "still_due", dueDate: release!.dueDate, dueLabel: releaseMeasurement(release, now)!.label };
  return {
    requestId: row.id,
    requestNumber: row.requestNumber,
    title: row.title,
    problem: row.problem,
    journey: journeyStatus(row).label,
    releaseDate,
    predicted: source ? predictionOf(source, row.definitions) : null,
    outcome,
    guardrails: reportGuardrails(row, source),
    corrected: correctedValues(row),
    learned: learnedOf(row),
    followUps: followUpsOf(row, visible),
    iteration: notes.get(row.id) ?? null,
  };
}

function learnedOf(row: ImpactRow): LearnedLine | null {
  const latest = row.closureCorrections.filter(correction => correction.field === "learned").sort((a, b) => a.revision - b.revision).at(-1);
  if (latest) return { text: latest.correction, corrected: true };
  const original = row.outcomeClosure?.learned ?? row.exceptionClosure?.learned;
  return original ? { text: original, corrected: false } : null;
}

function quarterNoteSlots(period: ImpactPeriod, notes: QuarterNote[]): QuarterNoteSlot[] {
  return quartersOf(period).map(({ year, quarter }) => {
    const found = notes.find(note => note.year === year && note.quarter === quarter);
    return { year, quarter, label: periodLabel({ kind: "quarter", year, quarter }), note: found ? { text: found.text, editorName: found.editorName, editedAt: found.editedAt } : null };
  });
}

/**
 * The latest Correction of each corrected field, in the Correction form's field order. What we learned has its own line
 * (`learnedOf`), and an actual result corrected to a stated value shows in the result itself (`correctedFrom`).
 */
function correctedValues(row: ImpactRow): CorrectedValue[] {
  const statedResult = row.outcomeClosure ? correctedResultOf(row, row.outcomeClosure) : null;
  return CORRECTION_FIELD_OPTIONS.filter(({ value }) => value !== "learned" && !(value === "actual" && statedResult)).flatMap(({ value: field, label }) => {
    const latest = row.closureCorrections.filter(correction => correction.field === field).sort((a, b) => a.revision - b.revision).at(-1);
    return latest ? [{ field, label, value: latest.correction, at: latest.at }] : [];
  });
}

function closedGroups(closed: { row: ImpactRow; releaseDate: string | null }[], notes: Map<string, IterationNote>): ReportClosedGroup[] {
  return EXCEPTION_REASON_OPTIONS.flatMap(({ value: reasonCode, label }) => {
    const requests = byRequestNumber(closed.flatMap(({ row, releaseDate }) => row.exceptionClosure?.reasonCode === reasonCode ? [{
      requestId: row.id,
      requestNumber: row.requestNumber,
      title: row.title,
      problem: row.problem,
      projectName: row.projectName,
      releaseDate,
      closedOn: utcDay(new Date(row.exceptionClosure.closedAt)),
      reason: row.exceptionClosure.reason,
      corrected: correctedValues(row),
      learned: learnedOf(row),
      iteration: notes.get(row.id) ?? null,
    }] : []));
    return requests.length > 0 ? [{ reasonCode, label, requests }] : [];
  });
}

/**
 * The Outcome report for a viewer and a period (#208, spec stories 88–103), grouped by release date (UTC). Null for a
 * guest, who receives nothing. With no period chosen it reports the current quarter.
 */
export function buildOutcomeReport(viewer: ImpactViewer, rows: ImpactRow[], options: ImpactOptions = {}): OutcomeReport | null {
  if (viewer.role === "guest") return null;
  const now = options.now ?? new Date();
  const period = options.period ?? quarterOf(now);
  const visible = visibleTo(viewer, rows);
  const released = visible.flatMap(row => {
    const releaseDate = releaseDateOf(row);
    return releaseDate !== null && inPeriod(releaseDate, period) ? [{ row, releaseDate }] : [];
  });
  // Closed without a result before any Release: never shipped, so it belongs to the period it was closed in.
  const closedUnreleased = visible.flatMap(row => row.exceptionClosure && releaseDateOf(row) === null && inPeriod(utcDay(new Date(row.exceptionClosure.closedAt)), period) ? [{ row, releaseDate: null }] : []);
  const closed = [...released.filter(({ row }) => row.exceptionClosure), ...closedUnreleased];
  // Closed without a result has its own list, by reason; every other Released Request sits in its current Project.
  const notes = iterationNotes(visible);
  const projects = byProjectGroups(released.flatMap(({ row, releaseDate }) => row.exceptionClosure ? [] : [{ row, use: reportEntryOf(row, releaseDate, now, visible, notes) }]))
    .map(({ projectId, name, uses }) => ({ projectId, name, requests: uses }));
  const atAGlance = {
    shipped: released.length,
    measured: released.filter(({ row }) => row.outcomeClosure).length,
    // Operational work is never measured, so it is never still due, even once Released.
    stillDue: projects.flatMap(section => section.requests).filter(entry => entry.outcome.kind === "still_due").length,
    closedWithoutResult: closed.length,
  };
  const results = released.flatMap(({ row }) => row.outcomeClosure ? [measuredResult(row, row.outcomeClosure)] : []);
  const totals = period.kind === "month" ? null : linesOf(results);
  return {
    period,
    asOf: utcDay(now),
    atAGlance,
    totals,
    projects,
    closedWithoutResult: closedGroups(closed, notes),
    emptyMessage: released.length === 0 && closed.length === 0 ? `Nothing was Released in ${periodLabel(period)}.` : null,
    quarterNotes: quarterNoteSlots(period, options.quarterNotes ?? []),
  };
}

/** A Request's place among the attempts at its problem (#218): its number in its group and "3rd iteration". */
export type IterationNote = { number: number; label: string };

/** How an Iteration stands: its measured result, its reason when Closed without a result, operational work, or still due. */
export type IterationOutcome =
  | { kind: "measured"; result: ResultView }
  | { kind: "closed_without_result"; reasonCode: ExceptionReason; label: string; reason: string }
  | { kind: "operational"; reason: string }
  /** `due` is null until it is Released. */
  | { kind: "still_due"; due: { dueDate: string; dueLabel: string } | null };

/** One attempt at the problem: what it predicted beside what happened. `current` marks the Request being read. */
export type IterationEntry = RequestRef & IterationNote & {
  current: boolean;
  journey: JourneyLabel;
  predicted: Prediction | null;
  outcome: IterationOutcome;
};

/** "Iterations of this problem" on a Request page (#218): its Same problem group, oldest first. */
export type Iterations = { current: IterationNote; iterations: IterationEntry[] };

/**
 * Every visible Request's Same problem group, oldest first by filing time (then number), keyed by group. A group the
 * viewer sees only one Request of is no group. Numbers are worked out here, every time, and never stored.
 */
function sameProblemGroups(visible: ImpactRow[]): Map<string, ImpactRow[]> {
  const groups = new Map<string, ImpactRow[]>();
  for (const row of visible) if (row.sameProblemGroup) groups.set(row.sameProblemGroup, [...(groups.get(row.sameProblemGroup) ?? []), row]);
  for (const [key, members] of groups) {
    if (members.length < 2) groups.delete(key);
    else members.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.requestNumber - b.requestNumber);
  }
  return groups;
}

function iterationNotes(visible: ImpactRow[]): Map<string, IterationNote> {
  const notes = new Map<string, IterationNote>();
  for (const members of sameProblemGroups(visible).values()) members.forEach((row, index) => notes.set(row.id, { number: index + 1, label: iterationLabel(index + 1) }));
  return notes;
}

function iterationOutcome(row: ImpactRow, now: Date): IterationOutcome {
  if (row.outcomeClosure) return { kind: "measured", result: measuredResult(row, row.outcomeClosure) };
  if (row.exceptionClosure) {
    const { reasonCode, reason } = row.exceptionClosure;
    return { kind: "closed_without_result", reasonCode, label: EXCEPTION_REASON_OPTIONS.find(option => option.value === reasonCode)?.label ?? "Closed without a result", reason };
  }
  const state = impactStateOf(row);
  if (state.kind === "operational") return { kind: "operational", reason: state.reason };
  const release = row.releaseState?.release ?? null;
  const due = releaseMeasurement(release, now);
  return { kind: "still_due", due: release && due ? { dueDate: release.dueDate, dueLabel: due.label } : null };
}

/**
 * "Iterations of this problem" for one Request (#218, spec stories 153–155): its Same problem group, oldest first,
 * each with its status, prediction and result (or reason, when Closed without a result), the Request being read
 * marked with its number. Follow-ups are never iterations unless also linked as Same problem. Null for a Request in
 * no group, and for a guest, who sees no links. Nothing by person.
 */
export function buildIterations(viewer: ImpactViewer, rows: ImpactRow[], requestId: string, options: ImpactOptions = {}): Iterations | null {
  if (viewer.role === "guest") return null;
  const now = options.now ?? new Date();
  const visible = visibleTo(viewer, rows);
  const group = visible.find(row => row.id === requestId)?.sameProblemGroup;
  const members = group ? sameProblemGroups(visible).get(group) : undefined;
  if (!members) return null;
  const iterations = members.map((row, index): IterationEntry => {
    const state = impactStateOf(row);
    const source = row.outcomeClosure?.expected ?? (state.kind === "measured" ? state.plan : null);
    return {
      requestId: row.id,
      requestNumber: row.requestNumber,
      title: row.title,
      number: index + 1,
      label: iterationLabel(index + 1),
      current: row.id === requestId,
      journey: journeyStatus(row).label,
      predicted: source ? predictionOf(source, row.definitions) : null,
      outcome: iterationOutcome(row, now),
    };
  });
  const current = iterations.find(entry => entry.current)!;
  return { current: { number: current.number, label: current.label }, iterations };
}
