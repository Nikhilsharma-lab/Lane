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
import { audienceInSentence } from "@/lib/measurement-audience"
import { reopenEndsAt } from "@/lib/reopen-window"
import { FORMER_MEMBER, JOURNEY_STATUSES, journeyOf, type ActionAvailability, type Journey, type JourneyAction, type JourneyActions, type JourneyLabel, type JourneyStatus } from "@/lib/request-journey"
import type { RequestStatus } from "@/lib/request-lifecycle"
import { EXCEPTION_REASON_OPTIONS, type ExceptionReason } from "@/lib/request-outcome-options"
import type { OutcomeClosure, OutcomeException } from "@/lib/request-outcome"
import { valueBeforeReleaseFor } from "@/lib/request-release-facts"
import { releaseMeasurement } from "@/lib/request-release-facts"
import type { ReleaseEvent, ReleaseFact, ReleaseState } from "@/lib/request-release"

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
  /** The day planned days and the countdown are read against. */
  now: Date
  /** The viewer's clock, to the moment: Reopen's 15 minutes run on it. */
  clock: Date
  /** The reads are behind the live Request (`liveJourney`): the current step offers nothing until they agree. */
  held?: boolean
}

/**
 * One line of what happened. A moment stays a moment (`{ at }`), so the page shows it as Lane shows every moment
 * (`LocalTime`): the zone-free day on the server and the first render, then the viewer's zone, with the full date
 * and time on hover (B5). Planned days are already text: the same day for everyone.
 */
export type JourneyLine = (string | { at: string })[]

/** A step's action: a journey action's form, or Reopen (the undo of Mark Done, not a journey action). */
export type StepAction = JourneyAction | "reopen"

/** `primary` is the step's one filled button; a `separated` item in a More menu sits apart, at its end. */
export type TimelineAction = { action: StepAction; label: string; emphasis: "primary" | "secondary"; separated?: true } & (
  | { available: true }
  | { available: false; reason: string; opensOn?: string })

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
  /** An overdue result's countdown is a warning. */
  countdownTone: "warning" | null
  actions: TimelineAction[]
  /** The step's less common actions, behind one "More" button. Only ones the viewer can take; a refusal shows above. */
  more: TimelineAction[]
}

export const ACTION_LABELS: Record<JourneyAction, string> = {
  release: "Record release",
  correctRelease: "Correct release",
  voidRelease: "Void incorrect release",
  close: "Close Request",
  closeWithoutResult: "Close without a result",
  correctClosure: "Add correction",
  handover: "Hand over to a new Requester",
  followUp: "Create follow-up Request",
}

export const REOPEN_LABEL = "Reopen"

/**
 * Per step, the actions in the order shown. `quiet` ones only appear when available. A step fills at most its one
 * `primary` action (#241: one main button); Close without a result and Add correction never are. `more` ones sit behind
 * the step's "More" button, Void incorrect release last and set apart (#235 item 16).
 */
type Slot = { action: StepAction; quiet?: true; primary?: true; more?: true; separated?: true }
const STEP_ACTIONS: Partial<Record<JourneyStatus, Slot[]>> = {
  in_progress: [{ action: "closeWithoutResult" }, { action: "handover", quiet: true }],
  done: [{ action: "release", primary: true }, { action: "reopen", quiet: true }, { action: "closeWithoutResult" }, { action: "handover", quiet: true }],
  measuring: [
    { action: "close", primary: true },
    { action: "closeWithoutResult", more: true }, { action: "correctRelease", more: true }, { action: "followUp", quiet: true, more: true },
    { action: "handover", quiet: true, more: true }, { action: "voidRelease", more: true, separated: true },
  ],
  closed: [{ action: "correctClosure" }, { action: "followUp", quiet: true }, { action: "handover", quiet: true }],
}

const ORDER = JOURNEY_STATUSES.map(s => s.status)

/** Where a Request closed without a result stopped: the last step it reached. */
function stoppedAt(input: Pick<TimelineInput, "workStatus"> & { closure: { release?: ReleaseFact | null } | null; release?: ReleaseFact | null }): JourneyStatus {
  // A close not read back yet (`liveJourney`) stopped where the release, if any, had taken it.
  if (input.closure?.release || input.release) return "measuring"
  return input.workStatus === "done" ? "done" : "in_progress"
}

