import { describe, expect, it } from "vitest"
import { printInLight } from "./print-in-light"

// #209: the Outcome report prints dark text on light paper, whatever theme the reader uses on screen.

function fakeWindow(dark: boolean) {
  const classes = new Set(dark ? ["dark"] : [])
  const style = { colorScheme: dark ? "dark" : "" }
  const root = { classList: { contains: (name: string) => classes.has(name), add: (name: string) => void classes.add(name), remove: (name: string) => void classes.delete(name) }, style }
  const events = new EventTarget()
  const target = Object.assign(events, { document: { documentElement: root } }) as unknown as Window
  const fire = (type: "beforeprint" | "afterprint") => events.dispatchEvent(new Event(type))
  return { target, fire, isDark: () => classes.has("dark"), scheme: () => style.colorScheme }
}

describe("printing in light", () => {
  it("prints a dark theme as light, and puts the dark theme back afterwards", () => {
    const page = fakeWindow(true)
    printInLight(page.target)
    page.fire("beforeprint")
    expect([page.isDark(), page.scheme()]).toEqual([false, "light"])
    page.fire("afterprint")
    expect([page.isDark(), page.scheme()]).toEqual([true, "dark"])
  })

  it("leaves a light theme as it is", () => {
    const page = fakeWindow(false)
    printInLight(page.target)
    page.fire("beforeprint")
    page.fire("afterprint")
    expect([page.isDark(), page.scheme()]).toEqual([false, ""])
  })

  it("restores the theme and stops listening when the report closes mid-print", () => {
    const page = fakeWindow(true)
    const stop = printInLight(page.target)
    page.fire("beforeprint")
    stop()
    expect(page.isDark()).toBe(true)
    page.fire("beforeprint")
    expect(page.isDark()).toBe(true)
  })
})
