/**
 * The Request journey: the one place that turns a Request's saved facts into what people see and may do.
 *
 *   Open → In progress → Done → Measuring → Closed   ("Closed without a result" is a form of Closed)
 *
 * The journey status is derived, never stored. The saved work status (open / in_progress / done), the
 * release record and the closure records stay as they are; everything else (list, board, peek, Request page,
 * filters, reminders) reads this module and never re-derives status itself. Vocabulary: GLOSSARY.md.
 *
 * This file is pure and client-safe. Its database twin, the list filter conditions, lives in
 * `request-journey-sql.ts` and is proven against the same mapping.
 */
import type { RequestStatus } from "./request-lifecycle"
import { releaseMeasurement, releaseOwner, type ReleaseState } from "./request-release"

export type JourneyStatus = "open" | "in_progress" | "done" | "measuring" | "closed"
export type JourneyLabel = "Open" | "In progress" | "Done" | "Measuring" | "Closed" | "Closed without a result"

/** The five steps in journey order, with their glossary labels. Use this for filters, columns and pills. */
export const JOURNEY_STATUSES: readonly { status: JourneyStatus; label: JourneyLabel }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In progress" },
  { status: "done", label: "Done" },
  { status: "measuring", label: "Measuring" },
  { status: "closed", label: "Closed" },
]

/** The saved facts the journey status is derived from. Pass the Request row (or a row-shaped subset). */
export type JourneyFacts = {
  status: RequestStatus
  releaseState: ReleaseState | null
  outcomeClosure: unknown
  exceptionClosure: unknown
}

export type Journey = {
  status: JourneyStatus
  /** The words to show. A no-result closure reads "Closed without a result" everywhere. */
  label: JourneyLabel
  /** Closed without a measured result (status is "closed"). */
  withoutResult: boolean
}

/**
 * A Request's one status. Closure wins over everything; a release only counts once work is Done
 * (the database forbids it earlier); a voided release is no release, so the Request is back at Done.
 */
export function journeyStatus(facts: JourneyFacts): Journey {
  if (facts.outcomeClosure) return { status: "closed", label: "Closed", withoutResult: false }
  if (facts.exceptionClosure) return { status: "closed", label: "Closed without a result", withoutResult: true }
  if (facts.status === "done") {
    return facts.releaseState?.release
      ? { status: "measuring", label: "Measuring", withoutResult: false }
      : { status: "done", label: "Done", withoutResult: false }
  }
  return facts.status === "open"
    ? { status: "open", label: "Open", withoutResult: false }
    : { status: "in_progress", label: "In progress", withoutResult: false }
}

/** How many days before the measurement due date a Request counts as "due soon" (row tag, filter, reminder). */
export const DUE_SOON_DAYS = 3

/**
 * The row's due tag. Only a Measuring Request has one. `days` is whole UTC days to (or past) the due date,
 * the same count as `releaseMeasurement`, so the tag and the countdown always agree. Overdue is neutral copy;
 * surfaces render every kind in the same warning tone, never an error tone.
 */
export type DueSignal =
  | { kind: "none" }
  | { kind: "due_soon"; days: number; label: string }
  | { kind: "due_today"; days: 0; label: "Due today" }
  | { kind: "overdue"; days: number; label: string }

