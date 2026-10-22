import { describe, expect, it } from "vitest"
import { changeAttempt } from "./change-attempt"

let n = 0
const id = () => `op-${++n}`

describe("changeAttempt", () => {
  it("keeps the operation when the same change is retried against the same revision", () => {
    const first = changeAttempt(null, { evidence: "Shipped" }, 4, id)
    expect(changeAttempt(first, { evidence: "Shipped" }, 4, id)).toBe(first)
  })
  it("starts a new operation for new input", () => {
    const first = changeAttempt(null, { evidence: "Shipped" }, 4, id)
    expect(changeAttempt(first, { evidence: "Shipped to all" }, 4, id).operationId).not.toBe(first.operationId)
  })
  it("starts a new operation against the revision a reload brought, so a stale refusal isn't repeated", () => {
    const stale = changeAttempt(null, { evidence: "Shipped" }, 4, id)
    expect(changeAttempt(stale, { evidence: "Shipped" }, 5, id)).toMatchObject({ expectedRevision: 5, operationId: expect.not.stringMatching(stale.operationId) })
  })
})
