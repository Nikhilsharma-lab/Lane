import { describe, expect, it } from "vitest"
import type { ResultLine, ResultView } from "@/lib/impact-read-model"
import { metricChart } from "./impact-chart-view"

// The chart presenter (#158) takes one ResultLine from the read model and returns the values one chart shows.
// Expected values are literals written from the fixtures, never recomputed the way the code does it.

function result(over: Partial<ResultView> & Pick<ResultView, "requestNumber">): ResultView {
  return {
    requestId: `req-${over.requestNumber}`, title: `Request ${over.requestNumber}`, metric: "Conversion rate", form: "numeric",
    unit: "%", changeUnit: "percentage points", audience: "all", platform: "all", window: "30 days after release",
    baselineState: "known", baseline: 40, actual: 46, change: 6, verdict: null, predictedTarget: 50, predictedChange: 10,
    releaseDate: "2026-08-10", observedFrom: "2026-08-10", observedTo: "2026-09-09", evidence: "Released", guardrails: [],
    corrections: [], requests: [], ...over,
  }
}

function line(over: Partial<ResultLine> & { results: ResultView[] }): ResultLine {
  return {
    metric: "Conversion rate", form: "numeric", unit: "%", changeUnit: "percentage points", audience: "all", platform: "all",
    window: "30 days after release", count: over.results.length, summed: null, verdicts: null, ...over,
  }
}

describe("metric chart presenter (#158)", () => {
  it("scales one metric's chart to its own largest value, with each bar's height as a share of that scale", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1 })] }))
    expect(chart?.scaleMax).toBe(50)
    expect(chart?.groups[0].bars).toEqual([
      { series: "baseline", label: "Baseline", value: 40, height: 80 },
      { series: "actual", label: "Actual", value: 46, height: 92 },
      { series: "predicted", label: "Predicted", value: 50, height: 100 },
    ])
  })

  it("never draws values from another metric: a chart carries only its own line's results", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, actual: 46 })] }))
    expect(chart?.metric).toBe("Conversion rate")
    expect(chart?.groups.map(group => group.requestNumber)).toEqual([1])
  })

  it("gives each result its own group, one per Request, without adding results together", () => {
    const chart = metricChart(line({
      results: [result({ requestNumber: 1, actual: 46 }), result({ requestNumber: 2, actual: 30, baseline: 20, predictedTarget: 30 })],
    }))
    expect(chart?.groups.map(group => group.requestNumber)).toEqual([1, 2])
    expect(chart?.scaleMax).toBe(50)
  })

  it("leaves out a baseline that is unknown and never draws it as zero", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baselineState: "unknown", baseline: null })] }))
    const labels = chart?.groups[0].bars.map(bar => bar.series)
    expect(labels).toEqual(["actual", "predicted"])
    expect(chart?.description).toContain("baseline unknown")
    expect(chart?.description).not.toContain("Baseline 0")
  })

  it("draws a new capability's target only, labelled as a new capability, with no baseline bar", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baselineState: "new_capability", baseline: null, actual: null, change: null })] }))
    expect(chart?.groups[0].bars).toEqual([{ series: "predicted", label: "Predicted", value: 50, height: 100 }])
    expect(chart?.description).toContain("new capability")
  })

  it("describes every value in words for screen readers, one sentence per Request", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1 })] }))
    expect(chart?.description).toBe(
      "Conversion rate, unit %, window 30 days after release. Request #1 Request 1: baseline 40 %, actual 46 %, predicted 50 %.",
    )
  })

  it("returns no chart for a Verified result, which is counted and never drawn as a number", () => {
    expect(metricChart(line({ form: "pass_fail", unit: "count", results: [result({ requestNumber: 1, form: "pass_fail" })] }))).toBeNull()
  })

  it("returns a chart with no groups when no result has a numeric value, so the view shows the empty message", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baselineState: "unknown", baseline: null, actual: null, predictedTarget: null })] }))
    expect(chart?.groups).toEqual([])
    expect(chart?.scaleMax).toBe(0)
  })
})
