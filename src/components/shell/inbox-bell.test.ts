import { describe, expect, it } from "vitest"
import { inboxBellLabel } from "./inbox-bell"

describe("the Inbox bell's name", () => {
  it("says how many Needs-you items wait, and nothing else", () => {
    expect(inboxBellLabel(0)).toBe("Inbox")
    expect(inboxBellLabel(1)).toBe("Inbox, 1 needs you")
    expect(inboxBellLabel(4)).toBe("Inbox, 4 need you")
  })
})
