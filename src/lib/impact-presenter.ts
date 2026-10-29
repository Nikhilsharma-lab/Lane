/**
 * The impact dashboard's shared presenter (spec #151, review fixes): the one place that turns read-model values into
 * the words and the entry kind every view shows. The views render these strings and compute nothing of their own.
 * Pure and client-safe. It imports types from the read model only, so the read model may import it back.
 */
import type { BaselineSource, DueItem, Prediction, RequestEntry, ResultView, Verdict } from "./impact-read-model";

/** The one empty-state wording for a period, a Project or a chart with nothing measured (spec US35). */
export const NOTHING_MEASURED = "Nothing measured this period yet";
export const NOT_RECORDED = "Not recorded";
export const NO_CHANGE = "No change";

/** A value with its unit: "40%", "12" for a count, "30 seconds". Every view formats a value this way. */
export function valueText(value: number, unit: string): string {
  if (unit === "%") return `${value}%`;
  if (unit === "count") return `${value}`;
  return `${value} ${unit}`;
}

/**
 * A signed change in its own unit: "+6 percentage points", "-5 seconds", "+10" for a count. Zero reads "No change"
 * everywhere. Percentages carry the change unit "percentage points", never a percent sign.
 */
export function changeText(change: number, unit: string, changeUnit: string | null): string {
  if (change === 0) return NO_CHANGE;
  const suffix = unit === "count" || !changeUnit ? "" : ` ${changeUnit}`;
  return `${change > 0 ? "+" : "-"}${Math.abs(change)}${suffix}`;
}

/** A total of changes the read model summed for one line: "+30 in total", or "No change in total". */
export function totalText(change: number, unit: string, changeUnit: string | null): string {
  return change === 0 ? `${NO_CHANGE} in total` : `${changeText(change, unit, changeUnit)} in total`;
}

/** The one set of verdict labels: Good, Bad, or Not recorded. */
export function verdictText(verdict: Verdict | null): string {
  return verdict === "good" ? "Good" : verdict === "bad" ? "Bad" : NOT_RECORDED;
}

/** The actual value: a verdict for a Verified result, else the value with its unit. */
export function actualText(result: ResultView): string {
  if (result.form === "pass_fail") return verdictText(result.verdict);
  return result.actual !== null ? valueText(result.actual, result.unit) : NOT_RECORDED;
}

/** The name a baseline carries in every view: "Before release" when recorded at release, else "Planning baseline" (a legacy release). */
export function baselineLabelOf(source: BaselineSource): string {
  return source === "release" ? "Before release" : "Planning baseline";
}

export const NO_GOAL = "No goal set";

/**
 * #261: a Request's goal as its end value, with where it started: "80% (from 62%)", "80%" when the start isn't known
 * (a new capability), the check itself for a Pass/fail goal, or "No goal set". The one place a goal is phrased: every
 * view shows it beside the word "Goal", in the Request's summary, Impact, the Metrics library and Iterations.
 */
export function goalText(goal: Pick<Prediction, "form" | "metric" | "unit" | "baseline" | "target">): string {
  if (goal.form === "pass_fail") return goal.metric;
  if (goal.target === null) return NO_GOAL;
  const end = valueText(goal.target, goal.unit);
  return goal.baseline !== null ? `${end} (from ${valueText(goal.baseline, goal.unit)})` : end;
}

/** What an entry is, once, for every view: a measured result, still due, closed without a result, operational, or predicted only. */
export type EntryKind =
  | { kind: "result"; result: ResultView }
  | { kind: "still_due"; due: DueItem }
  | { kind: "closed_without_result"; reason: string }
  | { kind: "operational"; reason: string }
  | { kind: "predicted"; predicted: Prediction }
  | { kind: "none" };

export function entryKindOf(entry: Pick<RequestEntry, "result" | "stillDue" | "closedWithoutResult" | "operationalReason" | "predicted">): EntryKind {
  if (entry.result) return { kind: "result", result: entry.result };
  if (entry.stillDue) return { kind: "still_due", due: entry.stillDue };
  if (entry.closedWithoutResult) return { kind: "closed_without_result", reason: entry.closedWithoutResult.reason };
  if (entry.operationalReason) return { kind: "operational", reason: entry.operationalReason };
  if (entry.predicted) return { kind: "predicted", predicted: entry.predicted };
  return { kind: "none" };
}
