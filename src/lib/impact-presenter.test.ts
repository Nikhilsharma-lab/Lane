import { describe, expect, it } from "vitest"
import type { ResultView } from "./impact-read-model"
import { beforeReleaseText, goalText, passFailTotalText, resultText, totalText, verdictText } from "./impact-presenter"
import { changeAmountText, resultValueText } from "./result-phrasing"

// #282: the Impact presenter words every goal, result and total the views show. Expected words are literals from the
// spec (#256 Build 7, "Impact result wording"; #242 decisions 2 and 3), never recomputed the way the code does it.

function result(over: Partial<ResultView>): ResultView {
  return {
    requestId: "req-1", requestNumber: 1, title: "Shorter checkout", definitionId: null, metric: "Conversion rate", form: "numeric",
    unit: "%", changeUnit: "percentage points", audience: "All users", platform: "All platforms", window: "30 days after release",
    baselineState: "known", baseline: 62, baselineSource: "release", plannedBaseline: 62, actual: 75, change: 13, verdict: null, correctedFrom: null,
    predictedTarget: 80, predictedChange: 18, releaseDate: "2026-08-10", observedFrom: "2026-08-10", observedTo: "2026-09-09", evidence: "Export",
    guardrails: [], corrections: [], requests: [], ...over,
  }
}

const numericGoal = { form: "numeric" as const, metric: "Conversion rate", unit: "%" }

describe("goal text: the goal is its end value", () => {
  it("reads the end value with where it starts: Goal: 80% (from 62%)", () => {
    expect(goalText({ ...numericGoal, baseline: 62, target: 80 })).toBe("80% (from 62%)")
  })

  it("reads the end value alone when only a target was set", () => {
    expect(goalText({ ...numericGoal, baseline: null, target: 80 })).toBe("80%")
  })

  it("works out the end value from the baseline when only a change was set", () => {
    expect(goalText({ ...numericGoal, baseline: 62, target: null, predictedChange: 18 })).toBe("80% (from 62%)")
  })

  it("reads the change itself when only a change was set and the baseline isn't known", () => {
    expect(goalText({ ...numericGoal, baseline: null, target: null, predictedChange: 18 })).toBe("+18 points")
    expect(goalText({ form: "numeric", metric: "Time to approve", unit: "minutes", baseline: null, target: null, predictedChange: -165 })).toBe("−165 minutes")
  })

  it("reads a pass/fail goal in the check's own words", () => {
    expect(goalText({ form: "pass_fail", metric: "Complete checkout using only a keyboard", unit: "", baseline: null, target: null })).toBe("Complete checkout using only a keyboard")
  })

  it("says so when no goal was set", () => {
    expect(goalText({ ...numericGoal, baseline: 62, target: null })).toBe("No goal set")
  })
})

describe("a result against its goal", () => {
  it("says how far past a falling goal it reached: Reached 75 minutes, 15 past the goal", () => {
    expect(resultText(result({ unit: "minutes", plannedBaseline: 240, predictedTarget: 90, actual: 75 }))).toBe("Reached 75 minutes, 15 past the goal")
  })

  it("says how far short of a rising goal it reached, in points for a percentage", () => {
    expect(resultText(result({ plannedBaseline: 40, predictedTarget: 55, actual: 47 }))).toBe("Reached 47%, 8 points short of the goal")
  })

  it("says when it reached the goal exactly", () => {
    expect(resultText(result({ actual: 80 }))).toBe("Reached 80%, exactly the goal")
  })

  it("states the goal beside the result, claiming no direction, when the goal has no start", () => {
    expect(resultText(result({ baselineState: "new_capability", baseline: null, baselineSource: null, plannedBaseline: null, actual: 80 }))).toBe("Reached 80% (goal 80%)")
  })

  it("takes the direction from the goal's own start, not the value before release", () => {
    // Goal 90 from 240 (falling); the value before release was 70, below the goal. 75 is still past a falling goal.
    expect(resultText(result({ unit: "minutes", baseline: 70, plannedBaseline: 240, predictedTarget: 90, actual: 75 }))).toBe("Reached 75 minutes, 15 past the goal")
  })

  it("reads a pass/fail result as Passed or Didn’t pass", () => {
    expect(resultText(result({ form: "pass_fail", unit: "", actual: null, verdict: "good" }))).toBe("Passed")
    expect(resultText(result({ form: "pass_fail", unit: "", actual: null, verdict: "bad" }))).toBe("Didn’t pass")
  })

  it("says Not recorded when there's no value", () => {
    expect(resultText(result({ actual: null }))).toBe("Not recorded")
  })
})

describe("verdicts", () => {
  it("read Passed and Didn’t pass, never Good and Bad", () => {
    expect(verdictText("good")).toBe("Passed")
    expect(verdictText("bad")).toBe("Didn’t pass")
    expect(verdictText(null)).toBe("Not recorded")
  })

  it("count together as 1 passed, 0 didn’t pass", () => {
    expect(passFailTotalText({ good: 1, bad: 0 })).toBe("1 passed, 0 didn’t pass")
  })
})

describe("totals", () => {
  it("use a true minus sign and leave out in total for a single result: −165 minutes from 1 result", () => {
    expect(totalText(-165, "minutes", 1)).toBe("−165 minutes from 1 result")
  })

  it("say in total only when more than one result is counted", () => {
    expect(totalText(30, "count", 2)).toBe("+30 in total from 2 results")
    expect(totalText(0, "count", 3)).toBe("No change in total from 3 results")
    expect(totalText(0, "count", 1)).toBe("No change from 1 result")
  })
})

describe("values and changes", () => {
  it("write a percentage with no space: 62%", () => {
    expect(resultValueText(62, "%")).toBe("62%")
  })

  it("write a change with a true minus sign, a percentage's in points", () => {
    expect(changeAmountText(6, "%")).toBe("+6 points")
    expect(changeAmountText(-5, "seconds")).toBe("−5 seconds")
    expect(changeAmountText(10, "count")).toBe("+10")
    expect(changeAmountText(0, "%")).toBe("No change")
  })

  it("show the value before release only when it was recorded at release; a legacy planning baseline reads in the goal", () => {
    expect(beforeReleaseText(result({ baseline: 58, baselineSource: "release" }))).toBe("58%")
    expect(beforeReleaseText(result({ baseline: 62, baselineSource: "planning" }))).toBeNull()
    expect(beforeReleaseText(result({ form: "pass_fail", baseline: null, baselineSource: null }))).toBeNull()
  })
})
