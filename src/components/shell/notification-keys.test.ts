import { describe, expect, it } from "vitest"
import { nextNotificationId, notificationCommand } from "./notification-keys"

// Plan item 2.7: the popover's keys, mirroring request-grid-keys.test.ts.
const ids = ["n1", "n2", "n3"]

describe("notificationCommand", () => {
  it("maps J and ArrowDown to next, K and ArrowUp to previous, Home and End to the ends", () => {
    expect(notificationCommand({ key: "j" })).toBe("next")
    expect(notificationCommand({ key: "J" })).toBe("next")
    expect(notificationCommand({ key: "ArrowDown" })).toBe("next")
    expect(notificationCommand({ key: "k" })).toBe("previous")
    expect(notificationCommand({ key: "ArrowUp" })).toBe("previous")
    expect(notificationCommand({ key: "Home" })).toBe("first")
    expect(notificationCommand({ key: "End" })).toBe("last")
  })

  it("treats Shift J as another key, and Shift with an arrow as nothing", () => {
    expect(notificationCommand({ key: "J", shiftKey: true })).toBeNull()
    expect(notificationCommand({ key: "ArrowDown", shiftKey: true })).toBeNull()
    expect(notificationCommand({ key: "Home", shiftKey: true })).toBeNull()
  })

  it("gives nothing for the app-wide letters, Enter, Esc, and the list's F and X", () => {
    for (const key of ["c", "/", "?", "f", "x", "Enter", "Escape", "[", "ArrowRight", "ArrowLeft", "Tab"]) {
      expect(notificationCommand({ key }), key).toBeNull()
    }
  })

  it("stands down while typing, composing, chorded or already handled", () => {
    expect(notificationCommand({ key: "j" }, true)).toBeNull()
    expect(notificationCommand({ key: "j", isComposing: true })).toBeNull()
    expect(notificationCommand({ key: "j", metaKey: true })).toBeNull()
    expect(notificationCommand({ key: "j", ctrlKey: true })).toBeNull()
    expect(notificationCommand({ key: "j", altKey: true })).toBeNull()
    expect(notificationCommand({ key: "j", defaultPrevented: true })).toBeNull()
  })

  it("allows a held J or K but not a held Home or End", () => {
    expect(notificationCommand({ key: "j", repeat: true })).toBe("next")
    expect(notificationCommand({ key: "ArrowUp", repeat: true })).toBe("previous")
    expect(notificationCommand({ key: "Home", repeat: true })).toBeNull()
    expect(notificationCommand({ key: "End", repeat: true })).toBeNull()
  })
})

describe("nextNotificationId", () => {
  it("moves one row and stops at the edges without wrapping", () => {
    expect(nextNotificationId(ids, "n1", "next")).toBe("n2")
    expect(nextNotificationId(ids, "n3", "next")).toBeNull()
    expect(nextNotificationId(ids, "n2", "previous")).toBe("n1")
    expect(nextNotificationId(ids, "n1", "previous")).toBeNull()
  })

  it("jumps to the first and last row", () => {
    expect(nextNotificationId(ids, "n2", "first")).toBe("n1")
    expect(nextNotificationId(ids, "n2", "last")).toBe("n3")
  })

  it("lands on the first row from outside the rows, and nowhere with no rows", () => {
    expect(nextNotificationId(ids, null, "next")).toBe("n1")
    expect(nextNotificationId(ids, "gone", "previous")).toBe("n1")
    expect(nextNotificationId([], "n1", "next")).toBeNull()
    expect(nextNotificationId([], null, "first")).toBeNull()
  })
})
