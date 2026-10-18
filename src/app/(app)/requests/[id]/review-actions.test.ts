import { describe, expect, it, vi } from "vitest"
import { requestDesignReview, respondToDesignReview, withdrawDesignReview } from "./review-actions"

// Retired actions must not reach storage or send review notifications.
vi.mock("@/db", () => { throw new Error("Retired review actions must not access the database") })

describe("Figma owns design reviews", () => {
  it.each([
    ["request", requestDesignReview, { expectedVersion: 0, designUrl: "https://www.figma.com/design/example", question: "Review this", reviewerIds: ["reviewer"] }],
    ["respond", respondToDesignReview, { expectedVersion: 1, reviewId: "round-1", decision: "looks_good", note: "" }],
    ["withdraw", withdrawDesignReview, { expectedVersion: 1, reviewId: "round-1", reason: "Replaced" }],
  ] as const)("rejects the old %s action without changing saved data", async (_name, action, input) => {
    const result = await action("a1000000-0000-4000-8000-000000000001", input, { orgId: "workspace" })
    expect(result).toEqual({ error: "Design reviews happen in Figma. Open the design link to continue." })
  })
})
