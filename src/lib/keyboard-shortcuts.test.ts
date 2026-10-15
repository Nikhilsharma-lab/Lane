import { describe, expect, it } from "vitest"
import { ROW_MENU_HINTS, SHORTCUT_GROUPS } from "./keyboard-shortcuts"
import { gridCommand, listCommand } from "@/components/requests/request-grid-keys"

const keysOf = (scope: string) => SHORTCUT_GROUPS.filter(group => group.scope === scope).flatMap(group => group.shortcuts.flatMap(item => item.keys))
// How each shown key arrives in a keydown event.
const EVENT_KEY: Record<string, string> = { "↓": "ArrowDown", "↑": "ArrowUp", "→": "ArrowRight", "←": "ArrowLeft", Home: "Home", End: "End", Enter: "Enter" }
// List keys another handler owns: Esc clears the selection (useRequestSelection), Shift F10 is Arc ContextMenu's.
const OWNED_ELSEWHERE = new Set(["Esc", "Shift F10"])

describe("keyboard shortcut map", () => {
  it("never repeats a key within a scope or against Anywhere", () => {
    const anywhere = keysOf("anywhere")
    expect(new Set(anywhere).size).toBe(anywhere.length)
    for (const scope of ["list", "detail", "forms"]) {
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
  it("hints only the row menu's supported actions", () => {
    expect(ROW_MENU_HINTS).toEqual({ select: "X", open: "Enter" })
    expect(keysOf("list")).toEqual(expect.arrayContaining([ROW_MENU_HINTS.select, ROW_MENU_HINTS.open]))
  })
})
