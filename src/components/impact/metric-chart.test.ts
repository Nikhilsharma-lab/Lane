import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { ResultLine, ResultView } from "@/lib/impact-read-model"
import { MetricChart } from "./metric-chart"
import { metricChart } from "@/lib/impact-chart-view"

// The metric chart component (#158). Tests render the markup; they assert what a reader and a screen reader receive,
// not how the SVG is built.

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

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()

const render = (value: ResultLine) => {
  const chart = metricChart(value)
  return renderToStaticMarkup(createElement(MetricChart, { chart }))
}


describe("metric chart: one chart per metric (#158)", () => {
  it("draws one chart for one metric and gives it a text description for screen readers", () => {
    const markup = render(line("Conversion rate", [result({ requestNumber: 1, baseline: 42, baselineSource: "release" })]))
    expect(markup.match(/role="img"/g)).toHaveLength(1)
    expect(markup).toContain('aria-label="Conversion rate, 30 days after release. LAN-1 Request 1: before release 42%, result 46%, goal 50% (from 40%)."')
  })

  it("draws nothing and shows the empty message, never a zero bar, when no value is recorded", () => {
    const markup = render(line("Conversion rate", [result({ requestNumber: 1, baselineState: "unknown", baseline: null, baselineSource: null, actual: null, predictedTarget: null })]))
    expect(markup).not.toContain('role="img"')
    expect(markup).toContain("Nothing measured this period yet")
  })

  it("draws nothing for a Verified result, which is counted and not charted", () => {
    expect(metricChart(line("Verified", [result({ requestNumber: 1, form: "pass_fail" })], { form: "pass_fail", unit: "count" }))).toBeNull()
  })
})

describe("metric chart: numbers a reader can see (#282)", () => {
  const two = line("Conversion rate", [
    result({ requestNumber: 40, title: "Shorter checkout", baseline: 62, baselineSource: "release", plannedBaseline: 62, actual: 75, predictedTarget: 80 }),
    result({ requestNumber: 41, title: "Saved cards", baseline: 50, baselineSource: "release", plannedBaseline: 50, actual: 47, predictedTarget: 55 }),
  ])

  it("labels each group of bars with its Request's code, and each bar with its value", () => {
    const shown = text(render(two))
    expect(shown).toMatch(/62% 75% 80% LAN-40 .*50% 47% 55% LAN-41/)
  })

  it("has a three-item legend: Before release, Result, Goal", () => {
    const markup = render(two)
    const legend = /<ul[^>]*>([\s\S]*?)<\/ul>/.exec(markup)?.[1] ?? ""
    expect(legend.match(/<li/g)).toHaveLength(3)
    expect(text(legend)).toBe("Before release Result Goal")
  })

  it("keeps the legend's three items for a legacy planning baseline, which it never names", () => {
    const markup = render(line("Conversion rate", [result({ requestNumber: 1, baseline: 40, baselineSource: "planning" })]))
    expect(text(markup)).toContain("Before release Result Goal")
    expect(markup).not.toMatch(/planning/i)
  })

  // Its fixed height, the gap between groups and the bars' reduced-motion branch are checked in the browser
  // (e2e/impact-results.spec.ts), where the stylesheet applies.
})
