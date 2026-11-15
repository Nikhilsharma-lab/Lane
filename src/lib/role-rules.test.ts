import { describe, expect, it } from "vitest"
import { canCreateRequests } from "./role-rules"

describe("canCreateRequests", () => {
  // #285: the one rule behind New Request on the list's Open group, /intake and Impact. A Viewer files nothing; a
  // Guest still files their own Requests until #314 changes this rule.
  it("lets Admins, Members and Guests create Requests, and not Viewers", () => {
    expect(canCreateRequests("admin")).toBe(true)
    expect(canCreateRequests("member")).toBe(true)
    expect(canCreateRequests("guest")).toBe(true)
    expect(canCreateRequests("viewer")).toBe(false)
  })
})
