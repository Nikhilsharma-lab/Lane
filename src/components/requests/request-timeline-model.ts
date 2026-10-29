/**
 * What each step of the Request page's timeline says to whoever is looking (#134).
 *
 *   Open → In progress → Done → Measuring → Closed
 *
 * Finished steps say what happened, when and who. The current step says what happens next and who does it.
 * Actions come from the journey module with their reasons, so the page never offers what the server refuses
 * and never hides an action without saying why. Guests follow along without actions. Pure and client-safe.
 */
import { plannedDay } from "@/lib/dates"
import { FORMER_MEMBER, JOURNEY_STATUSES, type Journey, type JourneyAction, type JourneyActions, type JourneyLabel, type JourneyStatus } from "@/lib/request-journey"
import type { RequestStatus } from "@/lib/request-lifecycle"
import { EXCEPTION_REASON_OPTIONS, type ExceptionReason } from "@/lib/request-outcome"
import { releaseMeasurement, type ReleaseEvent, type ReleaseFact } from "@/lib/request-release"

export type TimelineClosure =
  | { kind: "measured"; actorId: string; closedAt: string; release: ReleaseFact }
  | { kind: "exception"; reasonCode: ExceptionReason; reason: string; actorId: string; closedAt: string; release: ReleaseFact | null }

export type TimelineInput = {
  journey: Journey
  /** The saved work status: where a Request closed without a result stopped. */
  workStatus: RequestStatus
  isGuest: boolean
  /** A Viewer (#210): every step reads, and no step offers an action. */
  readOnly?: boolean
  /** The agreed audience a release must reach. */
  audience: string
  requesterName: string
  requestedBy: string
  requestedAt: string
  assigneeName: string | null
  /** When the work was picked up; unknown (null) for work picked up before Lane kept it. */
  pickedUpAt: string | null
  doneAt: string | null
  /** The current release (none once voided). */
  release: ReleaseFact | null
  releaseHistory: Pick<ReleaseEvent, "actorId" | "input">[]
  closure: TimelineClosure | null
  names: Record<string, string>
  /** A measured close needs the agreed Expected impact to measure against. */
  hasAgreedResult: boolean
  actions: JourneyActions
  now: Date
}

/**
 * One line of what happened. A moment stays a moment (`{ at }`), so the page shows it as Lane shows every moment
 * (`LocalTime`): the zone-free day on the server and the first render, then the viewer's zone, with the full date
 * and time on hover (B5). Planned days are already text: the same day for everyone.
 */
export type JourneyLine = (string | { at: string })[]

export type TimelineAction =
  | { action: JourneyAction; label: string; available: true }
  | { action: JourneyAction; label: string; available: false; reason: string; opensOn?: string }

export type TimelineStep = {
  status: JourneyStatus
  label: JourneyLabel
  /** Skipped: the Request closed without a result before reaching this step. */
  state: "finished" | "current" | "upcoming" | "skipped"
  /** What happened, when and who. */
  happened: JourneyLine[]
  /** The current step only: what happens next and who does it. */
  next: string | null
  /** The current Measuring step only. */
  countdown: string | null
  actions: TimelineAction[]
}

export const ACTION_LABELS: Record<JourneyAction, string> = {
  release: "Record release",
  correctRelease: "Correct release",
  voidRelease: "Void incorrect release",
  close: "Close Request",
  closeWithoutResult: "Close without a result…",
  correctClosure: "Add correction",
  handover: "Hand over to a new Requester",
  followUp: "Create follow-up Request",
}

/** Per step, the actions in the order shown. `quiet` ones only appear when available. */
const STEP_ACTIONS: Partial<Record<JourneyStatus, { action: JourneyAction; quiet?: true }[]>> = {
  in_progress: [{ action: "closeWithoutResult" }, { action: "handover", quiet: true }],
  done: [{ action: "release" }, { action: "closeWithoutResult" }, { action: "handover", quiet: true }],
  measuring: [{ action: "close" }, { action: "closeWithoutResult" }, { action: "correctRelease" }, { action: "voidRelease" }, { action: "followUp", quiet: true }, { action: "handover", quiet: true }],
  closed: [{ action: "correctClosure" }, { action: "followUp", quiet: true }, { action: "handover", quiet: true }],
}

const ORDER = JOURNEY_STATUSES.map(s => s.status)

