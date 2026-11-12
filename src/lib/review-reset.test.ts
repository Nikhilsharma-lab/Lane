import { describe, expect, it } from "vitest";
import { answeredReviewsOf, reviewResetWarning } from "./review-reset";

// #280 (B9): an edit that changes the Request clears every review answer; the dialog says whose first.
describe("answeredReviewsOf", () => {
  const reviewer = (name: string, kind: "looks_good" | "concern" | null) => ({ displayNameAtSelection: name, decision: kind ? { kind, actorId: name, at: "2026-11-01T10:00:00Z", reason: kind === "concern" ? "Too vague" : "" } : null })
  it("names the concerns and counts the other answers; unanswered reviews clear nothing", () => {
    expect(answeredReviewsOf([reviewer("Sam", "looks_good"), reviewer("Daniel", "concern"), reviewer("Ana", null)])).toEqual({ concerns: ["Daniel"], others: 1 })
    expect(answeredReviewsOf([reviewer("Ana", null)])).toBeNull()
    expect(answeredReviewsOf(null)).toBeNull()
  })
})

describe("reviewResetWarning", () => {
  it("says nothing when nobody has answered", () => {
    expect(reviewResetWarning(null)).toBeNull()
    expect(reviewResetWarning({ concerns: [], others: 0 })).toBeNull()
  })
  it("names each concern and counts the other answers", () => {
    expect(reviewResetWarning({ concerns: ["Daniel"], others: 1 })).toBe("Saving clears Daniel’s concern and 1 other answer. They’ll be told.")
    expect(reviewResetWarning({ concerns: ["Daniel"], others: 0 })).toBe("Saving clears Daniel’s concern. They’ll be told.")
    expect(reviewResetWarning({ concerns: ["Daniel", "Priya"], others: 2 })).toBe("Saving clears Daniel’s and Priya’s concerns and 2 other answers. They’ll be told.")
    expect(reviewResetWarning({ concerns: ["Daniel", "Priya", "Sam"], others: 0 })).toBe("Saving clears Daniel’s, Priya’s and Sam’s concerns. They’ll be told.")
  })
  it("counts the answers when none is a concern", () => {
    expect(reviewResetWarning({ concerns: [], others: 1 })).toBe("Saving clears 1 review answer. They’ll be told.")
    expect(reviewResetWarning({ concerns: [], others: 2 })).toBe("Saving clears 2 review answers. They’ll be told.")
  })
})
