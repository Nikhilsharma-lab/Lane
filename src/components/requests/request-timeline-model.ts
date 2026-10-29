/**
 * What each step of the Request page's timeline says to whoever is looking (#134).
 *
 *   Open → In progress → Done → Measuring → Closed
 *
 * Finished steps say what happened, when and who. The current step says what happens next and who does it.
 * Actions come from the journey module with their reasons, so the page never offers what the server refuses
 * and never hides an action without saying why. Guests follow along without actions. Pure and client-safe.
 */
import { FORMER_MEMBER, JOURNEY_STATUSES, journeyDate, journeyDay as day, type Journey, type JourneyAction, type JourneyActions, type JourneyLabel, type JourneyStatus } from "@/lib/request-journey"
import type { RequestStatus } from "@/lib/request-lifecycle"
import { EXCEPTION_REASON_OPTIONS, type ExceptionReason, type OutcomeClosure, type OutcomeException } from "@/lib/request-outcome"
import { valueBeforeReleaseFor } from "@/lib/request-release-facts"
import { releaseMeasurement, type ReleaseEvent, type ReleaseFact, type ReleaseState } from "@/lib/request-release"

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

export type TimelineAction =
  | { action: JourneyAction; label: string; available: true }
  | { action: JourneyAction; label: string; available: false; reason: string; opensOn?: string }

