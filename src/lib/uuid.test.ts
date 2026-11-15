import { describe, expect, it } from "vitest"
import { isUuid } from "./uuid"

describe("isUuid", () => {
  it("accepts a UUID in either case", () => {
    expect(isUuid("3f2b1c9e-8d4a-4f6b-9c1d-2e5a7b8c9d0e")).toBe(true)
    expect(isUuid("3F2B1C9E-8D4A-4F6B-9C1D-2E5A7B8C9D0E")).toBe(true)
  })

  it("refuses anything else: other text, a UUID with more around it, and values that aren't strings", () => {
    for (const value of ["", "all", "none", "3f2b1c9e-8d4a-4f6b-9c1d-2e5a7b8c9d0", " 3f2b1c9e-8d4a-4f6b-9c1d-2e5a7b8c9d0e", "3f2b1c9e-8d4a-4f6b-9c1d-2e5a7b8c9d0e/x", "3f2b1c9e8d4a4f6b9c1d2e5a7b8c9d0e", null, undefined, 42, ["3f2b1c9e-8d4a-4f6b-9c1d-2e5a7b8c9d0e"]]) {
      expect(isUuid(value)).toBe(false)
    }
  })
})
