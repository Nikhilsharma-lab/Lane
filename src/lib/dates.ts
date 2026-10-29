/**
 * Lane's one date format (polish bar §12, #261). Every date on screen and in messages comes from here. Pure and
 * browser-safe. The order is fixed day-month English whatever the browser's language, so everyone sees the same text.
 *
 * Two kinds of value, so callers can't mix them up:
 * - A **moment** (a `Date` or saved ISO text): when something happened. It is read in the viewer's time zone (pass
 *   `timeZone` only for fixtures and zone-free renders). "Just now", "5m ago", "3h ago", then "24 Oct" this year and
 *   "24 Oct 2025" before; `time: true` adds ", 14:30" (24-hour) to a day; `momentTitle` is the full hover text.
 * - A **planned day** ("YYYY-MM-DD"): a calendar day such as a release or measuring date. The same day for everyone,
 *   never with a time or a zone.
 *
 * The server and the hydrating render can't know the viewer's zone, so they show `zoneFreeDay`; `LocalTime`
 * (`src/components/requests/local-time.tsx`) swaps in the viewer's zone once the page is in the browser. Emails have no
 * viewer zone either, so they show a moment with `momentDay` and no time. Day counting (due dates, reminders) is
 * `utc-day.ts`, not a display format.
 */

export type Moment = Date | string
/** A calendar day, "YYYY-MM-DD". */
export type PlannedDay = string

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

type Parts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number }

const formatters = new Map<string, Intl.DateTimeFormat>()
/** One formatter per zone (undefined: the runtime's, which in the browser is the viewer's), for numbers only. */
function formatter(timeZone: string | undefined) {
  const key = timeZone ?? ""
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23" })
    formatters.set(key, format)
  }
  return format
}

function partsOf(at: Date, timeZone: string | undefined): Parts {
  const found = formatter(timeZone).formatToParts(at)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(found.find(part => part.type === type)?.value)
  const [year, month, day] = [value("year"), value("month"), value("day")]
  return { year, month, day, hour: value("hour") % 24, minute: value("minute"), weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() }
}

const toDate = (at: Moment) => at instanceof Date ? at : new Date(at)
const pad = (n: number) => String(n).padStart(2, "0")
const dayText = (day: number, month: number, year: number | null) => `${day} ${MONTHS[month - 1]}${year === null ? "" : ` ${year}`}`

type MomentOptions = { now?: Date; timeZone?: string }

/** A moment's day: "24 Oct" this year, "24 Oct 2025" before. Never an age, so it reads in a sentence ("on 24 Oct"). */
export function momentDay(at: Moment, { now = new Date(), timeZone, year = true, time = false }: MomentOptions & { year?: boolean; time?: boolean } = {}): string {
  const parts = partsOf(toDate(at), timeZone)
  const showYear = year && parts.year !== partsOf(now, timeZone).year
  const day = dayText(parts.day, parts.month, showYear ? parts.year : null)
  return time ? `${day}, ${pad(parts.hour)}:${pad(parts.minute)}` : day
}

/**
 * A moment as Lane shows it: its age for the last day ("Just now", "5m ago", "3h ago"), then its day. `time` adds the
 * 24-hour time to a day, and `year: false` leaves the year off for a cell too narrow for it.
 */
export function momentLabel(at: Moment, options: MomentOptions & { time?: boolean; year?: boolean } = {}): string {
  const now = options.now ?? new Date()
  const age = now.getTime() - toDate(at).getTime()
  if (age < MINUTE) return "Just now"
  if (age < HOUR) return `${Math.floor(age / MINUTE)}m ago`
  if (age < DAY) return `${Math.floor(age / HOUR)}h ago`
  return momentDay(at, { ...options, now })
}

/** The full date and time for hover text: "Tuesday 20 October 2026, 00:30", in the viewer's zone. */
export function momentTitle(at: Moment, { timeZone }: { timeZone?: string } = {}): string {
  const parts = partsOf(toDate(at), timeZone)
  return `${WEEKDAYS[parts.weekday]} ${parts.day} ${LONG_MONTHS[parts.month - 1]} ${parts.year}, ${pad(parts.hour)}:${pad(parts.minute)}`
}

/** A moment's day before the viewer's zone is known (the server and the hydrating render): the same text everywhere. */
export function zoneFreeDay(at: Moment, { now = new Date(), year = true }: { now?: Date; year?: boolean } = {}): string {
  return momentDay(at, { now, timeZone: "UTC", year })
}

/** A planned day: "24 Oct" this year, "24 Oct 2025" in any other. The same day for everyone, never with a time or a zone. */
export function plannedDay(day: PlannedDay, { now = new Date() }: { now?: Date } = {}): string {
  const [year, month, date] = day.slice(0, 10).split("-").map(Number)
  return dayText(date, month, year === now.getUTCFullYear() ? null : year)
}
