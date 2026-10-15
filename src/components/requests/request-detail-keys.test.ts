import { describe, expect, it } from "vitest"
import { detailCommand } from "./request-detail-keys"

// Plan item 2.5 (decision D1): J and K anywhere on detail, the arrows only on the previous and next buttons.
describe("detailCommand", () => {
  it("maps J and K anywhere", () => {
    expect(detailCommand({ key: "j" })).toBe("next")
    expect(detailCommand({ key: "k" })).toBe("previous")
    expect(detailCommand({ key: "J", shiftKey: false })).toBe("next")
  })

  it("maps the arrows only while focus is on the previous or next button", () => {
    expect(detailCommand({ key: "ArrowDown" })).toBeNull()
    expect(detailCommand({ key: "ArrowUp" })).toBeNull()
    expect(detailCommand({ key: "ArrowDown" }, false, true)).toBe("next")
    expect(detailCommand({ key: "ArrowUp" }, false, true)).toBe("previous")
    expect(detailCommand({ key: "ArrowDown", shiftKey: true }, false, true)).toBeNull()
  })

  it("ignores typing, modifiers, Shift letters, repeats, composition and handled keys", () => {
    expect(detailCommand({ key: "j" }, true)).toBeNull()
    for (const modifier of ["ctrlKey", "metaKey", "altKey"] as const) expect(detailCommand({ key: "j", [modifier]: true })).toBeNull()
    expect(detailCommand({ key: "J", shiftKey: true })).toBeNull()
    expect(detailCommand({ key: "j", repeat: true })).toBeNull()
    expect(detailCommand({ key: "ArrowDown", repeat: true }, false, true)).toBeNull()
    expect(detailCommand({ key: "j", isComposing: true })).toBeNull()
    expect(detailCommand({ key: "j", defaultPrevented: true })).toBeNull()
  })

  it("binds nothing else on detail", () => {
    for (const key of ["x", "f", "Enter", "Home", "End", "Escape", "ArrowLeft", "ArrowRight"]) expect(detailCommand({ key }, false, true)).toBeNull()
  })
})
