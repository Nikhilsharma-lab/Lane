import { describe, expect, it } from "vitest";
import { DIDNT_PASS, PASSED, goalDirection, goalValueText, passFailText, resultAgainstGoal, resultValueText } from "./result-phrasing";

// #279 (decision 8, from #242 item 3): a result reads against the goal in the goal's own direction, worked out from
// its start and end. Build 7's Impact (#282) reuses these words.
describe("a measured result against its goal", () => {
  it.each([
    // Falling goal (90 minutes from 240: lower is better).
    ["falling, past", 75, { unit: "minutes", baseline: 240, target: 90 }, "Reached 75 minutes, 15 past the goal"],
    ["falling, short", 120, { unit: "minutes", baseline: 240, target: 90 }, "Reached 120 minutes, 30 short of the goal"],
    // Rising goal (55% from 40%: higher is better). Percentages differ in points.
    ["rising, short", 47, { unit: "%", baseline: 40, target: 55 }, "Reached 47%, 8 points short of the goal"],
    ["rising, past", 58, { unit: "%", baseline: 40, target: 55 }, "Reached 58%, 3 points past the goal"],
    ["one point", 54, { unit: "%", baseline: 40, target: 55 }, "Reached 54%, 1 point short of the goal"],
    ["exactly", 80, { unit: "%", baseline: 62, target: 80 }, "Reached 80%, exactly the goal"],
    // Counts are bare numbers; other units name themselves on the value.
    ["count, rising, past", 130, { unit: "count", baseline: 100, target: 120 }, "Reached 130, 10 past the goal"],
    ["count, falling, short", 14, { unit: "count", baseline: 20, target: 10 }, "Reached 14, 4 short of the goal"],
    ["seconds, falling, past", 2.5, { unit: "seconds", baseline: 6, target: 3 }, "Reached 2.5 seconds, 0.5 past the goal"],
    // A legacy free-text unit reads like any other.
    ["legacy unit", 310, { unit: "ms", baseline: 500, target: 300 }, "Reached 310 ms, 10 short of the goal"],
    // Decimals keep their own precision, never floating-point noise.
    ["decimals", 0.3, { unit: "%", baseline: 0.1, target: 0.2 }, "Reached 0.3%, 0.1 points past the goal"],
  ])("%s", (_case, actual, goal, words) => {
    expect(resultAgainstGoal(actual, goal)).toBe(words);
  });

  it("without a direction it states the goal beside the result: no baseline, or a start equal to the end", () => {
    expect(resultAgainstGoal(80, { unit: "%", baseline: null, target: 80 })).toBe("Reached 80% (goal 80%)");
    expect(resultAgainstGoal(70, { unit: "%", baseline: null, target: 80 })).toBe("Reached 70% (goal 80%)");
    expect(resultAgainstGoal(12, { unit: "count", baseline: 10, target: 10 })).toBe("Reached 12 (goal 10)");
  });

  it("with no goal set it states the result only", () => {
    expect(resultAgainstGoal(75, { unit: "minutes", baseline: 240, target: null })).toBe("Reached 75 minutes");
  });
});

describe("the goal's direction", () => {
  it("comes from where the goal starts and ends", () => {
    expect(goalDirection({ baseline: 40, target: 55 })).toBe("rising");
    expect(goalDirection({ baseline: 240, target: 90 })).toBe("falling");
    expect(goalDirection({ baseline: null, target: 80 })).toBeNull();
    expect(goalDirection({ baseline: 80, target: 80 })).toBeNull();
    expect(goalDirection({ baseline: 80, target: null })).toBeNull();
  });
});

describe("a value in its unit", () => {
  it.each([
    [62, "%", "62%"],
    [12, "count", "12"],
    [30, "seconds", "30 seconds"],
    [75, "minutes", "75 minutes"],
    [-3, "%", "-3%"],
  ])("%s %s reads %s", (value, unit, words) => {
    expect(resultValueText(value, unit)).toBe(words);
  });
});

describe("a pass/fail check's result", () => {
  it("reads Passed or Didn’t pass, never Met / Missed or Good / Bad", () => {
    expect(passFailText(true)).toBe("Passed");
    expect(passFailText(false)).toBe("Didn’t pass");
    expect([PASSED, DIDNT_PASS]).toEqual(["Passed", "Didn’t pass"]);
  });
});

describe("a numeric goal's value", () => {
  it("is its end value, with where it starts when that's known", () => {
    expect(goalValueText({ unit: "%", baseline: 62, target: 80 })).toBe("80% (from 62%)");
    expect(goalValueText({ unit: "minutes", baseline: 240, target: 90 })).toBe("90 minutes (from 240 minutes)");
    expect(goalValueText({ unit: "count", baseline: null, target: 12 })).toBe("12");
    expect(goalValueText({ unit: "%", baseline: 62, target: null })).toBe("No goal set");
  });
});
