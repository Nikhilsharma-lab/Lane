import { describe, expect, it } from "vitest"
import { framingIssue, framingShape, KEEP_PROBLEM, KEEP_SOLUTION, savedFraming, storedShape } from "./request-framing"

const problem = "Customers abandon checkout after unexpected delivery costs."
const solution = "Display delivery costs earlier."

describe("framingIssue", () => {
  it("accepts each judgement with exactly its framing", () => {
    expect(framingIssue({ classification: "problem", reframedProblem: null, extractedSolution: null })).toBeNull()
    expect(framingIssue({ classification: "solution", reframedProblem: problem, extractedSolution: null })).toBeNull()
    expect(framingIssue({ classification: "hybrid", reframedProblem: problem, extractedSolution: solution })).toBeNull()
  })
  it("refuses framing that doesn't fit the judgement", () => {
    expect(framingIssue({ classification: "problem", reframedProblem: problem, extractedSolution: null })).not.toBeNull()
    expect(framingIssue({ classification: "solution", reframedProblem: problem, extractedSolution: solution })).not.toBeNull()
    expect(framingIssue({ classification: "hybrid", reframedProblem: problem, extractedSolution: null })).not.toBeNull()
  })
})

describe("savedFraming", () => {
  it("writes only what the judgement carries, trimmed", () => {
    expect(savedFraming(framingShape("problem"), { reframedProblem: problem, extractedSolution: solution })).toEqual({ ok: true, framing: { reframedProblem: null, extractedSolution: null } })
    expect(savedFraming(framingShape("solution"), { reframedProblem: ` ${problem} `, extractedSolution: solution })).toEqual({ ok: true, framing: { reframedProblem: problem, extractedSolution: null } })
    expect(savedFraming(framingShape("hybrid"), { reframedProblem: problem, extractedSolution: ` ${solution}\n` })).toEqual({ ok: true, framing: { reframedProblem: problem, extractedSolution: solution } })
  })
  it("never drops a required part", () => {
    expect(savedFraming(framingShape("solution"), { reframedProblem: "  ", extractedSolution: null })).toEqual({ ok: false, field: "reframedProblem", message: KEEP_PROBLEM })
    expect(savedFraming(framingShape("hybrid"), { reframedProblem: problem, extractedSolution: "" })).toEqual({ ok: false, field: "extractedSolution", message: KEEP_SOLUTION })
    expect(savedFraming(framingShape("solution"), { reframedProblem: null, extractedSolution: null }, "Describe it.")).toMatchObject({ ok: false, message: "Describe it." })
  })
  it("applies the problem framing bounds", () => {
    expect(savedFraming(framingShape("solution"), { reframedProblem: "Too short", extractedSolution: null })).toMatchObject({ ok: false, field: "reframedProblem" })
  })
})

describe("storedShape", () => {
  it("follows the classification, or an older Request's own parts", () => {
    expect(storedShape({ classification: "hybrid", reframedProblem: null, extractedSolution: null })).toEqual({ problem: true, solution: true })
    expect(storedShape({ classification: null, reframedProblem: problem, extractedSolution: null })).toEqual({ problem: true, solution: false })
  })
})
