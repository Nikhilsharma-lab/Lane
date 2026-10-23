/**
 * Display lines for the "By project" tab (#156, spec #151). It turns the read model's ProjectView into the
 * strings and groupings the screen shows. It adds no totals: a sum that appears here is one the read model
 * already made (ResultLine.summed), and every value is formatted from a field the read model returned.
 */
import type { ProjectView, Prediction, RequestEntry, ResultLine, ResultView } from "./impact-read-model";
import { requestCodeOrNull } from "./request-code";

export const UNASSIGNED_HEADING = "Requests without a Project";

const NOT_APPLICABLE = "Not applicable";

export type MetricCells = { baseline: string; actual: string; change: string; predicted: string };

export type MeasuredResultRow = { requestId: string; requestNumber: number; title: string; cells: MetricCells };

/** One metric: one line. `cells` is set only when a single Request holds the result, else the Requests sit beneath. */
export type MeasuredLine = {
  key: string;
  metric: string;
  context: string;
  window: string;
  summary: string;
  total: string | null;
  cells: MetricCells | null;
  results: MeasuredResultRow[];
};

export type PredictionLine = { requestId: string; requestNumber: number; title: string; metric: string; context: string; predicted: string; window: string };

export type RequestLine = { requestId: string; requestNumber: number; code: string | null; title: string; journey: string; note: string | null };

export type ProjectSection = {
  projectId: string | null;
  heading: string;
  measured: MeasuredLine[];
  emptyMessage: string | null;
  predictions: PredictionLine[];
  stillDueLabel: string | null;
  requests: RequestLine[];
};

function valueText(value: number, unit: string): string {
  if (unit === "%") return `${value}%`;
  if (unit === "count") return `${value}`;
  return `${value} ${unit}`;
}

/** A signed change in its own unit. Counts carry no unit word; percentages say "percentage points". */
function signedText(value: number, unit: string, changeUnit: string | null): string {
  if (value === 0) return "No change";
  const suffix = unit === "count" || !changeUnit ? "" : ` ${changeUnit}`;
  return `${value > 0 ? "+" : "-"}${Math.abs(value)}${suffix}`;
}

function predictedText(prediction: Pick<Prediction, "form" | "unit" | "changeUnit" | "predictedChange" | "target">): string {
  if (prediction.form === "pass_fail") return NOT_APPLICABLE;
  if (prediction.predictedChange !== null) return signedText(prediction.predictedChange, prediction.unit, prediction.changeUnit);
  if (prediction.target !== null) return `Target ${valueText(prediction.target, prediction.unit)}`;
  return "Not predicted";
}

function cellsOf(result: ResultView): MetricCells {
  if (result.form === "pass_fail") {
    const actual = result.verdict === "good" ? "Good" : result.verdict === "bad" ? "Bad" : "Not recorded";
    return { baseline: NOT_APPLICABLE, actual, change: NOT_APPLICABLE, predicted: NOT_APPLICABLE };
  }
  const baseline = result.baselineState === "unknown" ? "Baseline unknown"
    : result.baselineState === "new_capability" ? "New capability"
    : result.baseline !== null ? valueText(result.baseline, result.unit)
    : NOT_APPLICABLE;
  const change = result.change !== null ? signedText(result.change, result.unit, result.changeUnit) : "Not shown";
  return {
    baseline,
    actual: result.actual !== null ? valueText(result.actual, result.unit) : "Not recorded",
    change,
    predicted: predictedText({ form: result.form, unit: result.unit, changeUnit: result.changeUnit, predictedChange: result.predictedChange, target: result.predictedTarget }),
  };
}

function resultActualText(result: ResultView): string {
  if (result.form === "pass_fail") return result.verdict === "good" ? "Good" : result.verdict === "bad" ? "Bad" : "Not recorded";
  return result.actual !== null ? valueText(result.actual, result.unit) : "Not recorded";
}

function contextOf(audience: string, platform: string): string {
  return `${audience} · ${platform}`;
}

function measuredLineOf(line: ResultLine): MeasuredLine {
  const count = line.count;
  const numeric = line.form === "numeric";
  const summary = line.form === "pass_fail"
    ? `${line.verdicts?.good ?? 0} good, ${line.verdicts?.bad ?? 0} bad`
    : count === 1 ? "1 Request" : `${count} Requests`;
  // A total exists only where the read model summed a count across two or more Requests.
  const total = numeric && line.summed && count > 1 && line.summed.change !== null
    ? `${signedText(line.summed.change, line.unit, line.changeUnit)} in total`
    : null;
  return {
    key: [line.metric, line.form, line.unit, line.audience, line.platform, line.window].join("|"),
    metric: line.metric,
    context: contextOf(line.audience, line.platform),
    window: line.window,
    summary,
    total,
    cells: numeric && count === 1 ? cellsOf(line.results[0]) : null,
    results: line.results.map(result => ({ requestId: result.requestId, requestNumber: result.requestNumber, title: result.title, cells: cellsOf(result) })),
  };
}

function noteOf(entry: RequestEntry): string | null {
  if (entry.result) return `Actual ${resultActualText(entry.result)}`;
  if (entry.stillDue) return `Still due ${entry.stillDue.dueLabel}`;
  if (entry.closedWithoutResult) return `Closed without a result: ${entry.closedWithoutResult.reason}`;
  if (entry.operationalReason) return `Operational work: ${entry.operationalReason}`;
  return null;
}

function sectionOf(project: ProjectView): ProjectSection {
  return {
    projectId: project.projectId,
    heading: project.projectId === null ? UNASSIGNED_HEADING : project.name,
    measured: project.measured.map(measuredLineOf),
    emptyMessage: project.emptyMessage,
    predictions: project.predictions.map(({ requestId, requestNumber, title, predicted }) => ({
      requestId,
      requestNumber,
      title,
      metric: predicted.metric,
      context: contextOf(predicted.audience, predicted.platform),
      predicted: predictedText(predicted),
      window: predicted.window,
    })),
    stillDueLabel: project.stillDueCount > 0 ? `${project.stillDueCount} still due` : null,
    requests: project.requests.map(entry => ({
      requestId: entry.requestId,
      requestNumber: entry.requestNumber,
      code: requestCodeOrNull(entry.requestNumber),
      title: entry.title,
      journey: entry.journey,
      note: noteOf(entry),
    })),
  };
}

/** The "By project" sections, in the read model's order: measured results first, then the Requests beneath. */
export function byProjectSections(projects: ProjectView[]): ProjectSection[] {
  return projects.map(sectionOf);
}
