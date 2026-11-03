import { describe, expect, it } from "vitest"
import { paletteListKey } from "./command-palette-keys"
import { paletteShortcut, typeaheadKey } from "./command-palette-shortcut"

const key = (overrides: Partial<Parameters<typeof paletteShortcut>[0]> = {}) => ({
  key: "k", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, repeat: false, isComposing: false, defaultPrevented: false, ...overrides,
})
const closed = { open: false, typing: false, overlay: false }

describe("⌘K opens and closes the palette (#106)", () => {
  it("opens on ⌘K and on Ctrl+K, whatever the case of the letter", () => {
    expect(paletteShortcut(key(), closed)).toBe("open")
    expect(paletteShortcut(key({ metaKey: false, ctrlKey: true }), closed)).toBe("open")
    expect(paletteShortcut(key({ key: "K" }), closed)).toBe("open")
  })

  it("leaves K alone without a modifier, and with Shift or Alt added", () => {
    expect(paletteShortcut(key({ metaKey: false }), closed)).toBeNull()
    expect(paletteShortcut(key({ shiftKey: true }), closed)).toBeNull()
    expect(paletteShortcut(key({ altKey: true }), closed)).toBeNull()
    expect(paletteShortcut(key({ key: "j" }), closed)).toBeNull()
  })

  it("does not open while typing in a field or while another dialog, menu or listbox is open", () => {
    expect(paletteShortcut(key(), { ...closed, typing: true })).toBeNull()
    expect(paletteShortcut(key(), { ...closed, overlay: true })).toBeNull()
  })

  it("closes on a second ⌘K, although its own field is a typing target and its own dialog is an overlay", () => {
    expect(paletteShortcut(key(), { open: true, typing: true, overlay: true })).toBe("close")
    expect(paletteShortcut(key({ metaKey: false, ctrlKey: true }), { open: true, typing: true, overlay: true })).toBe("close")
  })

  it("ignores a held key, a composing input method and a key another handler took", () => {
    expect(paletteShortcut(key({ repeat: true }), closed)).toBeNull()
    expect(paletteShortcut(key({ isComposing: true }), closed)).toBeNull()
    expect(paletteShortcut(key({ defaultPrevented: true }), closed)).toBeNull()
  })
})

describe("keys pressed while the palette is opening (#268, A12)", () => {
  const typed = (value: string, overrides: Partial<Parameters<typeof typeaheadKey>[0]> = {}) => key({ key: value, metaKey: false, ...overrides })

  it("keeps the letters typed before the field can take them, in order, spaces included", () => {
    let buffer = ""
    for (const letter of "in prog") {
      const command = typeaheadKey(typed(letter), buffer)
      if (command?.type !== "type") throw new Error(`"${letter}" was not kept`)
      buffer = command.text
    }
    expect(buffer).toBe("in prog")
    expect(typeaheadKey(typed("I", { shiftKey: true }), "")).toEqual({ type: "type", text: "I" })
  })

  it("takes back the last letter on Backspace", () => {
    expect(typeaheadKey(typed("Backspace"), "inbx")).toEqual({ type: "type", text: "inb" })
    expect(typeaheadKey(typed("Backspace"), "")).toEqual({ type: "type", text: "" })
  })

  it("holds every other key, so no page shortcut or row key fires (C, /, ?, J, Enter, the arrows)", () => {
    for (const value of ["c", "/", "?", "j", "x"]) expect(typeaheadKey(typed(value), "")).toEqual({ type: "type", text: value })
    for (const value of ["Enter", "ArrowDown", "Tab", "Shift"]) expect(typeaheadKey(typed(value), "ab")).toEqual({ type: "type", text: "ab" })
    expect(typeaheadKey(typed("j", { repeat: true }), "j")).toEqual({ type: "type", text: "jj" })
  })

  it("closes the opening palette on Escape", () => {
    expect(typeaheadKey(typed("Escape"), "ab")).toEqual({ type: "close" })
  })

  it("leaves chords to their own handlers (⌘K closes, ⌘V pastes) and leaves a composing input method alone", () => {
    expect(typeaheadKey(key(), "ab")).toBeNull()
    expect(typeaheadKey(typed("v", { metaKey: true }), "ab")).toBeNull()
    expect(typeaheadKey(typed("t", { altKey: true }), "ab")).toBeNull()
    expect(typeaheadKey(typed("a", { isComposing: true }), "")).toBeNull()
  })
})

describe("the palette's list by keyboard while the field keeps focus (#106)", () => {
  const list = { count: 4, active: 1, query: "", step: "entries" as const }
  const press = (key: string, extra: { shiftKey?: boolean; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; isComposing?: boolean } = {}) => ({ key, shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, isComposing: false, ...extra })

  it("moves the active option with the arrows, wrapping at either end", () => {
    expect(paletteListKey(press("ArrowDown"), list)).toEqual({ type: "active", index: 2 })
    expect(paletteListKey(press("ArrowUp"), list)).toEqual({ type: "active", index: 0 })
    expect(paletteListKey(press("ArrowDown"), { ...list, active: 3 })).toEqual({ type: "active", index: 0 })
    expect(paletteListKey(press("ArrowUp"), { ...list, active: 0 })).toEqual({ type: "active", index: 3 })
  })

  it("jumps to the first and last option with Home and End", () => {
    expect(paletteListKey(press("Home"), list)).toEqual({ type: "active", index: 0 })
    expect(paletteListKey(press("End"), list)).toEqual({ type: "active", index: 3 })
  })

  it("runs the active option on Enter, and does nothing when nothing matches", () => {
    expect(paletteListKey(press("Enter"), list)).toEqual({ type: "run" })
    expect(paletteListKey(press("Enter"), { ...list, count: 0, active: 0 })).toBeNull()
    expect(paletteListKey(press("ArrowDown"), { ...list, count: 0, active: 0 })).toBeNull()
  })

  it("goes back from the priority step on Esc, or Backspace in an empty box", () => {
    const priority = { ...list, step: "priority" as const }
    expect(paletteListKey(press("Escape"), priority)).toEqual({ type: "back" })
    expect(paletteListKey(press("Backspace"), priority)).toEqual({ type: "back" })
    expect(paletteListKey(press("Backspace"), { ...priority, query: "hi" })).toBeNull()
  })

  it("leaves Esc to the dialog (it closes) and Backspace to the field on the first step", () => {
    expect(paletteListKey(press("Escape"), list)).toBeNull()
    expect(paletteListKey(press("Backspace"), list)).toBeNull()
  })

  it("leaves text keys, selection with Shift and an input method's keys to the field", () => {
    expect(paletteListKey(press("a"), list)).toBeNull()
    expect(paletteListKey(press("Home", { shiftKey: true }), list)).toBeNull()
    expect(paletteListKey(press("Enter", { isComposing: true }), list)).toBeNull()
  })
})