/** The saved release facts under the Measuring step, as the timeline words them; null holds the value before release. */
function measuringFacts(fact: ReleaseFact, hasValueBefore: boolean, isCurrent: boolean, now: Date): OutlineLine[] {
  return [
    evidenceLine(fact.evidence),
    ...hasValueBefore ? [null] : [],
    ...fact.windowKind === "fixed" ? [fixedWindowLine(fact, now)] : [],
    ...isCurrent ? [DUE_DATE_LINE] : [],
  ]
}

/**
 * Reopen, for whoever may record the release (an active Member or Admin: the server's undo-Mark-Done rule), until 15
 * minutes after the saved Done time. Recording the release moves the Request on to Measuring, which ends it.
 */
function reopenAvailability(input: Pick<TimelineInput, "actions" | "doneAt" | "clock">): ActionAvailability {
  if (!input.actions.release.allowed || !input.doneAt) return { allowed: false, reason: "" }
  return input.clock.getTime() < reopenEndsAt(input.doneAt) ? { allowed: true } : { allowed: false, reason: "" }
}

type StepActionsInput = Pick<TimelineInput, "isGuest" | "readOnly" | "actions" | "hasAgreedResult"> & Partial<Pick<TimelineInput, "doneAt" | "clock">>

function stepActions(input: StepActionsInput, status: JourneyStatus): Pick<TimelineStep, "actions" | "more"> {
  if (input.isGuest || input.readOnly) return { actions: [], more: [] }
  const shown: TimelineAction[] = []
  const more: TimelineAction[] = []
  for (const { action, quiet, primary, more: behindMore, separated } of STEP_ACTIONS[status] ?? []) {
    let availability = action === "reopen"
      ? input.clock ? reopenAvailability({ actions: input.actions, doneAt: input.doneAt ?? null, clock: input.clock }) : { allowed: false as const, reason: "" }
      : input.actions[action]
    if (action === "close" && availability.allowed && !input.hasAgreedResult)
      availability = { allowed: false, reason: "There is no agreed goal to measure against." }
    const label = action === "reopen" ? REOPEN_LABEL : ACTION_LABELS[action]
    const placed = { action, label, emphasis: primary && availability.allowed ? "primary" as const : "secondary" as const, ...(separated ? { separated } : {}) }
    if (availability.allowed) { (behindMore ? more : shown).push({ ...placed, available: true }); continue }
    // One reason is enough: the same refusal twice in a step says nothing new. A refusal is never hidden in a menu.
    if (quiet || shown.some(a => !a.available && a.reason === availability.reason)) continue
    shown.push({ ...placed, available: false, reason: availability.reason, ...(availability.opensOn ? { opensOn: availability.opensOn } : {}) })
  }
  return { actions: shown, more }
}

const inProgressNext = (assigneeName: string | null) => `${assigneeName ?? "The assignee"} is working on this. Mark Done when the work is finished.`
/** Lines the timeline and its outline word alike. */
export const evidenceLine = (evidence: string) => `Evidence: ${evidence}`
// Planned days (#261): the same day for everyone, so no zone to name.
export const observedLine = (closure: Pick<OutcomeClosure, "observedFrom" | "observedTo">, now = new Date()) => `Observed ${plannedDay(closure.observedFrom, { now })} to ${plannedDay(closure.observedTo, { now })}.`
export const learnedLine = (learned: string) => `What we learned: ${learned}`
export const fixedWindowLine = (fact: ReleaseFact, now = new Date()) => `Agreed fixed window: ${plannedDay(fact.startDate, { now })} to ${plannedDay(fact.dueDate, { now })}. Release timing does not move these dates.`
export const DUE_DATE_LINE = "The due date does not close this Request automatically."
/** The Closed step reads "Closed without a result" once a Request closed that way. */
const stepLabel = (journey: Journey, status: JourneyStatus, label: JourneyLabel) => status === "closed" && journey.status === "closed" ? journey.label : label
/** The Closed step's last line, and the line under both close forms' buttons (#279). */
export const CLOSED_NEXT = "Closed Requests can’t be reopened."
const withoutResultLine = (stop: number, reasonCode: ExceptionReason) =>
  `Closed without a result at ${JOURNEY_STATUSES[stop].label}: ${EXCEPTION_REASON_OPTIONS.find(o => o.value === reasonCode)?.label ?? reasonCode}.`
