import { describe, expect, it } from "vitest"
import type { IterationEntry, Iterations } from "@/lib/impact-read-model"
import { withoutIteration } from "./same-problem-changes"

// #279 (story 68): Remove shows at once, and keeps what Undo needs to re-link the Request to the same group.
const entry = (requestId: string, number: number, current = false) =>
  ({ requestId, requestNumber: number * 10, title: requestId, number, label: "", current, journey: "Open", predicted: null, outcome: { kind: "still_due", due: null } }) as IterationEntry
const group: Iterations = { current: { number: 2, label: "2nd iteration" }, iterations: [entry("a", 1), entry("me", 2, true), entry("c", 3)] }

describe("taking a Request out of its Same problem group, shown at once", () => {
  it("another Request leaves the list and the rest are numbered again, oldest first", () => {
    const { shown, rejoin } = withoutIteration(group, "a")
    expect(shown?.iterations.map(i => [i.requestId, i.number, i.label])).toEqual([["me", 1, "1st iteration"], ["c", 2, "2nd iteration"]])
    expect(shown?.current).toEqual({ number: 1, label: "1st iteration" })
    // Undo links it back to one still in the group.
    expect(rejoin).toBe("me")
  })

  it("taking this Request out leaves it in no group", () => {
    const { shown, rejoin } = withoutIteration(group, "me")
    expect(shown).toBeNull()
    expect(rejoin).toBe("a")
  })

  it("a group of two ends when either leaves", () => {
    const pair: Iterations = { current: { number: 1, label: "1st iteration" }, iterations: [entry("me", 1, true), entry("b", 2)] }
    expect(withoutIteration(pair, "b")).toEqual({ shown: null, rejoin: "me" })
  })
})
