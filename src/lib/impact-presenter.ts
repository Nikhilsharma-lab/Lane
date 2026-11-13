/**
 * The impact dashboard's shared presenter (spec #151, review fixes): the one place that turns read-model values into
 * the words and the entry kind every view shows. The views render these strings and compute nothing of their own.
 * Pure and client-safe. It imports types from the read model only, so the read model may import it back. Its words for
 * values, changes, results and verdicts are the shared result phrasing's (result-phrasing.ts, #279/#282), so Impact
 * says a result the same way as the Request's Journey.
 */
import type { DueItem, Prediction, RequestEntry, ResultView, Verdict } from "./impact-read-model";
import { changeAmountText, goalValueText, passFailCountText, passFailText, resultAgainstGoal, resultValueText } from "./result-phrasing";

/** The one empty-state wording for a period, a Project or a chart with nothing measured (spec US35). */
export const NOTHING_MEASURED = "Nothing measured this period yet";
export const NOT_RECORDED = "Not recorded";

/** A value with its unit: "40%", "12" for a count, "30 seconds". Every view formats a value this way. */
export const valueText = resultValueText

/**
 * A signed change in its own unit, with a true minus sign: "+6 points" (a difference of percentages), "−5 seconds",
 * "+10" for a count. Zero reads "No change" everywhere. The words are the shared result phrasing's (#282).
 */
export const changeText = changeAmountText

const resultsText = (count: number) => `${count} ${count === 1 ? "result" : "results"}`

/**
 * A total of changes the read model summed for one line, with how many results it counts: "−165 minutes from 1
 * result", "+30 in total from 2 results". "In total" only when more than one result is counted (#282).
 */
export function totalText(change: number, unit: string, count: number): string {
  return `${changeText(change, unit)}${count > 1 ? " in total" : ""} from ${resultsText(count)}`
}

/** The one set of verdict labels: Passed, Didn’t pass, or Not recorded. */
export function verdictText(verdict: Verdict | null): string {
  return verdict === null ? NOT_RECORDED : passFailText(verdict === "good")
}

/** Pass/fail results counted together: "1 passed, 0 didn’t pass". */
export function passFailTotalText(verdicts: { good: number; bad: number }): string {
  return passFailCountText({ passed: verdicts.good, didntPass: verdicts.bad })
}

/** The actual value: a verdict for a Verified result, else the value with its unit. */
export function actualText(result: ResultView): string {
  if (result.form === "pass_fail") return verdictText(result.verdict)
  return result.actual !== null ? valueText(result.actual, result.unit) : NOT_RECORDED
}

/**
 * #282: a result against its goal, in the goal's own direction (from the goal's start and end, never the value before
 * release): "Reached 75 minutes, 15 past the goal", "Reached 80% (goal 80%)" with no start; Passed or Didn’t pass.
 */
export function resultText(result: ResultView): string {
  if (result.form === "pass_fail" || result.actual === null) return actualText(result)
  return resultAgainstGoal(result.actual, { unit: result.unit, baseline: result.plannedBaseline, target: result.predictedTarget })
}

/** The one name a value recorded at release carries in every view. */
export const BEFORE_RELEASE = "Before release"

/**
 * The value before release, when it was recorded at release. A legacy release's planning baseline isn't shown on its
 * own: it reads as the goal's "from" value (#282).
 */
export function beforeReleaseText(result: Pick<ResultView, "form" | "unit" | "baseline" | "baselineSource">): string | null {
  if (result.form !== "numeric" || result.baselineSource !== "release" || result.baseline === null) return null
  return valueText(result.baseline, result.unit)
}

export const NO_GOAL = "No goal set"

/**
 * #261, #282: a Request's goal as its end value, with where it started: "80% (from 62%)", "80%" when the start isn't
 * known (a new capability), the check itself for a Pass/fail goal, or "No goal set". When only a change was set, the
 * end is the start plus the change, or the change itself ("+18 points") when the start isn't known. The one place a
 * goal is phrased: every view shows it beside the word "Goal", in the Request's summary, Impact, the Metrics library
 * and Iterations.
 */
export function goalText(goal: Pick<Prediction, "form" | "metric" | "unit" | "baseline" | "target"> & { predictedChange?: number | null }): string {
  if (goal.form === "pass_fail") return goal.metric
  const change = goal.predictedChange ?? null
  if (goal.target === null && change !== null && goal.baseline === null) return changeText(change, goal.unit)
  const target = goal.target ?? (change !== null && goal.baseline !== null ? goal.baseline + change : null)
  return goalValueText({ unit: goal.unit, baseline: goal.baseline, target })
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
