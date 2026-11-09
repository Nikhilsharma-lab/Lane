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
    reload: refresh,
  }
}

/** The viewer's calendar day ("2026-10-25"), in their own zone: the day the Journey's countdown counts from. */
export function viewerToday(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The next midnight in the viewer's own zone, as an instant. */
function nextLocalMidnight(now: number) {
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  return midnight.getTime()
}

/**
 * Refresh when the viewer's day turns (their local midnight, so the countdown counts their day) and when the server's
 * does (the next UTC day after `today`, when the server may open Close Request). Each fires once for this server day:
 * a same-day response doesn't poll. Keep watching while a form is open: the coordinator defers until it closes.
 */
export function watchJourneyDate(today: string, refresh: () => void, browser: EventTarget = window) {
  const now = Date.now()
  const moments = new Set([nextLocalMidnight(now), (dayNumber(today) + 1) * DAY_MS])
  const timers = [...moments].map(at => setTimeout(refresh, Math.max(1000, at - now)))
  browser.addEventListener("focus", refresh)
  return () => { timers.forEach(clearTimeout); browser.removeEventListener("focus", refresh) }
}
