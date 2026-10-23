import type { ResultLine, ResultView } from "@/lib/impact-read-model"

// The chart presenter (#158). It takes one ResultLine from the read model and shapes its recorded values for one
// chart: one line is one metric, so one chart and one scale. It adds, averages and combines nothing; the scale is
// the largest single recorded value on that line, used only to set bar heights.

export type Series = "baseline" | "actual" | "predicted"
export type ChartBar = { series: Series; label: string; value: number; height: number }
export type ChartGroup = { requestNumber: number; title: string; bars: ChartBar[] }
export type MetricChart = { metric: string; unit: string; window: string; scaleMax: number; groups: ChartGroup[]; description: string }

const LABEL: Record<Series, string> = { baseline: "Baseline", actual: "Actual", predicted: "Predicted" }

function valuesOf(result: ResultView): { series: Series; value: number }[] {
  const values: { series: Series; value: number }[] = []
  if (result.baselineState === "known" && result.baseline !== null) values.push({ series: "baseline", value: result.baseline })
  if (result.actual !== null) values.push({ series: "actual", value: result.actual })
  if (result.predictedTarget !== null) values.push({ series: "predicted", value: result.predictedTarget })
  return values
}

function describeGroup(result: ResultView, unit: string): string {
  const parts: string[] = []
  if (result.baselineState === "unknown") parts.push("baseline unknown")
  else if (result.baselineState === "new_capability") parts.push("new capability, no baseline")
  else if (result.baseline !== null) parts.push(`baseline ${result.baseline} ${unit}`)
  if (result.actual !== null) parts.push(`actual ${result.actual} ${unit}`)
  if (result.predictedTarget !== null) parts.push(`predicted ${result.predictedTarget} ${unit}`)
  return `Request #${result.requestNumber} ${result.title}: ${parts.join(", ")}.`
}

export function metricChart(line: ResultLine): MetricChart | null {
  if (line.form === "pass_fail") return null
  const withValues = line.results.map(result => ({ result, values: valuesOf(result) })).filter(entry => entry.values.length > 0)
  const scaleMax = Math.max(0, ...withValues.flatMap(entry => entry.values.map(value => value.value)))
  const groups: ChartGroup[] = withValues.map(({ result, values }) => ({
    requestNumber: result.requestNumber,
    title: result.title,
    bars: values.map(({ series, value }) => ({ series, label: LABEL[series], value, height: scaleMax === 0 ? 0 : (value / scaleMax) * 100 })),
  }))
  const head = `${line.metric}, unit ${line.unit}, window ${line.window}.`
  const description = groups.length === 0
    ? `${head} Nothing measured yet.`
    : `${head} ${withValues.map(({ result }) => describeGroup(result, line.unit)).join(" ")}`
  return { metric: line.metric, unit: line.unit, window: line.window, scaleMax, groups, description }
}
