/**
 * The viewer's own calendar days, "YYYY-MM-DD", as Arc's date pickers read them: local `Date`s at midnight. Never parse
 * a day with `new Date("YYYY-MM-DD")`, which reads it as UTC. UTC days (the journey's) live in utc-day.ts.
 */

/** `date`'s calendar day in the viewer's time zone. */
export const localDay = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

/** A "YYYY-MM-DD" day as local midnight. */
export function localDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}
