import { DAY_MS, dayNumber } from "@/lib/utc-day"

/** All reads for one mounted Request/workspace share a generation. The caller
 * turns transport errors into display results, so stale failures lose too. */
export function createJourneyRefresh<T>({ read, show }: { read: () => Promise<T>; show: (value: T) => void }) {
  let generation = 0
  let active = false
  let formOpen = false
  let pending = false
  let deferred = false
  let afterSave: (() => void) | undefined

  async function refresh() {
    if (!active) return false
    if (formOpen) { deferred = true; return false }
    const current = ++generation
    pending = true
    try {
      const value = await read()
      if (!active || current !== generation) return false
      show(value)
      const focus = afterSave
      afterSave = undefined
      focus?.()
      return true
    } finally { if (current === generation) pending = false }
  }
  return {
    activate() { active = true; generation++ },
    openForm() {
      afterSave = undefined
      formOpen = true
      deferred ||= pending
      generation++
      pending = false
    },
    async closeForm() {
      formOpen = false
      if (!deferred) return false
      deferred = false
      return refresh()
    },
    dispose() { active = false; generation++; pending = false; afterSave = undefined },
    saved(onCurrent?: () => void) { formOpen = false; deferred = false; afterSave = onCurrent; return refresh() },
    refresh,
  }
}

/** One timer for the observed server day; a same-day response doesn't poll.
 * Keep watching while a form is open: the coordinator defers until it closes. */
export function watchJourneyDate(today: string, refresh: () => void, browser: EventTarget = window) {
  const midnight = (dayNumber(today) + 1) * DAY_MS
  const timer = setTimeout(refresh, Math.max(1000, midnight - Date.now()))
  browser.addEventListener("focus", refresh)
  return () => { clearTimeout(timer); browser.removeEventListener("focus", refresh) }
}
