/**
 * The impact read model: one pure function that turns a workspace's Request rows into the three dashboard
 * views (My work, By project, Whole org) for one viewer (#154, spec #151).
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
 * - Operational work and Requests closed without a result are never in a line or total.
 * - A Request with no release date is never in a period; the period is the release date (UTC).
 * - Nothing per person: no totals, averages, scores or rankings for anyone.
 */
import { agreedResult, guardrailHeld, type ClosureCorrection, type OutcomeClosure, type OutcomeException } from "./request-outcome";
import { measurementAudienceLabel, measurementPlatformLabel, measurementUnitLabel } from "./request-measurement";
import type { MetricUnit } from "./metric-definition-rules";
import { impactStateOf, type ExpectedImpact } from "./request-impact";
import { entryKindOf, NOTHING_MEASURED } from "./impact-presenter";
import { journeyStatus, requesterOf, type JourneyLabel } from "./request-journey";
import { releaseMeasurement, valueBeforeReleaseFor } from "./request-release-facts";
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

function measuredResult(row: ImpactRow, closure: OutcomeClosure): ResultView {
  const prediction = predictionOf(closure.expected, row.definitions);
  const passed = closure.primary.kind === "pass_fail" ? closure.primary.passed : null;
  const actual = closure.primary.kind === "numeric" ? closure.primary.actual : null;
  // Change is measured from the value recorded before release (#151 decision 3). A release recorded before that has none,
  // so it keeps the planning baseline, and every view labels it as such. A new capability or unknown baseline has no change.
  const planned = prediction.baselineState === "known" ? prediction.baseline : null;
  const recorded = valueBeforeReleaseFor(row.releaseState, closure.release);
  const baselineSource: BaselineSource | null = planned === null ? null : recorded ? "release" : "planning";
  const baseline = baselineSource === "release" ? recorded!.value : planned;
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
    verdict: passed === null ? null : passed ? "good" : "bad",
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
    followUps: byRequestNumber(visible.filter(other => other.followUpOf === row.id).map(({ id, requestNumber, title }) => ({ requestId: id, requestNumber, title }))),
  };
}

function inPeriod(date: string | null, period: ImpactPeriod | null): boolean {
  if (period === null) return true;
  if (date === null || Number(date.slice(0, 4)) !== period.year) return false;
  if (period.kind === "year") return true;
  const month = Number(date.slice(5, 7));
  return month >= (period.quarter - 1) * 3 + 1 && month <= period.quarter * 3;
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
  limit: { operator: GuardrailView["operator"]; limit: number; unit: string };
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

export function buildImpactDashboard(viewer: ImpactViewer, rows: ImpactRow[], options: ImpactOptions = {}): ImpactDashboard {
  const now = options.now ?? new Date();
  const period = options.period ?? null;
  const visible = visibleTo(viewer, rows);

  const myWork = entriesForPerson(visible, viewer.userId, now);

  const projectKey = (row: ImpactRow) => row.projectId ?? "";
  const projectGroups = new Map<string, ImpactRow[]>();
  for (const row of visible) projectGroups.set(projectKey(row), [...(projectGroups.get(projectKey(row)) ?? []), row]);
  const projectName = (rowsInProject: ImpactRow[]) => rowsInProject[0].projectName ?? NO_PROJECT;

  const byProject: ProjectView[] = [...projectGroups.values()].map(rowsInProject => {
    const entries = byRequestNumber(rowsInProject.map(row => entryOf(row, now, visible)));
    const measured = linesOf(entries.flatMap(entry => entry.result && inPeriod(entry.releaseDate, period) ? [entry.result] : []));
    // Predictions with nothing measured yet: open or released-and-waiting work, not closed and not operational.
    const predictions = entries.flatMap(entry => {
      const kind = entryKindOf(entry);
      return kind.kind === "predicted" ? [{ requestId: entry.requestId, requestNumber: entry.requestNumber, title: entry.title, predicted: kind.predicted }] : [];
    });
    return {
      projectId: rowsInProject[0].projectId,
      name: projectName(rowsInProject),
      measured,
      predictions,
      stillDueCount: entries.filter(entry => entry.stillDue).length,
      requests: entries,
      // Spec #151 (US35): a Project with nothing measured says so in the same words, whatever the period.
      emptyMessage: measured.length === 0 ? NOTHING_MEASURED : null,
    };
  }).sort((a, b) => (a.projectId === null) !== (b.projectId === null) ? (a.projectId === null ? 1 : -1) : a.name.localeCompare(b.name));

  if (viewer.role === "guest") return { myWork: { requests: myWork }, byProject, wholeOrg: null };

  const entries = visible.map(row => ({ row, entry: entryOf(row, now, visible) }));
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
      emptyMessage: lines.length === 0 ? NOTHING_MEASURED : null,
      operational: byRequestNumber(entries.flatMap(({ row }) => {
        const state = impactStateOf(row);
        return state.kind === "operational" ? [{ requestId: row.id, requestNumber: row.requestNumber, title: row.title, projectName: row.projectName, reason: state.reason }] : [];
      })),
      closedWithoutResult: byRequestNumber(entries.flatMap(({ row }) => row.exceptionClosure ? [{ requestId: row.id, requestNumber: row.requestNumber, title: row.title, projectName: row.projectName, reasonCode: row.exceptionClosure.reasonCode, reason: row.exceptionClosure.reason }] : [])),
      timeline,
      // Spec #151 (US32, decisions): a Request with no release date is never in a period, whether Done or still open.
      // Operational work and closed-without-result Requests already sit in their own excluded sections.
      unreleased: byRequestNumber(entries.flatMap(({ row, entry }) => entry.releaseDate === null && impactStateOf(row).kind !== "operational" && !row.exceptionClosure ? [{ requestId: row.id, requestNumber: row.requestNumber, title: row.title }] : [])),
      projectStacks,
    },
  };
}
