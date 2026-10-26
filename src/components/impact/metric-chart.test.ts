import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ResultLine, ResultView } from "@/lib/impact-read-model"
import { MetricChart } from "./metric-chart"
import { metricChart } from "@/lib/impact-chart-view"

// The metric chart component (#158). Tests render the markup and read the stylesheet; they assert what a reader and a
// screen reader receive, not how the SVG is built.

function result(over: Partial<ResultView> & Pick<ResultView, "requestNumber">): ResultView {
  return {
    requestId: `req-${over.requestNumber}`, title: `Request ${over.requestNumber}`, definitionId: null, metric: "Conversion rate", form: "numeric",
    unit: "%", changeUnit: "percentage points", audience: "all", platform: "all", window: "30 days after release",
    baselineState: "known", baseline: 40, baselineSource: "planning", plannedBaseline: 40, actual: 46, change: 6, verdict: null, correctedFrom: null, predictedTarget: 50, predictedChange: 10,
    releaseDate: "2026-08-10", observedFrom: "2026-08-10", observedTo: "2026-09-09", evidence: "Released", guardrails: [],
    corrections: [], requests: [], ...over,
  }
}

function line(metric: string, results: ResultView[], over: Partial<ResultLine> = {}): ResultLine {
  return { definitionId: null, metric, form: "numeric", unit: "%", changeUnit: "percentage points", audience: "all", platform: "all", window: "30 days after release", results, count: results.length, summed: null, verdicts: null, ...over }
}

const render = (value: ResultLine) => {
  const chart = metricChart(value)
  return renderToStaticMarkup(createElement(MetricChart, { chart }))
}

const css = readFileSync(join(process.cwd(), "src/components/impact/metric-chart.module.css"), "utf8")
const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ""

describe("metric chart: one chart per metric (#158)", () => {
  it("draws one SVG chart for one metric and gives it a text description for screen readers", () => {
    const markup = render(line("Conversion rate", [result({ requestNumber: 1 })]))
    expect(markup.match(/<svg/g)).toHaveLength(1)
    expect(markup).toContain('role="img"')
    expect(markup).toContain("planning baseline 40 %, actual 46 %, predicted 50 %")
  })

  it("gives each chart its own scale: bar heights are shares of that chart's own largest value", () => {
    const small = render(line("Users who adopted", [result({ requestNumber: 2, metric: "Users who adopted", baseline: 100, actual: 130, predictedTarget: 150, unit: "%" })]))
    expect(small).toMatch(/data-series="predicted"[^>]*height="100"/)
    expect(small).toMatch(/data-series="baseline"[^>]*height="66\.6+"/)
  })

  it("draws nothing and shows the empty message, never a zero bar, when no value is recorded", () => {
    const markup = render(line("Conversion rate", [result({ requestNumber: 1, baselineState: "unknown", baseline: null, actual: null, predictedTarget: null })]))
    expect(markup).not.toContain("<svg")
    expect(markup).toContain("Nothing measured this period yet")
    expect(markup).not.toMatch(/height="0"/)
  })

  it("draws nothing for a Verified result, which is counted and not charted", () => {
    expect(metricChart(line("Verified", [result({ requestNumber: 1, form: "pass_fail" })], { form: "pass_fail", unit: "count" }))).toBeNull()
  })
})

describe("metric chart: reduced motion (#158)", () => {
  it("animates the bars growing in by default", () => {
    expect(css).toMatch(/\.bar\s*\{[^}]*animation:/)
  })

  it("removes the bar animation under prefers-reduced-motion", () => {
    expect(reduced).toMatch(/\.bar\s*\{[^}]*animation:\s*none/)
  })
})

describe("metric chart: the baseline's name in the legend (#151 decision 3)", () => {
  it("names a release-time baseline in the legend, never as the planning baseline", () => {
    const markup = render(line("Conversion rate", [result({ requestNumber: 1, baseline: 42, baselineSource: "release" })]))
    expect(markup).toContain("Before release")
    expect(markup).not.toContain("Planning baseline")
  })
})

