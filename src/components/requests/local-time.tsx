"use client"

import { useSyncExternalStore } from "react"
import { momentDay, momentLabel, momentTitle, zoneFreeDay } from "@/lib/dates"

/**
 * Plan item 2.6: a moment in the viewer's zone without a hydration mismatch.
 * The server and the hydrating client render the same zone-free day; once the
 * page is in the browser, the viewer's zone replaces it (the mounted pattern of
 * settings/profile/theme-preference.tsx, which re-renders right after
 * hydration). The swap changes the text only. The words come from the shared
 * date helper (`src/lib/dates.ts`, #261).
 */

const subscribe = () => () => {}

/** False on the server and in the hydrating render; true once the page is in the browser. */
export function useInBrowser() {
  return useSyncExternalStore(subscribe, () => true, () => false)
}

/**
 * A moment as Lane shows it ("5m ago", "24 Oct"), with its full date and time on hover. `time` adds the 24-hour time
 * to a day ("24 Oct, 14:30"), `day` always shows the day and never an age, for a sentence ("on 24 Oct"), and
 * `year={false}` drops the year in a cell too narrow for it. `timeZone` is for fixtures; the viewer's zone otherwise.
 */
export function LocalTime({ iso, className, time = false, day = false, year = true, timeZone }: { iso: string; className?: string; time?: boolean; day?: boolean; year?: boolean; timeZone?: string }) {
  const live = useInBrowser()
  const label = !live ? zoneFreeDay(iso, { year }) : day ? momentDay(iso, { timeZone, time, year }) : momentLabel(iso, { timeZone, time, year })
  return <time dateTime={iso} className={className} title={live ? momentTitle(iso, { timeZone }) : undefined}>{label}</time>
}