const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`

export function dueSignal(facts: JourneyFacts, now: Date): DueSignal {
  const release = facts.releaseState?.release
  if (!release || journeyStatus(facts).status !== "measuring") return { kind: "none" }
  const days = releaseMeasurement(release, now)!.days
  if (days === 0) return { kind: "due_today", days: 0, label: "Due today" }
  if (days < 0) return { kind: "overdue", days: -days, label: `Overdue ${plural(-days)}` }
  return days <= DUE_SOON_DAYS ? { kind: "due_soon", days, label: `Due in ${plural(days)}` } : { kind: "none" }
}

/** The person who closes. Read through the release record, which holds the current Requester and its handovers. */
export function requesterOf(facts: { createdBy: string; releaseState: ReleaseState | null }): string {
  return releaseOwner(facts)
}

/** Who is looking. Take `role` and `active` from the live workspace roster, never from the client. */
export type JourneyViewer = {
  id: string
  role: "admin" | "member" | "guest"
  /** An active member of the workspace right now. False when access ended (or the roster can't be read). */
  active: boolean
}

/** What the reasons need to say about the Requester. */
export type JourneyPeople = {
  /** Shown in reasons: "Only the Requester, <name>, can close this." Use "Former member" if unknown. */
  requesterName: string
  /** Whether the current Requester is still an active non-guest member. Handover needs this to be false. */
  requesterActive: boolean
}

export type JourneyAction =
  | "release" | "correctRelease" | "voidRelease"
  | "close" | "closeWithoutResult" | "correctClosure"
  | "handover" | "followUp"

/**
 * Whether the viewer may take an action now and, when not, why in words to show beside it.
 * `opensOn` (UTC date) is set when the only thing missing is time, so a surface can render the date itself.
 */
export type ActionAvailability = { allowed: true } | { allowed: false; reason: string; opensOn?: string }

export type JourneyActions = Record<JourneyAction, ActionAvailability>

const ALLOWED = { allowed: true } as const
const refuse = (reason: string): ActionAvailability => ({ allowed: false, reason })
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** "28 Oct 2026" for a UTC date, the same on server and client. */
export function journeyDate(day: string): string {
  const [year, month, date] = day.split("-").map(Number)
  return `${date} ${MONTHS[month - 1]} ${year}`
}

/** The release the work reached at some point: the current one, or the one recorded on its closure. */
function releasedOnce(facts: JourneyFacts) {
  if (facts.releaseState?.release) return true
  const closure = (facts.outcomeClosure ?? facts.exceptionClosure) as { release?: unknown } | null | undefined
  return Boolean(closure?.release)
}

/**
 * Every journey action for this viewer, each allowed or refused with its reason. Server actions must refuse
 * exactly what this refuses, so the UI never offers what the server would turn down.
 *
 * Rules: release, correct and void by any active non-guest member while Done or Measuring and not closed;
 * close, close without a result and corrections by the Requester only; handover by an admin from In progress
 * onwards when the Requester has lost access; a follow-up by any active member once the work was released.
 */
export function journeyActions(facts: JourneyFacts & { createdBy: string }, viewer: JourneyViewer, people: JourneyPeople, now: Date): JourneyActions {
  const everything = (reason: string): JourneyActions => ({
    release: refuse(reason), correctRelease: refuse(reason), voidRelease: refuse(reason),
    close: refuse(reason), closeWithoutResult: refuse(reason), correctClosure: refuse(reason),
    handover: refuse(reason), followUp: refuse(reason),
  })
  if (viewer.role === "guest") return everything("Guests can follow this Request but can’t change it.")
  if (!viewer.active) return everything("Your workspace membership is no longer active.")

  const { status } = journeyStatus(facts)
  const isRequester = requesterOf(facts) === viewer.id
  const notRequester = (what: string) => refuse(`Only the Requester, ${people.requesterName}, can ${what}.`)
  const closedReason = refuse("This Request is closed.")
  const beforeDone = status === "open" || status === "in_progress"

  const releaseAction = (needsRelease: boolean, missing: string): ActionAvailability => {
    if (status === "closed") return closedReason
    if (beforeDone) return refuse("Opens once the work is Done.")
    if (needsRelease !== (status === "measuring")) return refuse(missing)
    return ALLOWED
  }

  const close = (): ActionAvailability => {
    if (status === "closed") return closedReason
    if (!isRequester) return notRequester("close this")
    if (status !== "measuring") return refuse("Opens once the release is recorded and the result is due.")
    const dueDate = facts.releaseState!.release!.dueDate
    if (releaseMeasurement(facts.releaseState!.release, now)!.days > 0) return { allowed: false, reason: `Opens on ${journeyDate(dueDate)}.`, opensOn: dueDate }
    return ALLOWED
  }

  const closeWithoutResult = (): ActionAvailability => {
    if (status === "closed") return closedReason
    if (!isRequester) return notRequester("close this")
    return status === "open" ? refuse("Opens once the work is picked up.") : ALLOWED
  }

  const correctClosure = (): ActionAvailability => {
    if (status !== "closed") return refuse("Corrections open once the Request is closed.")
    return isRequester ? ALLOWED : notRequester("add a correction")
  }

  const handover = (): ActionAvailability => {
    if (viewer.role !== "admin") return refuse("Only a workspace admin can hand this over.")
    if (status === "open") return refuse("Handover opens once the work is picked up.")
    if (people.requesterActive) return refuse(`${people.requesterName} still has workspace access.`)
    return ALLOWED
  }

  return {
    release: releaseAction(false, "The release is already recorded."),
    correctRelease: releaseAction(true, "There is no release to correct yet."),
    voidRelease: releaseAction(true, "There is no release to void yet."),
    close: close(),
    closeWithoutResult: closeWithoutResult(),
    correctClosure: correctClosure(),
    handover: handover(),
    followUp: releasedOnce(facts) ? ALLOWED : refuse("Opens once the work is released."),
  }
}

/** Bell reminder kinds. Names match the notification types the migration adds. */
export type ReminderKind = "release_reminder" | "result_due_soon" | "result_due" | "result_overdue"

/** Default timings (spec defaults, open to change at review). */
export const REMINDER_TIMINGS = {
  /** First release reminder this many days after Done. */
  releaseAfterDoneDays: 3,
  /** Release and overdue reminders repeat this often while still owed. */
  repeatEveryDays: 7,
} as const

/**
 * One reminder a Request owes on a date. `day` is the UTC date the reminder was scheduled for: write it at
 * most once per (Request, recipient, kind, day). A recurring reminder keeps the same `day` until its next
 * occurrence, so someone who opens Lane later that week still gets it once, exactly as a daily job would.
 */
export type DueReminder = { kind: ReminderKind; recipientId: string; day: string }

const DAY_MS = 86_400_000
const utcDay = (date: Date) => date.toISOString().slice(0, 10)
const dayNumber = (day: string) => Date.parse(day + "T00:00:00Z") / DAY_MS
const dayOf = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10)
/** The latest occurrence on or before `today` of a reminder first due on `first`, repeating every `every` days. */
const occurrence = (first: number, today: number, every: number) => dayOf(first + Math.floor((today - first) / every) * every)

/**
 * Which reminders this Request owes on `now`'s UTC date, and to whom.
 *
 * - release reminder → the assignee (who picked it up; Lane doesn't store who marked Done), while Done
 * - result due soon / due / overdue → the current Requester, while Measuring
 *
 * Nothing after closure. Nothing once a release has been voided: the result reminders follow the current
 * release (so they resume if the work is released again) and the release reminder does not come back.
 * Recipients must be in `activeMembers`: pass active non-guest member ids only, so guests and people whose
 * access ended (a former Requester included) never receive one. `doneAt` is when the work was marked Done.
 */
export function remindersDue(
  facts: JourneyFacts & { createdBy: string; assignedTo: string | null; doneAt: Date | null },
  now: Date,
  activeMembers: ReadonlySet<string>,
): DueReminder[] {
  const status = journeyStatus(facts).status
  const today = dayNumber(utcDay(now))
  const reminders: DueReminder[] = []
  const { releaseAfterDoneDays, repeatEveryDays } = REMINDER_TIMINGS

  if (status === "done" && facts.assignedTo && facts.doneAt) {
    const voided = facts.releaseState?.history.some(event => event.input.kind === "void")
    const first = dayNumber(utcDay(facts.doneAt)) + releaseAfterDoneDays
    if (!voided && today >= first) reminders.push({ kind: "release_reminder", recipientId: facts.assignedTo, day: occurrence(first, today, repeatEveryDays) })
  }

  if (status === "measuring") {
    const due = dayNumber(facts.releaseState!.release!.dueDate)
    const recipientId = requesterOf(facts)
    if (today > due) reminders.push({ kind: "result_overdue", recipientId, day: occurrence(due + 1, today, repeatEveryDays) })
    else if (today === due) reminders.push({ kind: "result_due", recipientId, day: dayOf(due) })
    else if (today >= due - DUE_SOON_DAYS) reminders.push({ kind: "result_due_soon", recipientId, day: dayOf(due - DUE_SOON_DAYS) })
  }

  return reminders.filter(reminder => activeMembers.has(reminder.recipientId))
}
