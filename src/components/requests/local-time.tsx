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

/** The year in a zone (the viewer's unless one is given), for the year-only-when-different rule. */
function yearIn(date: Date, timeZone?: string) {
  return Number(date.toLocaleDateString("en-US", { year: "numeric", timeZone }))
}

/** "Oct 9, 3:30 PM" or "9 Oct, 15:30" in the viewer's locale and zone; the year only outside the current one. */
export function localLabel(iso: string, now = new Date(), timeZone?: string) {
  const date = new Date(iso)
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone,
    ...(yearIn(date, timeZone) !== yearIn(now, timeZone) ? { year: "numeric" } : {}),
  })
}

/** Plan item 2.8: "Oct 9" or "9 Oct" on the viewer's calendar, for rows that show the day only; the year only outside
 * the current one, or never with `year: false` (a cell too narrow for it). */
export function localDayLabel(iso: string, now = new Date(), timeZone?: string, { year = true }: { year?: boolean } = {}) {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: "short", day: "numeric", timeZone,
    ...(year && yearIn(date, timeZone) !== yearIn(now, timeZone) ? { year: "numeric" } : {}),
  })
}

/** Critique 2.8: a calendar day (YYYY-MM-DD) in the viewer's locale, "Oct 9, 2026" or "9 Oct 2026". A calendar day
 * has no zone of its own, so UTC keeps it from moving to the day before. Browser-only: the locale is the viewer's. */
export function calendarDayLabel(day: string) {
  return new Date(`${day}T00:00:00.000Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

/** The full local date and time, for the title once the page is in the browser. */
export function fullLocal(iso: string, timeZone?: string) {
  return new Date(iso).toLocaleString(undefined, timeZone ? { timeZone } : undefined)
}

/** False on the server and in the hydrating render; true once the page is in the browser. */
export function useInBrowser() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

/** `day` shows the date only, and `year={false}` drops its year. `timeZone` is for fixtures; the viewer's zone otherwise. */
export function LocalTime({ iso, className, day = false, year = true, timeZone }: { iso: string; className?: string; day?: boolean; year?: boolean; timeZone?: string }) {
  const live = useInBrowser()
  return <time dateTime={iso} className={className} title={live ? fullLocal(iso, timeZone) : undefined}>{live ? day ? localDayLabel(iso, undefined, timeZone, { year }) : localLabel(iso, undefined, timeZone) : utcDayLabel(iso)}</time>
}
