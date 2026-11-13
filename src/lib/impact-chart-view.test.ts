import { describe, expect, it } from "vitest"
import type { ResultLine, ResultView } from "@/lib/impact-read-model"
import { metricChart } from "./impact-chart-view"

// The chart presenter (#158) takes one ResultLine from the read model and returns the values one chart shows.
// Expected values are literals written from the fixtures, never recomputed the way the code does it.

function result(over: Partial<ResultView> & Pick<ResultView, "requestNumber">): ResultView {
  return {
    requestId: `req-${over.requestNumber}`, title: `Request ${over.requestNumber}`, definitionId: null, metric: "Conversion rate", form: "numeric",
    unit: "%", changeUnit: "percentage points", audience: "all", platform: "all", window: "30 days after release",
    baselineState: "known", baseline: 40, baselineSource: "planning", plannedBaseline: 40, actual: 46, change: 6, verdict: null, correctedFrom: null, predictedTarget: 50, predictedChange: 10,
    releaseDate: "2026-08-10", observedFrom: "2026-08-10", observedTo: "2026-09-09", evidence: "Released", guardrails: [],
    corrections: [], requests: [], ...over,
  }
}

function line(over: Partial<ResultLine> & { results: ResultView[] }): ResultLine {
  return {
    definitionId: null, metric: "Conversion rate", form: "numeric", unit: "%", changeUnit: "percentage points", audience: "all", platform: "all",
    window: "30 days after release", count: over.results.length, summed: null, verdicts: null, ...over,
  }
}

describe("metric chart presenter (#158)", () => {
  it("scales one metric's chart to its own largest value, with each bar's height as a share of that scale", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baseline: 40, baselineSource: "release" })] }))
    expect(chart?.scaleMax).toBe(50)
    expect(chart?.groups[0].bars.map(bar => [bar.series, bar.height])).toEqual([["before_release", 80], ["result", 92], ["goal", 100]])
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
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baselineState: "unknown", baseline: null, baselineSource: null, plannedBaseline: null })] }))
    expect(chart?.groups[0].bars.map(bar => bar.series)).toEqual(["result", "goal"])
    expect(chart?.description).toContain("value before release unknown")
    expect(chart?.description).not.toMatch(/before release 0/)
  })

  it("draws a new capability's goal only, labelled as a new capability, with no before-release bar", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baselineState: "new_capability", baseline: null, baselineSource: null, plannedBaseline: null, actual: null, change: null })] }))
    expect(chart?.groups[0].bars).toEqual([{ series: "goal", label: "Goal", value: 50, valueLabel: "50%", height: 100 }])
    expect(chart?.description).toContain("new capability")
  })

  it("returns no chart for a Verified result, which is counted and never drawn as a number", () => {
    expect(metricChart(line({ form: "pass_fail", unit: "count", results: [result({ requestNumber: 1, form: "pass_fail" })] }))).toBeNull()
  })

  it("returns a chart with no groups when no result has a numeric value, so the view shows the empty message", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baselineState: "unknown", baseline: null, baselineSource: null, actual: null, predictedTarget: null })] }))
    expect(chart?.groups).toEqual([])
    expect(chart?.scaleMax).toBe(0)
  })
})

describe("metric chart presenter: Lane's words and numbers (#282)", () => {
  it("names its three series Before release, Result and Goal, in that order, for the legend", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1 })] }))
    expect(chart?.legend.map(item => item.label)).toEqual(["Before release", "Result", "Goal"])
  })

  it("labels each group with its Request's saved code and title, and each bar with its value", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 40, title: "Shorter checkout", baseline: 62, baselineSource: "release", actual: 75, predictedTarget: 80 })] }))
    expect(chart?.groups[0]).toMatchObject({ code: "LAN-40", title: "Shorter checkout" })
    expect(chart?.groups[0].bars.map(bar => [bar.label, bar.valueLabel])).toEqual([["Before release", "62%"], ["Result", "75%"], ["Goal", "80%"]])
  })

  it("writes values in their own unit: a count bare, other units by name", () => {
    const minutes = metricChart(line({ unit: "minutes", results: [result({ requestNumber: 2, unit: "minutes", baseline: 240, baselineSource: "release", plannedBaseline: 240, actual: 75, predictedTarget: 90 })] }))
    expect(minutes?.groups[0].bars.map(bar => bar.valueLabel)).toEqual(["240 minutes", "75 minutes", "90 minutes"])
    const count = metricChart(line({ unit: "count", results: [result({ requestNumber: 3, unit: "count", baseline: null, baselineSource: null, actual: 12, predictedTarget: 10 })] }))
    expect(count?.groups[0].bars.map(bar => bar.valueLabel)).toEqual(["12", "10"])
  })

  it("says each Request's code, title, values and goal in words, with no space before a percent sign", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 40, title: "Shorter checkout", baseline: 58, baselineSource: "release", plannedBaseline: 62, actual: 75, predictedTarget: 80 })] }))
    expect(chart?.description).toBe(
      "Conversion rate, 30 days after release. LAN-40 Shorter checkout: before release 58%, result 75%, goal 80% (from 62%).",
    )
    expect(chart?.description).not.toMatch(/\d %/)
  })
})

describe("metric chart presenter: a legacy planning baseline (#282)", () => {
  it("never draws a planning baseline as Before release: it reads as the goal's from value", () => {
    const chart = metricChart(line({ results: [result({ requestNumber: 1, baseline: 40, baselineSource: "planning", plannedBaseline: 40, actual: 46, predictedTarget: 50 })] }))
    expect(chart?.groups[0].bars.map(bar => bar.series)).toEqual(["result", "goal"])
    expect(chart?.legend.map(item => item.label)).toEqual(["Before release", "Result", "Goal"])
    expect(chart?.description).toBe("Conversion rate, 30 days after release. LAN-1 Request 1: result 46%, goal 50% (from 40%).")
    expect(chart?.description).not.toMatch(/planning/i)
  })
})
