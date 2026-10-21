import { describe, expect, it } from "vitest"
import { ROW_MENU_HINTS, SHORTCUT_GROUPS } from "./keyboard-shortcuts"
import { gridCommand, listCommand } from "@/components/requests/request-grid-keys"
import { detailCommand } from "@/components/requests/request-detail-keys"
import { notificationCommand } from "@/components/shell/notification-keys"

const keysOf = (scope: string) => SHORTCUT_GROUPS.filter(group => group.scope === scope).flatMap(group => group.shortcuts.flatMap(item => item.keys))
// How each shown key arrives in a keydown event.
const EVENT_KEY: Record<string, string> = { "↓": "ArrowDown", "↑": "ArrowUp", "→": "ArrowRight", "←": "ArrowLeft", Home: "Home", End: "End", Enter: "Enter", Space: " " }
// List keys another handler owns: Esc clears the selection (useRequestSelection), Shift F10 is Arc ContextMenu's.
const OWNED_ELSEWHERE = new Set(["Esc", "Shift F10"])
// Notification keys another handler owns: Enter is the row button's own activation, Esc is the Radix popover's (plan item 2.7).
const NOTIFICATIONS_OWNED_ELSEWHERE = new Set(["Enter", "Esc"])

describe("keyboard shortcut map", () => {
  it("never repeats a key within a scope or against Anywhere", () => {
    const anywhere = keysOf("anywhere")
    expect(new Set(anywhere).size).toBe(anywhere.length)
    for (const scope of ["list", "preview", "detail", "notifications", "forms"]) {
      const keys = keysOf(scope)
      expect(new Set(keys).size, scope).toBe(keys.length)
      for (const key of keys) expect(anywhere, `${scope} ${key}`).not.toContain(key)
    }
  })
  it("gives every Requests list key a grid command", () => {
    for (const key of keysOf("list")) {
      if (OWNED_ELSEWHERE.has(key)) continue
      const eventKey = EVENT_KEY[key] ?? key.toLowerCase()
      expect(gridCommand({ key: eventKey }), key).not.toBeNull()
    }
  })
  it("keeps the app-wide letters out of the list's commands", () => {
    for (const key of keysOf("anywhere").filter(key => key.length === 1)) {
      expect(gridCommand({ key: key.toLowerCase() }), key).toBeNull()
      expect(listCommand({ key: key.toLowerCase() }), key).toBeNull()
    }
  })
  // Plan item 2.5: Esc on detail is request-workspace-keyboard.tsx's (a form or menu first, then the list).
  it("gives every detail key a detail command", () => {
    for (const key of keysOf("detail")) {
      if (key === "Esc") continue
      expect(detailCommand({ key: key.toLowerCase() }), key).not.toBeNull()
    }
  })
  it("keeps the app-wide letters out of detail's commands", () => {
    for (const key of keysOf("anywhere").filter(key => key.length === 1)) expect(detailCommand({ key: key.toLowerCase() }, false, true), key).toBeNull()
  })
  // Plan item 2.7: the popover's keys, with Enter and Esc owned by the row button and Radix.
  it("gives every notifications key a command", () => {
    for (const key of keysOf("notifications")) {
      if (NOTIFICATIONS_OWNED_ELSEWHERE.has(key)) continue
      const eventKey = EVENT_KEY[key] ?? key.toLowerCase()
      expect(notificationCommand({ key: eventKey }), key).not.toBeNull()
    }
  })
  it("keeps the app-wide letters out of the notifications commands", () => {
    for (const key of keysOf("anywhere").filter(key => key.length === 1)) expect(notificationCommand({ key: key.toLowerCase() }), key).toBeNull()
  })
  it("hints only the row menu's supported actions", () => {
    expect(ROW_MENU_HINTS).toEqual({ select: "X", open: "Enter", peek: "Space" })
    expect(keysOf("list")).toEqual(expect.arrayContaining([ROW_MENU_HINTS.select, ROW_MENU_HINTS.open]))
  })
})