const doneNext = (audience: string) => `Record the release once the work reaches ${audienceInSentence(audience)}. Anyone working on this Request can record it.`
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
  const day = (iso: string) => ({ at: iso })
  const planned = (day: string) => plannedDay(day, { now: input.now })
  const recordedBy = [...input.releaseHistory].reverse().find(e => e.input.kind === "release" || e.input.kind === "correct")?.actorId

  return JOURNEY_STATUSES.map(({ status, label }, index) => {
    const state = states[index]
    const reached = state === "finished" || state === "current"
    const isCurrent = state === "current"
    const happened: JourneyLine[] = []
    let next: string | null = null
    let countdown: string | null = null
    let countdownTone: TimelineStep["countdownTone"] = null

    if (status === "open") {
      happened.push([`Requested by ${input.requestedBy} on `, day(input.requestedAt), "."])
      if (isCurrent) next = OPEN_NEXT
    }
    if (status === "in_progress" && reached) {
      const by = input.assigneeName ? `Picked up by ${input.assigneeName}` : "Picked up"
      happened.push(input.pickedUpAt ? [`${by} on `, day(input.pickedUpAt), "."] : [`${by}.`])
      if (isCurrent) next = inProgressNext(input.assigneeName)
    }
    if (status === "done" && reached) {
      if (input.doneAt) happened.push(["Marked Done on ", day(input.doneAt), "."])
      if (isCurrent) next = doneNext(input.audience)
    }
    if (status === "measuring" && reached && release) {
      happened.push([`Released to ${audienceInSentence(release.audience)} on ${planned(release.exposureDate)}${recordedBy ? `, recorded by ${names[recordedBy] ?? FORMER_MEMBER}` : ""}.`])
      if (isCurrent) {
        const measurement = releaseMeasurement(release, input.now)!
        // C2-11: past the due date the step says the result was due, and the countdown says by how long, as a warning.
        if (measurement.days < 0) {
          countdown = measurement.label
          countdownTone = "warning"
          next = `The result was due on ${planned(release.dueDate)}. ${input.requesterName} records it and closes this Request.`
        } else {
          countdown = `Result due ${planned(release.dueDate)} · ${measurement.label}`
          next = `On ${planned(release.dueDate)} the Requester, ${input.requesterName}, records the measured result and closes this Request.`
        }
      }
    }
    if (status === "closed" && isCurrent) {
      // A close not read back yet has no closure to describe; it is Closed all the same.
      const closure = input.closure
      if (closure) {
        const by = names[closure.actorId] ?? FORMER_MEMBER
        if (closure.kind === "measured") happened.push([`Closed with a measured result by ${by} on `, day(closure.closedAt), "."])
        else happened.push([withoutResultLine(stop, closure.reasonCode)], [`Closed by ${by} on `, day(closure.closedAt), "."])
      }
      next = CLOSED_NEXT
    }

    return {
      status, label: stepLabel(journey, status, label),
      state, happened: reached ? happened : [], next, countdown, countdownTone,
      ...isCurrent && !input.held ? stepActions(input, status) : { actions: [], more: [] },
    }
  })
}

/**
 * B1, C2-4: the Journey's step as the live Request has it. The strip and the properties move the Request in the same
 * frame (the pending-mutation overlay), and a saved close is known before the Journey's reads bring it back. Until the
 * reads agree, the Journey shows that step `held`: what only the reads can say (who, when, which actions) waits for them.
 * Pick up, Mark Done and Reopen only change the work status; a release and a closure come from the reads.
 */
