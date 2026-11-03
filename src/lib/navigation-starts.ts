/**
 * #268 (A11): App Router page changes as they start (src/instrumentation-client.ts reports them), so the command
 * palette can tell a page change started while it is open from one that was already on its way. Browser-only and
 * tiny: it is on every page.
 */
let pending: string | null = null
const listeners = new Set<() => void>()
const addressOf = (url: URL | Location) => url.pathname + url.search

/** Next.js calls it as each push, replace, Back or Forward starts. */
export function noteNavigationStart(url: string) {
  pending = addressOf(new URL(url, location.href))
  listeners.forEach(listener => listener())
}

/** Whether a page change has started and not landed yet. */
export const navigationInFlight = () => pending !== null && pending !== addressOf(location)

/** A page landed (it may have been sent on elsewhere): nothing is on its way. */
export function navigationLanded() { pending = null }

/** Calls back as a page change starts; returns the stop. */
export function onNavigationStart(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
