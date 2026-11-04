import { describe, expect, it } from "vitest"
import { createPopupEntry, type PopupEntryEnvironment } from "./popup-history"

/** A tab's history as a browser keeps it: push drops the forward entries, back is asynchronous and ends in popstate. */
function tab() {
  const entries: unknown[] = [{ page: "/requests/a" }]
  const addresses = ["/requests/a"]
  let index = 0
  const listeners = new Set<() => void>()
  const tasks: (() => void)[] = []
  let navigating = false
  const environment: PopupEntryEnvironment = {
    history: {
      get state() { return entries[index] },
      pushState(state: unknown) { entries.splice(index + 1); addresses.splice(index + 1); entries.push(state); addresses.push(addresses[index]); index += 1 },
      replaceState(state: unknown) { entries[index] = state },
      back() { tasks.push(() => { if (index === 0) return; index -= 1; listeners.forEach(listener => listener()) }) },
    },
    onPopState(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    defer(task) { tasks.push(task) },
    navigatedWithin: () => navigating,
    address: () => addresses[index],
  }
  return {
    environment,
    /** Runs the oldest queued task (a timer or a history traversal). */
    runNext() { tasks.shift()?.() },
    /** Runs everything queued (timers and history traversals) until nothing is left. */
    settle() { while (tasks.length) tasks.shift()!() },
    /** The person presses the browser's or phone's Back. */
    pressBack() { environment.history.back(); this.settle() },
    navigate() { navigating = true },
    get entries() { return entries.slice() },
    get index() { return index },
  }
}

describe("a phone panel's history entry", () => {
  it("adds one entry while open, so Back closes the panel and stays on the page", () => {
    const browser = tab()
    const hold = createPopupEntry("panel", browser.environment)
    let closedByBack = 0
    const release = hold(() => { closedByBack += 1 })
    expect(browser.entries).toHaveLength(2)
    browser.pressBack()
    expect(closedByBack).toBe(1)
    release()
    browser.settle()
    expect(browser.index).toBe(0)
    expect(browser.environment.history.state).toEqual({ page: "/requests/a" })
  })

  it("takes its entry back off when the panel closes another way", () => {
    const browser = tab()
    const release = createPopupEntry("panel", browser.environment)(() => {})
    release()
    browser.settle()
    expect(browser.index).toBe(0)
  })

  it("keeps one entry, and the panel open, when its effect runs again at once (React's Strict Mode, a remount)", () => {
    const browser = tab()
    const hold = createPopupEntry("panel", browser.environment)
    let closedByBack = 0
    const first = hold(() => { closedByBack += 1 })
    first()
    hold(() => { closedByBack += 1 })
    browser.settle()
    // The released run's step back must not land: that popped the live entry and closed the panel ("Is it live?" on a
    // phone vanished as it opened) and left a stray entry that turned the next Back into a no-op.
    expect(closedByBack).toBe(0)
    expect(browser.entries).toHaveLength(2)
    expect(browser.index).toBe(1)
    // One Back closes it; the next leaves the page.
    browser.pressBack()
    expect(closedByBack).toBe(1)
  })

  it("keeps one entry when the panel is remounted in the same place as it opens", () => {
    const browser = tab()
    let closedByBack = 0
    createPopupEntry("same-place", browser.environment)(() => {})()
    createPopupEntry("same-place", browser.environment)(() => { closedByBack += 1 })
    browser.settle()
    expect(browser.entries).toHaveLength(2)
    browser.pressBack()
    expect(closedByBack).toBe(1)
  })

  it("opened again while the last close's step back is still on its way, stays open with its own entry", () => {
    const browser = tab()
    const hold = createPopupEntry("panel", browser.environment)
    let closedByBack = 0
    hold(() => {})()
    browser.runNext() // the release's timer: it steps back, and the browser has yet to get there
    hold(() => { closedByBack += 1 })
    browser.settle()
    expect(closedByBack).toBe(0)
    expect(browser.environment.history.state).toEqual({ lanePopup: "panel" })
    browser.pressBack()
    expect(closedByBack).toBe(1)
    expect(browser.environment.history.state).toEqual({ lanePopup: "panel" })
  })

  it("still takes its entry off when Next.js has rewritten that entry's state, dropping the panel's mark", () => {
    const browser = tab()
    const hold = createPopupEntry("panel", browser.environment)
    let closedByBack = 0
    const first = hold(() => { closedByBack += 1 })
    // A navigation's late commit replaces the top entry's state with the router's own (Next.js does this).
    browser.environment.history.replaceState({ router: "/requests/a" }, "")
    first()
    const second = hold(() => { closedByBack += 1 })
    browser.settle()
    expect(browser.entries).toHaveLength(2)
    second()
    browser.settle()
    expect(closedByBack).toBe(0)
    expect(browser.index).toBe(0)
  })

  it("leaves history alone when it closes with a move to another page, the entry becoming the page's own", () => {
    const browser = tab()
    const release = createPopupEntry("panel", browser.environment)(() => {})
    browser.navigate()
    release()
    browser.settle()
    expect(browser.index).toBe(1)
    expect(browser.environment.history.state).toEqual({ page: "/requests/a" })
  })
})