export function liveJourney(
  read: { journey: Journey; workStatus: RequestStatus; release: ReleaseFact | null },
  live: { status: RequestStatus; closed: { withoutResult: boolean } | null },
): { journey: Journey; workStatus: RequestStatus; held: boolean } {
  if (read.journey.status === "closed") return { journey: read.journey, workStatus: read.workStatus, held: false }
  if (live.closed) return { journey: journeyOf("closed", live.closed.withoutResult), workStatus: read.workStatus, held: true }
  if (live.status === read.workStatus) return { journey: read.journey, workStatus: read.workStatus, held: false }
  const status: JourneyStatus = live.status === "done" && read.release ? "measuring" : live.status
  return { journey: journeyOf(status, false), workStatus: live.status, held: true }
}

/** A line of the outline: its words when the Request already holds them (a Journey line when it names a moment, so it
 * reads as the read journey will), or null where the journey's reads fill it in. */
export type OutlineLine = string | JourneyLine | null

export type OutlineStep = Pick<TimelineStep, "status" | "label" | "state"> & {
  happened: OutlineLine[]
  /** The Open step's reviewers, which read on their own and so can start straight away. */
  reviews: boolean
  /** What follows the reviewers: saved facts, the countdown and what is next, in the order the step shows them. */
  after: OutlineLine[]
  /** The step's buttons, and each refusal's reason, as the read journey will show them: held at their size. */
  actions: TimelineAction[]
  /** What the read journey puts behind its "More" button; the outline holds the button. */
  more: TimelineAction[]
}

export type OutlineInput = Pick<TimelineInput, "journey" | "workStatus" | "isGuest" | "readOnly" | "requestedBy" | "requestedAt" | "assigneeName" | "audience" | "hasAgreedResult"> & {
  /** The reader's actions, decided on the server from the saved Request; none are held without them. */
  actions: JourneyActions | null
  releaseState: ReleaseState | null
  closure: OutcomeClosure | OutcomeException | null
  /** The clock planned days are read against (this year's days without the year); now unless a fixture sets it. */
  now?: Date
}

/**
 * The journey as the Request alone draws it (#295), shown until the journey's reads arrive. Those ask Clerk for the
 * workspace's people, which can take half a second, so the page can't wait for them. The outline has the timeline's
 * steps and lines in the same places, holding the ones that need a name, a date or the reader's actions, so the
 * Journey keeps its height when the reads fill it in and nothing below it moves.
 */
export type JourneyOutline = { steps: OutlineStep[]; history: boolean }

export function journeyOutline(input: OutlineInput): JourneyOutline {
  const states = stepStates(input)
  const release = input.releaseState?.release ?? input.closure?.release ?? null
  const now = input.now ?? new Date()
  return {
    steps: JOURNEY_STATUSES.map(({ status, label }, index) => {
      const state = states[index]
      const isCurrent = state === "current"
      const reached = isCurrent || state === "finished"
      const happened: OutlineLine[] = []
      const after: OutlineLine[] = []
      if (status === "open") {
        happened.push([`Requested by ${input.requestedBy} on `, { at: input.requestedAt }, "."])
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
        after.push(...measuringFacts(release, valueBeforeReleaseFor(input.releaseState, input.releaseState?.release ?? null) !== null, isCurrent, now))
        // The countdown follows the reader's clock, and what is next names the Requester.
        if (isCurrent) after.push(null, null)
      }
      if (status === "closed" && isCurrent && input.closure) {
        const closure = input.closure
        // Who closed it is a name the reads bring.
        if (closure.kind === "measured") {
          happened.push(null)
          // The expected and actual results, and each guardrail, are worded against the agreed prediction the reads bring.
          after.push(null, null, ...closure.guardrails.map(() => null), evidenceLine(closure.evidence), observedLine(closure, now))
        } else {
          happened.push(withoutResultLine(ORDER.indexOf(stoppedAt(input)), closure.reasonCode), null)
          if (closure.reason) after.push(closure.reason)
        }
        if (closure.learned) after.push(learnedLine(closure.learned))
        after.push(CLOSED_NEXT)
      }
      return { status, label: stepLabel(input.journey, status, label), state, happened, reviews: status === "open", after,
        ...isCurrent && input.actions ? stepActions({ ...input, actions: input.actions }, status) : { actions: [], more: [] } }
    }),
    history: !!input.releaseState?.history.length,
  }
}
