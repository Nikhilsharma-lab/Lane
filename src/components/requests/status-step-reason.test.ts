import { describe, expect, it } from "vitest"
import { statusStepReason } from "./status-step-reason"

describe("why a status in the row menu is greyed (A228)", () => {
  it("names the step that has to come first", () => {
    expect(statusStepReason("open", "done")).toBe("Pick it up first")
    expect(statusStepReason("open", "measuring")).toBe("Record the release first")
    expect(statusStepReason("in_progress", "measuring")).toBe("Record the release first")
    expect(statusStepReason("done", "closed")).toBe("Record the result once it’s Measuring")
    expect(statusStepReason("open", "closed")).toBe("Record the result once it’s Measuring")
  })

  it("says Requests don’t move back for every earlier status", () => {
    expect(statusStepReason("in_progress", "open")).toBe("Requests don’t move back")
    expect(statusStepReason("closed", "measuring")).toBe("Requests don’t move back")
    expect(statusStepReason("done", "in_progress")).toBe("Requests don’t move back")
  })

  it("gives the current status no reason", () => {
    expect(statusStepReason("done", "done")).toBeUndefined()
  })
})
