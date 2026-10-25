/**
 * The journey module's database half: the SQL condition for each journey status and for "Due soon or overdue",
 * plus the Requester and "Closed without a result" reads, so list filters, search and the Inbox's reads run in the database. These are the only status conditions in Lane; never write another.
 * `request-journey-sql.test.ts` proves each one selects exactly the Requests `journeyStatus` / `dueSignal`
 * put there. Server-only (it pulls in the Drizzle schema); the pure mapping is `request-journey.ts`.
 *
 * Use with any query on `requests`: `db.select().from(requests).where(and(seeable(auth), journeyStatusCondition("measuring")))`.
 */
import { and, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm"
import { requests } from "@/db/schema/requests"
import { DUE_SOON_DAYS, type JourneyStatus } from "./request-journey"
import { utcDay } from "./utc-day"

// A voided release is stored as JSON null, so "released" means the release is an object.
const released = sql`jsonb_typeof(${requests.releaseState}->'release') = 'object'`
const notReleased = sql`coalesce(jsonb_typeof(${requests.releaseState}->'release'), 'null') <> 'object'`
const closed = or(isNotNull(requests.outcomeClosure), isNotNull(requests.exceptionClosure))!
const notClosed = and(isNull(requests.outcomeClosure), isNull(requests.exceptionClosure))!
const measuring = and(notClosed, sql`${requests.status} = 'done'`, released)!

/** Requests in this journey status. "closed" includes Closed without a result. */
export function journeyStatusCondition(status: JourneyStatus): SQL {
  switch (status) {
    case "open": return and(notClosed, sql`${requests.status} = 'open'`)!
    case "in_progress": return and(notClosed, sql`${requests.status} = 'in_progress'`)!
    case "done": return and(notClosed, sql`${requests.status} = 'done'`, notReleased)!
    case "measuring": return measuring
    case "closed": return closed
  }
}

/** Each Request's journey status as a column, built from the conditions above: for grouping and counting in SQL (search facets). */
export const journeyStatusColumn = sql<JourneyStatus>`case
  when ${journeyStatusCondition("closed")} then 'closed'
  when ${journeyStatusCondition("measuring")} then 'measuring'
  when ${journeyStatusCondition("done")} then 'done'
  when ${journeyStatusCondition("in_progress")} then 'in_progress'
  else 'open' end`

/** Closed without a result, as `journeyStatus` reads it: a no-result closure and no measured one. */
export const closedWithoutResultCondition: SQL = and(isNull(requests.outcomeClosure), isNotNull(requests.exceptionClosure))!

/** Each Request's current Requester as a column: the database twin of `requesterOf` (the release record's, else the creator). */
export const requesterColumn = sql<string>`coalesce(${requests.releaseState}->>'ownerId', ${requests.createdBy})`

/** Measuring Requests due within `DUE_SOON_DAYS`, due today or overdue, on `now`'s UTC date (the row tag's rule). */
export function dueSoonOrOverdueCondition(now: Date): SQL {
  const today = utcDay(now)
  return and(measuring, sql`(${requests.releaseState}->'release'->>'dueDate')::date <= ${today}::date + ${DUE_SOON_DAYS}::integer`)!
}
