import { afterEach, describe, expect, it, vi } from "vitest"
import { canOpenShellSurface, openShellSurface, registerShellOpener, SHELL_SURFACES, type ShellSurface } from "./shell-openers"

// Issue #102: the palette opens search, the ? overlay, the bell and the composer through one API.
const cleanups: (() => void)[] = []
const register = (...args: Parameters<typeof registerShellOpener>) => { const off = registerShellOpener(...args); cleanups.push(off); return off }
afterEach(() => { while (cleanups.length) cleanups.pop()!() })

describe("shell openers", () => {
  it("names the four surfaces", () => {
    expect([...SHELL_SURFACES]).toEqual(["search", "shortcuts", "notifications", "composer"])
  })

  it.each<ShellSurface>(["search", "shortcuts", "notifications", "composer"])("opens %s through the opener its component registered", surface => {
    const open = vi.fn()
    register(surface, open)
    expect(canOpenShellSurface(surface)).toBe(true)
    expect(openShellSurface(surface)).toBe(true)
    expect(open).toHaveBeenCalledTimes(1)
  })

  it("hands the opener the element focus returns to", () => {
    const open = vi.fn()
    register("composer", open)
    const row = { id: "row" } as unknown as HTMLElement
    openShellSurface("composer", { returnFocus: row })
    expect(open).toHaveBeenCalledWith({ returnFocus: row })
  })

  it("opens only the surface asked for", () => {
    const search = vi.fn(), bell = vi.fn()
    register("search", search)
    register("notifications", bell)
    openShellSurface("notifications")
    expect(bell).toHaveBeenCalledTimes(1)
    expect(search).not.toHaveBeenCalled()
  })

  it("reports a surface that is not mounted, such as the bell on Settings, as unavailable", () => {
    expect(canOpenShellSurface("notifications")).toBe(false)
    expect(openShellSurface("notifications")).toBe(false)
  })

  it("stops opening a surface once its component unmounts", () => {
    const open = vi.fn()
    register("shortcuts", open)()
    expect(canOpenShellSurface("shortcuts")).toBe(false)
    expect(openShellSurface("shortcuts")).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it("keeps the newer opener when an older one unregisters late", () => {
    const older = vi.fn(), newer = vi.fn()
    const offOlder = register("search", older)
    register("search", newer)
    offOlder()
    expect(openShellSurface("search")).toBe(true)
    expect(newer).toHaveBeenCalledTimes(1)
    expect(older).not.toHaveBeenCalled()
  })
})