export type TimelineStep = {
  status: JourneyStatus
  label: JourneyLabel
  /** Skipped: the Request closed without a result before reaching this step. */
  state: "finished" | "current" | "upcoming" | "skipped"
  /** What happened, when and who. */
  happened: string[]
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
function stoppedAt(input: Pick<TimelineInput, "workStatus"> & { closure: { release?: ReleaseFact | null } | null }): JourneyStatus {
  if (input.closure?.release) return "measuring"
  return input.workStatus === "done" ? "done" : "in_progress"
}

/** The saved release facts under the Measuring step, as the timeline words them; null holds the value before release. */
function measuringFacts(fact: ReleaseFact, hasValueBefore: boolean, isCurrent: boolean): OutlineLine[] {
  return [
    evidenceLine(fact.evidence),
    ...hasValueBefore ? [null] : [],
    ...fact.windowKind === "fixed" ? [fixedWindowLine(fact)] : [],
    ...isCurrent ? [DUE_DATE_LINE] : [],
  ]
}

function stepActions(input: Pick<TimelineInput, "isGuest" | "readOnly" | "actions" | "hasAgreedResult">, status: JourneyStatus): TimelineAction[] {
  if (input.isGuest || input.readOnly) return []
  const shown: TimelineAction[] = []
  for (const { action, quiet } of STEP_ACTIONS[status] ?? []) {
    let availability = input.actions[action]
    if (action === "close" && availability.allowed && !input.hasAgreedResult)
      availability = { allowed: false, reason: "There is no agreed Expected impact to measure against." }
    const label = ACTION_LABELS[action]
    if (availability.allowed) { shown.push({ action, label, available: true }); continue }
    // One reason is enough: the same refusal twice in a step says nothing new.
    if (quiet || shown.some(a => !a.available && a.reason === availability.reason)) continue
    shown.push({ action, label, available: false, reason: availability.reason, ...(availability.opensOn ? { opensOn: availability.opensOn } : {}) })
  }
  return shown
}

const inProgressNext = (assigneeName: string | null) => `${assigneeName ?? "The assignee"} is working on this. Mark Done when the work is finished.`
/** Lines the timeline and its outline word alike. */
export const evidenceLine = (evidence: string) => `Evidence: ${evidence}`
export const observedLine = (closure: Pick<OutcomeClosure, "observedFrom" | "observedTo">) => `Observed ${journeyDate(closure.observedFrom)} to ${journeyDate(closure.observedTo)} (UTC).`
export const learnedLine = (learned: string) => `What we learned: ${learned}`
export const fixedWindowLine = (fact: ReleaseFact) => `Agreed fixed window: ${journeyDate(fact.startDate)} to ${journeyDate(fact.dueDate)}. Release timing does not move these dates.`
export const DUE_DATE_LINE = "The due date does not close this Request automatically."
/** The Closed step reads "Closed without a result" once a Request closed that way. */
const stepLabel = (journey: Journey, status: JourneyStatus, label: JourneyLabel) => status === "closed" && journey.status === "closed" ? journey.label : label
const CLOSED_NEXT = "Closed Requests never reopen."
const withoutResultLine = (stop: number, reasonCode: ExceptionReason) =>
  `Closed without a result at ${JOURNEY_STATUSES[stop].label}: ${EXCEPTION_REASON_OPTIONS.find(o => o.value === reasonCode)?.label ?? reasonCode}.`
const doneNext = (audience: string) => `Record the release once ${audience} has the work. Anyone working on this Request can record it.`
const OPEN_NEXT = "Waiting for someone to pick this up. Reviews are optional and never block pickup."

/** Each step's place in the journey: finished, current, not reached yet, or skipped by a close without a result. */
function stepStates(input: Pick<TimelineInput, "journey" | "workStatus"> & { closure: { release?: ReleaseFact | null } | null }): TimelineStep["state"][] {
  const current = ORDER.indexOf(input.journey.status)
  const stop = input.journey.withoutResult ? ORDER.indexOf(stoppedAt(input)) : -1
  return ORDER.map((_, index) => index === current ? "current" : index < current ? (stop >= 0 && index > stop ? "skipped" : "finished") : "upcoming")
}

export function timelineSteps(input: TimelineInput): TimelineStep[] {
  const { journey, names } = input
  const stop = journey.withoutResult ? ORDER.indexOf(stoppedAt(input)) : -1
  const states = stepStates(input)
  const release = input.release ?? input.closure?.release ?? null
  const recordedBy = [...input.releaseHistory].reverse().find(e => e.input.kind === "release" || e.input.kind === "correct")?.actorId

  return JOURNEY_STATUSES.map(({ status, label }, index) => {
    const state = states[index]
    const reached = state === "finished" || state === "current"
    const isCurrent = state === "current"
    const happened: string[] = []
    let next: string | null = null
    let countdown: string | null = null

    if (status === "open") {
      happened.push(`Requested by ${input.requestedBy} on ${day(input.requestedAt)}.`)
      if (isCurrent) next = OPEN_NEXT
    }
    if (status === "in_progress" && reached) {
      const on = input.pickedUpAt ? ` on ${day(input.pickedUpAt)}` : ""
      happened.push(input.assigneeName ? `Picked up by ${input.assigneeName}${on}.` : `Picked up${on}.`)
      if (isCurrent) next = inProgressNext(input.assigneeName)
    }
    if (status === "done" && reached) {
      if (input.doneAt) happened.push(`Marked Done on ${day(input.doneAt)}.`)
      if (isCurrent) next = doneNext(input.audience)
    }
    if (status === "measuring" && reached && release) {
      happened.push(`Released to ${release.audience} on ${journeyDate(release.exposureDate)}${recordedBy ? `, recorded by ${names[recordedBy] ?? FORMER_MEMBER}` : ""}.`)
      if (isCurrent) {
        countdown = `Result due ${journeyDate(release.dueDate)} · ${releaseMeasurement(release, input.now)!.label}`
        next = `On ${journeyDate(release.dueDate)} the Requester, ${input.requesterName}, records the measured result and closes this Request.`
      }
    }
    if (status === "closed" && isCurrent && input.closure) {
      const closure = input.closure
      const by = names[closure.actorId] ?? FORMER_MEMBER
      if (closure.kind === "measured") happened.push(`Closed with a measured result by ${by} on ${day(closure.closedAt)}.`)
      else {
        happened.push(withoutResultLine(stop, closure.reasonCode), `Closed by ${by} on ${day(closure.closedAt)}.`)
      }
      next = CLOSED_NEXT
    }

    return {
      status, label: stepLabel(journey, status, label),
      state, happened: reached ? happened : [], next, countdown,
      actions: isCurrent ? stepActions(input, status) : [],
    }
  })
}

/** A line of the outline: its words when the Request already holds them, or null where the journey's reads fill it in. */
export type OutlineLine = string | null

export type OutlineStep = Pick<TimelineStep, "status" | "label" | "state"> & {
  happened: OutlineLine[]
  /** The Open step's reviewers, which read on their own and so can start straight away. */
  reviews: boolean
  /** What follows the reviewers: saved facts, the countdown and what is next, in the order the step shows them. */
  after: OutlineLine[]
  /** The step's buttons, and each refusal's reason, as the read journey will show them: held at their size. */
  actions: TimelineAction[]
}

export type OutlineInput = Pick<TimelineInput, "journey" | "workStatus" | "isGuest" | "readOnly" | "requestedBy" | "requestedAt" | "assigneeName" | "audience" | "hasAgreedResult"> & {
  /** The reader's actions, decided on the server from the saved Request; none are held without them. */
  actions: JourneyActions | null
  releaseState: ReleaseState | null
  closure: OutcomeClosure | OutcomeException | null
}

/**
 * The journey as the Request alone draws it (#295), shown until the journey's reads arrive. Those ask Clerk for the
 * workspace's people, which can take half a second, so the page can't wait for them. The outline has the timeline's
 * steps and lines in the same places, holding the ones that need a name, a date or the reader's actions, so the
 * Journey keeps its height when the reads fill it in and nothing below it moves.
 */
export function journeyOutline(input: OutlineInput): { steps: OutlineStep[]; history: boolean } {
  const states = stepStates(input)
  const release = input.releaseState?.release ?? input.closure?.release ?? null
  return {
    steps: JOURNEY_STATUSES.map(({ status, label }, index) => {
      const state = states[index]
      const isCurrent = state === "current"
      const reached = isCurrent || state === "finished"
      const happened: OutlineLine[] = []
      const after: OutlineLine[] = []
      if (status === "open") {
        happened.push(`Requested by ${input.requestedBy} on ${day(input.requestedAt)}.`)
        if (isCurrent) after.push(OPEN_NEXT)
      }
      if (status === "in_progress" && reached) {
        happened.push(null)
        if (isCurrent) after.push(inProgressNext(input.assigneeName))
      }
      // When it was marked Done arrives with the reads.
      if (status === "done" && reached) {
        happened.push(null)
        if (isCurrent) after.push(doneNext(input.audience))
      }
      if (status === "measuring" && reached && release) {
        happened.push(null)
        after.push(...measuringFacts(release, valueBeforeReleaseFor(input.releaseState, input.releaseState?.release ?? null) !== null, isCurrent))
        // The countdown follows the reader's clock, and what is next names the Requester.
        if (isCurrent) after.push(null, null)
      }
      if (status === "closed" && isCurrent && input.closure) {
        const closure = input.closure
        // Who closed it is a name the reads bring.
        if (closure.kind === "measured") {
          happened.push(null)
          // The expected and actual results, and each guardrail, are worded against the agreed prediction the reads bring.
          after.push(null, null, ...closure.guardrails.map(() => null), evidenceLine(closure.evidence), observedLine(closure))
        } else {
          happened.push(withoutResultLine(ORDER.indexOf(stoppedAt(input)), closure.reasonCode), null)
          if (closure.reason) after.push(closure.reason)
        }
        if (closure.learned) after.push(learnedLine(closure.learned))
        after.push(CLOSED_NEXT)
      }
      return { status, label: stepLabel(input.journey, status, label), state, happened, reviews: status === "open", after, actions: isCurrent && input.actions ? stepActions({ ...input, actions: input.actions }, status) : [] }
    }),
    history: !!input.releaseState?.history.length,
  }
}
