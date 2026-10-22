import { describe, expect, it } from "vitest"
import { formContext, REQUEST_CONTEXT_FIELDS, requestSchema, sourceFieldOf, storedContext } from "./request-schema"
import { sourceRequestType } from "./request-labels"

describe("the Request source field set", () => {
  it("names every field the composer writes, and nothing else", () => {
    const shape = Object.keys(requestSchema.shape)
    for (const field of REQUEST_CONTEXT_FIELDS) expect(shape).toContain(field)
    expect(sourceFieldOf(["usefulLink"])).toBe("usefulLink")
    expect(sourceFieldOf(["expectedImpact", "primary", "noBaseline"])).toBe("expectedImpact")
    expect(sourceFieldOf(["reviewers"])).toBeUndefined()
  })
  it("saves empty context as null and edits missing context as empty", () => {
    expect(storedContext({ affectedPeople: "Buyers", desiredChange: "", usefulLink: "https://x.test" })).toEqual({ affectedPeople: "Buyers", desiredChange: null, observedEvidence: null, uncertainty: null, usefulLink: "https://x.test" })
    expect(formContext({ affectedPeople: null, usefulLink: "https://x.test" })).toEqual({ affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "https://x.test" })
  })
})

describe("sourceRequestType", () => {
  it("takes the type from labels when there are any, and the saved type otherwise", () => {
    expect(sourceRequestType({ labelKeys: ["bug", "design"], requestType: "new_feature" })).toBe("bug")
    expect(sourceRequestType({ labelKeys: ["design"], requestType: "bug" })).toBeNull()
    expect(sourceRequestType({ requestType: "improvement" })).toBe("improvement")
    expect(sourceRequestType({})).toBeNull()
  })
})
