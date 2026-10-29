import type { ResultLine, ResultView } from "@/lib/impact-read-model"
import { baselineLabelOf, NOTHING_MEASURED } from "@/lib/impact-presenter"

// The chart presenter (#158). It takes one ResultLine from the read model and shapes its recorded values for one
// chart: one line is one metric, so one chart and one scale. It adds, averages and combines nothing; the scale is
// the largest single recorded value on that line, used only to set bar heights.

export type Series = "baseline" | "actual" | "predicted"
export type ChartBar = { series: Series; label: string; value: number; height: number }
export type ChartGroup = { requestNumber: number; title: string; bars: ChartBar[] }
/** `baselineLabel` names the baseline series in the legend: before release, the planning baseline, or both when one chart mixes them. */
export type MetricChart = { metric: string; unit: string; window: string; scaleMax: number; groups: ChartGroup[]; description: string; baselineLabel: string }

const LABEL = { actual: "Actual", predicted: "Goal" }

function valuesOf(result: ResultView): { series: Series; label: string; value: number }[] {
  const values: { series: Series; label: string; value: number }[] = []
  if (result.baselineSource !== null && result.baseline !== null) values.push({ series: "baseline", label: baselineLabelOf(result.baselineSource), value: result.baseline })
  if (result.actual !== null) values.push({ series: "actual", label: LABEL.actual, value: result.actual })
  if (result.predictedTarget !== null) values.push({ series: "predicted", label: LABEL.predicted, value: result.predictedTarget })
  return values
}

function describeGroup(result: ResultView, unit: string): string {
  const parts: string[] = []
  if (result.baselineState === "unknown") parts.push("baseline unknown")
  else if (result.baselineState === "new_capability") parts.push("new capability, no baseline")
  else if (result.baselineSource !== null && result.baseline !== null) parts.push(`${baselineLabelOf(result.baselineSource).toLowerCase()} ${result.baseline} ${unit}`)
  if (result.actual !== null) parts.push(`actual ${result.actual} ${unit}`)
  if (result.predictedTarget !== null) parts.push(`goal ${result.predictedTarget} ${unit}`)
  return `Request #${result.requestNumber} ${result.title}: ${parts.join(", ")}.`
}

export function metricChart(line: ResultLine): MetricChart | null {
  if (line.form === "pass_fail") return null
  const withValues = line.results.map(result => ({ result, values: valuesOf(result) })).filter(entry => entry.values.length > 0)
  const scaleMax = Math.max(0, ...withValues.flatMap(entry => entry.values.map(value => value.value)))
  const groups: ChartGroup[] = withValues.map(({ result, values }) => ({
    requestNumber: result.requestNumber,
    title: result.title,
    bars: values.map(({ series, label, value }) => ({ series, label, value, height: scaleMax === 0 ? 0 : (value / scaleMax) * 100 })),
  }))
  const sources = new Set(withValues.flatMap(({ result }) => result.baselineSource !== null && result.baseline !== null ? [result.baselineSource] : []))
  const baselineLabel = sources.size === 0 ? "Baseline" : sources.size > 1 ? "Baseline: before release or planning baseline" : baselineLabelOf([...sources][0])
  const head = `${line.metric}, unit ${line.unit}, window ${line.window}.`
  const description = groups.length === 0
    ? `${head} ${NOTHING_MEASURED}.`
    : `${head} ${withValues.map(({ result }) => describeGroup(result, line.unit)).join(" ")}`
  return { metric: line.metric, unit: line.unit, window: line.window, scaleMax, groups, description, baselineLabel }
}
