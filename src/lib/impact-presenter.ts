/**
 * The impact dashboard's shared presenter (spec #151, review fixes): the one place that turns read-model values into
 * the words and the entry kind every view shows. The views render these strings and compute nothing of their own.
 * Pure and client-safe. It imports types from the read model only, so the read model may import it back.
 */
import type { DueItem, Prediction, RequestEntry, ResultView, Verdict } from "./impact-read-model";

/** The one empty-state wording for a period, a Project or a chart with nothing measured (spec US35). */
export const NOTHING_MEASURED = "Nothing measured this period yet";
export const NOT_APPLICABLE = "Not applicable";
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

/** The predicted change, or the target when no change can be predicted (a new capability), or "Not predicted". */
export function predictedText(prediction: Pick<Prediction, "form" | "unit" | "changeUnit" | "predictedChange" | "target">): string {
  if (prediction.form === "pass_fail") return NOT_APPLICABLE;
  if (prediction.predictedChange !== null) return changeText(prediction.predictedChange, prediction.unit, prediction.changeUnit);
  if (prediction.target !== null) return `Target ${valueText(prediction.target, prediction.unit)}`;
  return "Not predicted";
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

/** The one-line note an entry carries in a list. */
export function noteOf(entry: RequestEntry): string | null {
  const kind = entryKindOf(entry);
  switch (kind.kind) {
    case "result": return `Actual ${actualText(kind.result)}`;
    case "still_due": return `Still due ${kind.due.dueLabel}`;
    case "closed_without_result": return `Closed without a result: ${kind.reason}`;
    case "operational": return `Operational work: ${kind.reason}`;
    default: return null;
  }
}
