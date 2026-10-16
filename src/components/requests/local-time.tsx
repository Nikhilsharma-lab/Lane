"use client"

import { useSyncExternalStore } from "react"

/**
 * Plan item 2.6: a time in the viewer's zone without a hydration mismatch.
 * The server and the hydrating client render the same zone-free day label;
 * once the page is in the browser, the viewer's locale and zone replace it
 * (the mounted pattern of settings/profile/theme-preference.tsx, which
 * re-renders right after hydration). The swap changes the text only: the time
 * sits in a nowrap trailing cell of a fixed-height row, so nothing below it
 * moves.
 */

const subscribe = () => () => {}

/** "Oct 9": identical on the server and in every browser, because the zone is pinned. */
export function utcDayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
}

/** "Oct 9, 3:30 PM" or "9 Oct, 15:30" in the viewer's locale and zone; the year only outside the current one. */
export function localLabel(iso: string, now = new Date()) {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
}

/** The full local date and time, for the title once the page is in the browser. */
export function fullLocal(iso: string) {
  return new Date(iso).toLocaleString()
}

export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  // False on the server and in the hydrating render; true once the page is in the browser.
  const live = useSyncExternalStore(subscribe, () => true, () => false)
  return <time dateTime={iso} className={className} title={live ? fullLocal(iso) : undefined}>{live ? localLabel(iso) : utcDayLabel(iso)}</time>
}
