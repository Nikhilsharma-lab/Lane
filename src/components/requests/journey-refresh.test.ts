import { afterEach, expect, it, vi } from "vitest"
import { createJourneyRefresh, watchJourneyDate } from "./journey-refresh"

function pending<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

it("a newer refresh wins over an older initial response", async () => {
  const initial = pending<string>(), retry = pending<string>()
  const reads = [initial, retry]
  const shown: string[] = []
  const refresh = createJourneyRefresh({ read: () => reads.shift()!.promise, show: value => shown.push(value) })
  refresh.activate()
  const first = refresh.refresh()
  const second = refresh.refresh()
  retry.resolve("current revision")
  expect(await second).toBe(true)
  initial.resolve("old revision")
  expect(await first).toBe(false)
  expect(shown).toEqual(["current revision"])
})

it("opening a form discards an in-flight background answer and refreshes once after cancel", async () => {
  const background = pending<string>()
  const shown: string[] = []
  let reads = 0
  const refresh = createJourneyRefresh({ read: () => ++reads === 1 ? background.promise : Promise.resolve("after cancel"), show: value => shown.push(value) })
  refresh.activate()
  const old = refresh.refresh()
  refresh.openForm()
  background.resolve("would remove the form")
  expect(await old).toBe(false)
  await refresh.refresh() // focus/midnight/revision while editing
  expect(reads).toBe(1)
  expect(shown).toEqual([])
  await refresh.closeForm()
  expect(shown).toEqual(["after cancel"])
  expect(reads).toBe(2)
})

it("leaving a Request invalidates success and failure, including the post-save focus signal", async () => {
  for (const answer of ["saved", "failed"]) {
    const response = pending<string>()
    const shown: string[] = []
    const refresh = createJourneyRefresh({ read: () => response.promise, show: value => shown.push(value) })
    refresh.activate()
    refresh.openForm()
    let focused = 0
    const saved = refresh.saved(() => { focused++ })
    refresh.dispose()
    response.resolve(answer)
    expect(await saved).toBe(false)
    expect(shown).toEqual([])
    expect(focused).toBe(0)
    expect(await refresh.refresh()).toBe(false)
  }
})

it("saving closes the form and consumes deferred work in one current read", async () => {
  const shown: string[] = []
  let reads = 0
  const refresh = createJourneyRefresh({ read: async () => `saved ${++reads}`, show: value => shown.push(value) })
  refresh.activate()
  refresh.openForm()
  await refresh.refresh()
  expect(await refresh.saved()).toBe(true)
  await refresh.closeForm()
  expect(shown).toEqual(["saved 1"])
})


afterEach(() => vi.useRealTimers())
it("a midnight refresh deferred by a form runs on cancel, with no polling", async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-24T23:59:59Z"))
  const browser = new EventTarget()
  const shown: string[] = []
  const refresh = createJourneyRefresh({ read: async () => "fresh server day", show: value => shown.push(value) })
  refresh.activate()
  const stop = watchJourneyDate("2026-10-24", () => { void refresh.refresh() }, browser)
  refresh.openForm()
  await vi.advanceTimersByTimeAsync(1000)
  expect(shown).toEqual([])
  await refresh.closeForm()
  expect(shown).toEqual(["fresh server day"])
  await vi.advanceTimersByTimeAsync(60_000)
  expect(shown).toHaveLength(1)
  browser.dispatchEvent(new Event("focus"))
  await Promise.resolve()
  expect(shown).toHaveLength(2)
  stop()
  browser.dispatchEvent(new Event("focus"))
  await vi.advanceTimersByTimeAsync(86_400_000)
  expect(shown).toHaveLength(2)
})

it("a revision refresh superseding the post-save read still returns focus in the current scope", async () => {
  const save = pending<string>(), revision = pending<string>()
  const reads = [save, revision]
  const shown: string[] = []
  let focused = 0
  const refresh = createJourneyRefresh({ read: () => reads.shift()!.promise, show: value => shown.push(value) })
  refresh.activate()
  refresh.openForm()
  const saved = refresh.saved(() => { focused++ })
  const newer = refresh.refresh()
  save.resolve("superseded save response")
  await saved
  expect(focused).toBe(0)
  revision.resolve("current saved revision")
  await newer
  expect(shown).toEqual(["current saved revision"])
  expect(focused).toBe(1)
})


it("an obsolete error cannot replace a newer view, including after Strict Mode effect restart", async () => {
  const old = pending<{ error: string }>()
  const shown: unknown[] = []
  let reads = 0
  const refresh = createJourneyRefresh<{ error: string } | { revision: number }>({ read: () => ++reads === 1 ? old.promise : Promise.resolve({ revision: 42 }), show: value => shown.push(value) })
  refresh.activate()
  const initial = refresh.refresh()
  refresh.dispose()
  refresh.activate()
  await refresh.refresh()
  old.resolve({ error: "stale failure" })
  expect(await initial).toBe(false)
  expect(shown).toEqual([{ revision: 42 }])
})

it("opening another form cancels a pending save's focus and protects its draft", async () => {
  const old = pending<string>()
  let focused = 0
  const shown: string[] = []
  const refresh = createJourneyRefresh({ read: () => old.promise, show: value => shown.push(value) })
  refresh.activate()
  const save = refresh.saved(() => { focused++ })
  refresh.openForm()
  old.resolve("saved")
  await save
  expect(shown).toEqual([])
  expect(focused).toBe(0)
  await refresh.closeForm()
  expect(shown).toEqual(["saved"])
  expect(focused).toBe(0)
})
