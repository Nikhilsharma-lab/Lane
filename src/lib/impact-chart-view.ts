import type { ResultLine, ResultView } from "@/lib/impact-read-model"
import { BEFORE_RELEASE, beforeReleaseText, goalText, NOTHING_MEASURED } from "@/lib/impact-presenter"
import { resultValueText } from "@/lib/result-phrasing"
import { formatRequestCode } from "@/lib/request-code"

// The chart presenter (#158, #282). It takes one ResultLine from the read model and shapes its recorded values for
// one chart: one line is one metric, so one chart and one scale. It adds, averages and combines nothing; the scale is
// the largest single recorded value on that line, used only to set bar heights. Every word and number the chart shows
// or says comes from here, in the Impact presenter's words.

export type Series = "before_release" | "result" | "goal"
export type ChartBar = { series: Series; label: string; value: number; valueLabel: string; height: number }
/** One Request's bars, labelled with its saved code ("LAN-40"). */
export type ChartGroup = { requestNumber: number; code: string; title: string; bars: ChartBar[] }
export type LegendItem = { series: Series; label: string }
export type MetricChart = { metric: string; unit: string; window: string; scaleMax: number; groups: ChartGroup[]; legend: LegendItem[]; description: string }

/** The three series, in the order every group draws them and the legend lists them. */
export const SERIES: LegendItem[] = [
  { series: "before_release", label: BEFORE_RELEASE },
  { series: "result", label: "Result" },
  { series: "goal", label: "Goal" },
]
const labelOf = (series: Series) => SERIES.find(item => item.series === series)!.label

/**
 * The values one Request draws. Before release is the value recorded at release only: a legacy release's planning
 * baseline is never drawn as one, and reads as the goal's "from" value instead.
 */
function valuesOf(result: ResultView): { series: Series; value: number }[] {
  const values: { series: Series; value: number }[] = []
  if (beforeReleaseText(result) !== null) values.push({ series: "before_release", value: result.baseline! })
  if (result.actual !== null) values.push({ series: "result", value: result.actual })
  if (result.predictedTarget !== null) values.push({ series: "goal", value: result.predictedTarget })
  return values
}

function describeGroup(result: ResultView): string {
  const parts: string[] = []
  if (result.baselineState === "unknown") parts.push("value before release unknown")
  else if (result.baselineState === "new_capability") parts.push("new capability, nothing before release")
  const before = beforeReleaseText(result)
  if (before !== null) parts.push(`before release ${before}`)
  if (result.actual !== null) parts.push(`result ${resultValueText(result.actual, result.unit)}`)
  if (result.predictedTarget !== null) parts.push(`goal ${goalText({ form: result.form, metric: result.metric, unit: result.unit, baseline: result.plannedBaseline, target: result.predictedTarget })}`)
  return `${formatRequestCode(result.requestNumber)} ${result.title}: ${parts.join(", ")}.`
}

export function metricChart(line: ResultLine): MetricChart | null {
  if (line.form === "pass_fail") return null
  const withValues = line.results.map(result => ({ result, values: valuesOf(result) })).filter(entry => entry.values.length > 0)
  const scaleMax = Math.max(0, ...withValues.flatMap(entry => entry.values.map(value => value.value)))
  const groups: ChartGroup[] = withValues.map(({ result, values }) => ({
    requestNumber: result.requestNumber,
    code: formatRequestCode(result.requestNumber),
    title: result.title,
    bars: values.map(({ series, value }) => ({
      series, label: labelOf(series), value, valueLabel: resultValueText(value, result.unit), height: scaleMax === 0 ? 0 : (value / scaleMax) * 100,
    })),
  }))
  const head = `${line.metric}, ${line.window}.`
  const description = groups.length === 0
    ? `${head} ${NOTHING_MEASURED}.`
    : `${head} ${withValues.map(({ result }) => describeGroup(result)).join(" ")}`
  return { metric: line.metric, unit: line.unit, window: line.window, scaleMax, groups, legend: SERIES, description }
}
