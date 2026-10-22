import { describe, expect, it, vi } from "vitest"
import { createPaletteFocus } from "./command-palette-focus"

type Fake = { name: string; shown: boolean; focus: ReturnType<typeof vi.fn<(options?: FocusOptions) => void>> }
const element = (name: string, shown = true): Fake => ({ name, shown, focus: vi.fn<(options?: FocusOptions) => void>() })

function palette(pressedOn: Fake | null) {
  const returnFocus = { current: pressedOn as Fake | null }
  const focus = createPaletteFocus(returnFocus, (target): target is Fake => target !== null && target.shown)
  const field = element("field")
  return { focus, field, returnFocus }
}

describe("where focus goes as the palette opens and closes (#106)", () => {
  it("puts focus in its field when it opens", () => {
    const { focus, field } = palette(element("row"))
    focus.opened(field)
    expect(field.focus).toHaveBeenCalledOnce()
  })

  it("returns focus to where ⌘K was pressed when it closes (Esc, a second ⌘K, a click outside)", () => {
    const row = element("row")
    const { focus, field, returnFocus } = palette(row)
    focus.opened(field)
    expect(focus.closed()).toBe(true)
    expect(row.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(returnFocus.current).toBeNull()
  })

  it("leaves focus to the dialog when that element is gone or hidden", () => {
    const { focus, field } = palette(element("row", false))
    focus.opened(field)
    expect(focus.closed()).toBe(false)
  })

  it("closes and returns focus before an entry runs, so what it opens hands focus back there", () => {
    const row = element("row")
    const { focus, field } = palette(row)
    focus.opened(field)
    const order: string[] = []
    row.focus.mockImplementation(() => order.push("focus"))
    const target = focus.run(() => order.push("close"))
    expect(order).toEqual(["close", "focus"])
    expect(target).toBe(row)
    // The dialog's own close focus then does nothing: focus is already back, or on what the entry opened.
    expect(focus.closed()).toBe(true)
    expect(row.focus).toHaveBeenCalledOnce()
  })

  it("starts afresh each time it opens", () => {
    const row = element("row")
    const { focus, field, returnFocus } = palette(row)
    focus.opened(field)
    focus.run(() => {})
    focus.closed()
    returnFocus.current = row
    focus.opened(field)
    expect(focus.closed()).toBe(true)
    expect(row.focus).toHaveBeenCalledTimes(2)
  })
})