/** Where a Request closed without a result stopped: the last step it reached. */
function stoppedAt(input: TimelineInput): JourneyStatus {
  if (input.closure?.release) return "measuring"
  return input.workStatus === "done" ? "done" : "in_progress"
}

function stepActions(input: TimelineInput, status: JourneyStatus): TimelineAction[] {
  if (input.isGuest || input.readOnly) return []
  const shown: TimelineAction[] = []
  for (const { action, quiet } of STEP_ACTIONS[status] ?? []) {
    let availability = input.actions[action]
    if (action === "close" && availability.allowed && !input.hasAgreedResult)
      availability = { allowed: false, reason: "There is no agreed goal to measure against." }
    const label = ACTION_LABELS[action]
    if (availability.allowed) { shown.push({ action, label, available: true }); continue }
    // One reason is enough: the same refusal twice in a step says nothing new.
    if (quiet || shown.some(a => !a.available && a.reason === availability.reason)) continue
    shown.push({ action, label, available: false, reason: availability.reason, ...(availability.opensOn ? { opensOn: availability.opensOn } : {}) })
  }
  return shown
}

export function timelineSteps(input: TimelineInput): TimelineStep[] {
  const { journey, names } = input
  const current = ORDER.indexOf(journey.status)
  const stop = journey.withoutResult ? ORDER.indexOf(stoppedAt(input)) : -1
  const release = input.release ?? input.closure?.release ?? null
  const day = (iso: string) => ({ at: iso })
  const planned = (day: string) => plannedDay(day, { now: input.now })
  const recordedBy = [...input.releaseHistory].reverse().find(e => e.input.kind === "release" || e.input.kind === "correct")?.actorId

  return JOURNEY_STATUSES.map(({ status, label }, index) => {
    const state: TimelineStep["state"] = index === current ? "current" : index < current ? (stop >= 0 && index > stop ? "skipped" : "finished") : "upcoming"
    const reached = state === "finished" || state === "current"
    const isCurrent = state === "current"
    const happened: JourneyLine[] = []
    let next: string | null = null
    let countdown: string | null = null

    if (status === "open") {
      happened.push([`Requested by ${input.requestedBy} on `, day(input.requestedAt), "."])
      if (isCurrent) next = "Waiting for someone to pick this up. Reviews are optional and never block pickup."
    }
    if (status === "in_progress" && reached) {
      const by = input.assigneeName ? `Picked up by ${input.assigneeName}` : "Picked up"
      happened.push(input.pickedUpAt ? [`${by} on `, day(input.pickedUpAt), "."] : [`${by}.`])
      if (isCurrent) next = `${input.assigneeName ?? "The assignee"} is working on this. Mark Done when the work is finished.`
    }
    if (status === "done" && reached) {
      if (input.doneAt) happened.push(["Marked Done on ", day(input.doneAt), "."])
      if (isCurrent) next = `Record the release once ${input.audience} has the work. Anyone working on this Request can record it.`
    }
    if (status === "measuring" && reached && release) {
      happened.push([`Released to ${release.audience} on ${planned(release.exposureDate)}${recordedBy ? `, recorded by ${names[recordedBy] ?? FORMER_MEMBER}` : ""}.`])
      if (isCurrent) {
        countdown = `Result due ${planned(release.dueDate)} · ${releaseMeasurement(release, input.now)!.label}`
        next = `On ${planned(release.dueDate)} the Requester, ${input.requesterName}, records the measured result and closes this Request.`
      }
    }
    if (status === "closed" && isCurrent && input.closure) {
      const closure = input.closure
      const by = names[closure.actorId] ?? FORMER_MEMBER
      if (closure.kind === "measured") happened.push([`Closed with a measured result by ${by} on `, day(closure.closedAt), "."])
      else {
        const reason = EXCEPTION_REASON_OPTIONS.find(o => o.value === closure.reasonCode)?.label ?? closure.reasonCode
        happened.push([`Closed without a result at ${JOURNEY_STATUSES[stop].label}: ${reason}.`], [`Closed by ${by} on `, day(closure.closedAt), "."])
      }
      next = "Closed Requests never reopen."
    }

    return {
      status, label: status === "closed" ? journey.status === "closed" ? journey.label : label : label,
      state, happened: reached ? happened : [], next, countdown,
      actions: isCurrent ? stepActions(input, status) : [],
    }
  })
}
