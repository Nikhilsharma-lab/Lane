/**
 * UTC calendar days, the one way Lane counts them for the journey (due dates, reminders, "today").
 * A day is a "YYYY-MM-DD" string; day numbers count whole days since 1970-01-01 (UTC). Pure and client-safe.
 */
export const DAY_MS = 86_400_000

/** `date`'s UTC calendar day, "YYYY-MM-DD". */
export const utcDay = (date: Date = new Date()): string => date.toISOString().slice(0, 10)

/** A "YYYY-MM-DD" day as a whole-day number. */
export const dayNumber = (day: string): number => Date.parse(day + "T00:00:00Z") / DAY_MS

/** A whole-day number back to "YYYY-MM-DD". */
export const dayOf = (n: number): string => utcDay(new Date(n * DAY_MS))

/** Whole UTC days from `now`'s date to `day`: positive before it, 0 on it, negative after. */
export const daysUntil = (day: string, now: Date): number => dayNumber(day) - dayNumber(utcDay(now))
