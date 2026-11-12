import { describe, expect, it } from "vitest"
import { journeyActions, journeyStatus, type JourneyViewer } from "@/lib/request-journey"
import type { RequestStatus } from "@/lib/request-lifecycle"
import type { ReleaseFact, ReleaseState } from "@/lib/request-release"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { momentDay } from "@/lib/dates"
import { JourneyLine } from "./journey-line"
import { reopenEndsAt } from "@/lib/reopen-window"
import { journeyOutline, liveJourney, timelineSteps, type JourneyLine as Line, type OutlineInput, type OutlineLine, type TimelineInput, type TimelineStep } from "./request-timeline-model"

// The Request page's timeline: what each step says to whoever is looking (#134).
const NOW = new Date("2026-10-25T12:00:00Z")
const release: ReleaseFact = { exposureDate: "2026-10-21", audience: "All shoppers", evidence: "Feature flag at 100%", dueDate: "2026-10-28", startDate: "2026-10-21", windowKind: "relative" }
const releaseState = (fact: ReleaseFact | null): ReleaseState => ({
  version: 1, ownerId: "ana", release: fact,
  history: fact ? [{ operationId: "op", fingerprint: "f", actorId: "dev", at: "2026-10-21T09:00:00Z", input: { kind: "release", exposureDate: fact.exposureDate, evidence: fact.evidence, audienceConfirmed: true }, previousRelease: null, release: fact, previousOwnerId: "ana", ownerId: "ana", revision: 4 }] : [],
})
const NAMES: Record<string, string> = { ana: "Ana", dev: "Dev", sam: "Sam" }
const ANA: JourneyViewer = { id: "ana", role: "member", active: true }
const DEV: JourneyViewer = { id: "dev", role: "member", active: true }
const ADMIN: JourneyViewer = { id: "sam", role: "admin", active: true }
const GUEST: JourneyViewer = { id: "ana", role: "guest", active: false }

type Facts = { status: RequestStatus; releaseState?: ReleaseState | null; outcomeClosure?: TimelineInput["closure"]; exceptionClosure?: TimelineInput["closure"] }
function input(facts: Facts, viewer: JourneyViewer, more: Partial<TimelineInput> = {}, requesterActive = true): TimelineInput {
  const saved = { status: facts.status, releaseState: facts.releaseState ?? null, outcomeClosure: facts.outcomeClosure ?? null, exceptionClosure: facts.exceptionClosure ?? null, createdBy: "ana", takenOnBy: null }
  const closure = facts.outcomeClosure ?? facts.exceptionClosure ?? null
  return {
    journey: journeyStatus(saved), workStatus: facts.status, isGuest: viewer.role === "guest", audience: "All shoppers",
    requesterName: "Ana", requestedBy: "Ana", requestedAt: "2026-10-01T10:00:00Z",
    assigneeName: facts.status === "open" ? null : "Dev", pickedUpAt: null, doneAt: facts.status === "done" ? "2026-10-20T15:00:00Z" : null,
    release: facts.releaseState?.release ?? null, releaseHistory: facts.releaseState?.history ?? [], closure, names: NAMES,
    hasAgreedResult: true, now: NOW, clock: NOW,
    // The server decides the actions on its own clock: the fixture's day, unless a test moves it.
    actions: journeyActions(saved, viewer, { requesterName: "Ana", requesterActive }, more.now ?? NOW),
    ...more,
  }
}
const step = (steps: TimelineStep[], status: TimelineStep["status"]) => steps.find(s => s.status === status)!
/** A step's lines as a viewer in `timeZone` reads them: each moment as its day there. */
const said = (s: TimelineStep, timeZone = "UTC") => s.happened.map(line => line.map(part => typeof part === "string" ? part : momentDay(part.at, { now: NOW, timeZone })).join(""))
const actionsOf = (s: Pick<TimelineStep, "actions">) => s.actions.map(a => a.available ? a.label : `${a.label}: ${a.reason}`)
/** The More menu's items, in order; the one set apart from the rest says so. */
const moreOf = (s: Pick<TimelineStep, "more">) => s.more.map(a => a.separated ? `${a.label} (set apart)` : a.label)

describe("Request timeline", () => {
  it("lists the five steps in order with the current one marked", () => {
    const steps = timelineSteps(input({ status: "in_progress" }, ANA))
    expect(steps.map(s => [s.label, s.state])).toEqual([
      ["Open", "finished"], ["In progress", "current"], ["Done", "upcoming"], ["Measuring", "upcoming"], ["Closed", "upcoming"],
    ])
  })

  it("says what happened, when and who on finished steps", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA))
    expect(said(step(steps, "open"))).toEqual(["Requested by Ana on 1 Oct."])
    expect(said(step(steps, "in_progress"))).toEqual(["Picked up by Dev."])
    expect(said(step(steps, "done"))).toEqual(["Marked Done on 20 Oct."])
    expect(said(step(steps, "measuring"))).toEqual(["Released to All shoppers on 21 Oct, recorded by Dev."])
  })

  // B5: moments read in the viewer's zone, so the Journey agrees with Submitted; planned days stay the same for everyone.
  it("reads moments in the viewer's zone and planned days the same everywhere", () => {
    const late = { requestedAt: "2026-10-01T20:00:00Z", pickedUpAt: "2026-10-12T19:00:00Z" }
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA, late))
    expect(said(step(steps, "open"), "Asia/Kolkata")).toEqual(["Requested by Ana on 2 Oct."])
    expect(said(step(steps, "open"), "America/Los_Angeles")).toEqual(["Requested by Ana on 1 Oct."])
    expect(said(step(steps, "in_progress"), "Asia/Kolkata")).toEqual(["Picked up by Dev on 13 Oct."])
    expect(step(steps, "measuring").countdown).toBe(step(steps, "measuring").countdown)
    expect(said(step(steps, "measuring"), "Asia/Kolkata")).toEqual(["Released to All shoppers on 21 Oct, recorded by Dev."])
    expect(said(step(steps, "measuring"), "America/Los_Angeles")).toEqual(["Released to All shoppers on 21 Oct, recorded by Dev."])
  })

  // B5: the server and the hydrating render can't know the viewer's zone. A Journey moment renders as the zone-free
  // day there, whatever zone the server runs in, then the viewer's zone replaces it (LocalTime), with the full date
  // and time on hover in the browser. 20:00 UTC is already the next day in India.
  it("renders a moment on the server as the zone-free day, never the server's own zone", () => {
    const zone = process.env.TZ
    process.env.TZ = "Asia/Kolkata"
    try {
      expect(new Intl.DateTimeFormat("en-GB", { day: "numeric" }).format(new Date("2026-10-01T20:00:00Z"))).toBe("2")
      const late = timelineSteps(input({ status: "open" }, ANA, { requestedAt: "2026-10-01T20:00:00Z" }))
      const html = renderToStaticMarkup(createElement(JourneyLine, { line: step(late, "open").happened[0] }))
      expect(html).toBe('<p>Requested by Ana on <time dateTime="2026-10-01T20:00:00Z">1 Oct</time>.</p>')
    } finally {
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }
  })

  it("says when the work was picked up once Lane knows, and only who before that", () => {
    expect(said(step(timelineSteps(input({ status: "in_progress" }, ANA, { pickedUpAt: "2026-10-12T08:00:00Z" })), "in_progress"))).toEqual(["Picked up by Dev on 12 Oct."])
    expect(said(step(timelineSteps(input({ status: "in_progress" }, ANA, { pickedUpAt: "2026-10-12T08:00:00Z", assigneeName: null })), "in_progress"))).toEqual(["Picked up on 12 Oct."])
    expect(said(step(timelineSteps(input({ status: "in_progress" }, ANA)), "in_progress"))).toEqual(["Picked up by Dev."])
  })

  it("says what is next and who does it on the current step only", () => {
    const steps = timelineSteps(input({ status: "done" }, DEV))
    expect(step(steps, "done").next).toBe("Record the release once the work reaches All shoppers. Anyone working on this Request can record it.")
    expect(steps.filter(s => s.next).map(s => s.status)).toEqual(["done"])
    expect(step(timelineSteps(input({ status: "open" }, DEV)), "open").next).toBe("Waiting for someone to pick this up. Reviews are optional and never block pickup.")
    expect(step(timelineSteps(input({ status: "in_progress" }, DEV)), "in_progress").next).toBe("Dev is working on this. Mark Done when the work is finished.")
  })

  it("shows the countdown only in the current Measuring step", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA))
    expect(step(steps, "measuring").countdown).toBe("Result due 28 Oct · Due in 3 days")
    expect(steps.filter(s => s.countdown).map(s => s.status)).toEqual(["measuring"])
    expect(step(steps, "measuring").next).toBe("On 28 Oct the Requester, Ana, records the measured result and closes this Request.")
  })

  it("words the countdown as the due tag does: Due in N days, Due today, Overdue N days", () => {
    const countdown = (now: string) => step(timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA, { now: new Date(now) })), "measuring").countdown
    expect(countdown("2026-10-27T23:00:00Z")).toBe("Result due 28 Oct · Due in 1 day")
    expect(countdown("2026-10-28T08:00:00Z")).toBe("Result due 28 Oct · Due today")
    expect(countdown("2026-10-29T08:00:00Z")).toBe("Overdue 1 day")
    expect(countdown("2026-10-31T08:00:00Z")).toBe("Overdue 3 days")
  })

  // C2-11 (#241 d5): once the due date has passed the step says so in the past tense, and the countdown carries the warning tone.
  it("says a past-due result was due, and marks only an overdue countdown as a warning", () => {
    const measuring = (now: string) => step(timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA, { now: new Date(now) })), "measuring")
    expect(measuring("2026-12-30T08:00:00Z")).toMatchObject({
      countdown: "Overdue 63 days", countdownTone: "warning",
      next: "The result was due on 28 Oct. Ana records it and closes this Request.",
    })
    expect(measuring("2026-10-28T08:00:00Z")).toMatchObject({ countdownTone: null, next: "On 28 Oct the Requester, Ana, records the measured result and closes this Request." })
    expect(measuring("2026-10-25T08:00:00Z").countdownTone).toBeNull()
  })

  // B36 (#235 i16): Measuring has one main button, Close Request, and the rest in a More menu with Void last and set apart.
  it("offers Close Request to the Requester as the main action, unavailable until the due date, with the rest under More", () => {
    const measuring = step(timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA)), "measuring")
    expect(actionsOf(measuring)).toEqual(["Close Request: Opens on 28 Oct."])
    expect(moreOf(measuring)).toEqual(["Close without a result", "Correct release", "Create follow-up Request", "Void incorrect release (set apart)"])
    const due = step(timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA, { now: new Date("2026-10-28T08:00:00Z") })), "measuring")
    expect(due.actions).toEqual([{ action: "close", label: "Close Request", available: true, emphasis: "primary" }])
  })

  it("names the Requester when a teammate can't close, and keeps what the teammate can do under More", () => {
    const measuring = step(timelineSteps(input({ status: "done", releaseState: releaseState(release) }, DEV)), "measuring")
    expect(actionsOf(measuring)).toEqual(["Close Request: Only the Requester, Ana, can close this."])
    expect(moreOf(measuring)).toEqual(["Correct release", "Create follow-up Request", "Void incorrect release (set apart)"])
  })

  it("puts an admin's handover under More, before Void", () => {
    const measuring = step(timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ADMIN, {}, false)), "measuring")
    expect(moreOf(measuring)).toEqual(["Correct release", "Create follow-up Request", "Hand over to a new Requester", "Void incorrect release (set apart)"])
  })

  // B12, C2-17: at most one filled button per step; Close without a result and Add correction never are.
  it("fills at most one button per step: Record release at Done and Close Request at Measuring, nothing else", () => {
    const closure = { kind: "measured" as const, actorId: "ana", closedAt: "2026-10-29T08:00:00Z", release }
    const cases: [Facts, JourneyViewer, string | null][] = [
      [{ status: "in_progress" }, ANA, null],
      [{ status: "in_progress" }, ADMIN, null],
      [{ status: "done" }, ANA, "Record release"],
      [{ status: "done", releaseState: releaseState(release) }, ANA, null],
      [{ status: "done", releaseState: releaseState(release), outcomeClosure: closure }, ANA, null],
    ]
    for (const [facts, viewer, primary] of cases) {
      const steps = timelineSteps(input(facts, viewer, { now: new Date("2026-10-25T08:00:00Z") }, false))
      const filled = steps.flatMap(s => [...s.actions, ...s.more]).filter(a => a.emphasis === "primary").map(a => a.label)
      expect(filled).toEqual(primary ? [primary] : [])
    }
    const due = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA, { now: new Date("2026-10-28T08:00:00Z") }))
    expect(due.flatMap(s => [...s.actions, ...s.more]).filter(a => a.emphasis === "primary").map(a => a.label)).toEqual(["Close Request"])
  })

  it("lets any member record the release at Done and keeps Close without a result with the Requester", () => {
    expect(actionsOf(step(timelineSteps(input({ status: "done" }, ANA)), "done"))).toEqual(["Record release", "Close without a result"])
    expect(actionsOf(step(timelineSteps(input({ status: "done" }, DEV)), "done"))).toEqual(["Record release", "Close without a result: Only the Requester, Ana, can close this."])
  })

  it("offers handover to an admin from pickup once the Requester has lost access, and hides it otherwise", () => {
    expect(actionsOf(step(timelineSteps(input({ status: "in_progress" }, ADMIN, {}, false)), "in_progress"))).toContain("Hand over to a new Requester")
    expect(actionsOf(step(timelineSteps(input({ status: "in_progress" }, ADMIN)), "in_progress")).join()).not.toContain("Hand over")
    expect(actionsOf(step(timelineSteps(input({ status: "in_progress" }, DEV, {}, false)), "in_progress")).join()).not.toContain("Hand over")
  })

  it("shows guests the timeline without actions or reasons", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, GUEST))
    expect(steps.flatMap(s => s.actions)).toEqual([])
    expect(step(steps, "measuring").countdown).toBe("Result due 28 Oct · Due in 3 days")
  })

  // #210: a Viewer reads the whole journey, including on Requests they filed as a Member, with nothing to do.
  it("shows a Viewer the timeline without actions or reasons", () => {
    const viewer: JourneyViewer = { id: "ana", role: "viewer", active: false }
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, viewer, { readOnly: true }))
    expect(steps.flatMap(s => s.actions)).toEqual([])
    expect(step(steps, "measuring").countdown).toBe("Result due 28 Oct · Due in 3 days")
  })

  it("tells a former member once why nothing is available", () => {
    const steps = timelineSteps(input({ status: "done" }, { id: "dev", role: "member", active: false }))
    expect(actionsOf(step(steps, "done"))).toEqual(["Record release: Your workspace membership is no longer active."])
  })

  it("explains a Request closed before release, with the stage it stopped at", () => {
    const closure = { kind: "exception" as const, reasonCode: "rolled_back" as const, reason: "", actorId: "ana", closedAt: "2026-10-22T08:00:00Z", release: null }
    const steps = timelineSteps(input({ status: "in_progress", exceptionClosure: closure }, ANA))
    expect(steps.map(s => [s.label, s.state])).toEqual([
      ["Open", "finished"], ["In progress", "finished"], ["Done", "skipped"], ["Measuring", "skipped"], ["Closed without a result", "current"],
    ])
    expect(said(step(steps, "closed"))).toEqual(["Closed without a result at In progress: Rolled back.", "Closed by Ana on 22 Oct."])
    expect(step(steps, "closed").next).toBe("Closed Requests can’t be reopened.")
    expect(actionsOf(step(steps, "closed"))).toEqual(["Add correction"])
  })

  it("keeps the release on a measured closure and lets only the Requester correct it", () => {
    const closure = { kind: "measured" as const, actorId: "ana", closedAt: "2026-10-29T08:00:00Z", release }
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release), outcomeClosure: closure }, DEV))
    expect(step(steps, "measuring").state).toBe("finished")
    expect(step(steps, "measuring").countdown).toBeNull()
    expect(said(step(steps, "measuring"))).toEqual(["Released to All shoppers on 21 Oct, recorded by Dev."])
    expect(said(step(steps, "closed"))).toEqual(["Closed with a measured result by Ana on 29 Oct."])
    expect(actionsOf(step(steps, "closed"))).toEqual(["Add correction: Only the Requester, Ana, can add a correction.", "Create follow-up Request"])
  })

  it("can't offer a measured close without an agreed result", () => {
    const due = { ...release, dueDate: "2026-10-25" }
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(due) }, ANA, { hasAgreedResult: false }))
    expect(actionsOf(step(steps, "measuring"))[0]).toBe("Close Request: There is no agreed goal to measure against.")
  })
})

// Reopen (#241 d2): the Done step's way back to In progress, for 15 minutes from the saved Done time, offered to whoever
// may record the release (the server's undo rule: an active Member or Admin), and never once a release is recorded.
describe("Reopen", () => {
  const DONE_AT = "2026-10-25T11:50:00Z"
  const at = (iso: string) => ({ doneAt: DONE_AT, clock: new Date(iso) })
  const done = (viewer: JourneyViewer, more: Partial<TimelineInput>) => step(timelineSteps(input({ status: "done" }, viewer, more)), "done")

  it("offers Reopen on the Done step for 15 minutes after Mark Done, beside Record release and never filled", () => {
    expect(done(DEV, at("2026-10-25T12:04:59Z")).actions.map(a => [a.label, a.emphasis])).toEqual([
      ["Record release", "primary"], ["Reopen", "secondary"], ["Close without a result", "secondary"],
    ])
    expect(actionsOf(done(DEV, at("2026-10-25T12:05:00Z")))).toEqual(["Record release", "Close without a result: Only the Requester, Ana, can close this."])
    expect(reopenEndsAt(DONE_AT)).toBe(Date.parse("2026-10-25T12:05:00Z"))
  })

  it("counts from the Done time only: a Done Request with no saved Done time offers none", () => {
    expect(actionsOf(done(ANA, { doneAt: null, clock: new Date(DONE_AT) }))).not.toContain("Reopen")
  })

  it("isn't offered to a Guest, a Viewer or a former member, nor once the release is recorded or the Request closed", () => {
    expect(done(GUEST, at(DONE_AT)).actions).toEqual([])
    expect(done({ id: "ana", role: "viewer", active: false }, { ...at(DONE_AT), readOnly: true }).actions).toEqual([])
    expect(actionsOf(done({ id: "dev", role: "member", active: false }, at(DONE_AT)))).not.toContain("Reopen")
    const released = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, DEV, at(DONE_AT)))
    expect(released.flatMap(s => [...s.actions, ...s.more]).map(a => a.label)).not.toContain("Reopen")
    const closure = { kind: "exception" as const, reasonCode: "rolled_back" as const, reason: "", actorId: "ana", closedAt: DONE_AT, release: null }
    const closed = timelineSteps(input({ status: "done", exceptionClosure: closure }, ANA, at(DONE_AT)))
    expect(closed.flatMap(s => [...s.actions, ...s.more]).map(a => a.label)).not.toContain("Reopen")
  })
})

// B16: the audience in the plan's own words. Lane's own labels read lower-case mid-sentence; a name someone typed stays as typed.
describe("Journey audience", () => {
  it("names Lane's audience labels in lower case mid-sentence, and a typed name as typed", () => {
    const doneNext = (audience: string) => step(timelineSteps(input({ status: "done" }, DEV, { audience })), "done").next
    expect(doneNext("All users")).toBe("Record the release once the work reaches all users. Anyone working on this Request can record it.")
    expect(doneNext("Returning users")).toBe("Record the release once the work reaches returning users. Anyone working on this Request can record it.")
    expect(doneNext("EU beta testers")).toBe("Record the release once the work reaches EU beta testers. Anyone working on this Request can record it.")
  })

  it("words an older release's saved audience the same way, without changing it", () => {
    const released = (audience: string) => said(step(timelineSteps(input({ status: "done", releaseState: releaseState({ ...release, audience }) }, ANA)), "measuring"))
    expect(released("Everyone this Request is for")).toEqual(["Released to everyone this Request is for on 21 Oct, recorded by Dev."])
    expect(released("All users")).toEqual(["Released to all users on 21 Oct, recorded by Dev."])
  })
})

// B1, C2-4: the Journey shows the live Request's step (the strip's) while its reads catch up, holding what only they can say.
describe("Live journey", () => {
  const read = (facts: Facts) => ({ journey: journeyStatus({ status: facts.status, releaseState: facts.releaseState ?? null, outcomeClosure: null, exceptionClosure: null }), workStatus: facts.status, release: facts.releaseState?.release ?? null })
  const live = (status: RequestStatus, closed: { withoutResult: boolean } | null = null) => ({ status, closed })

  it("follows Pick up, Mark Done and Reopen before the reads do, and holds until they agree", () => {
    expect(liveJourney(read({ status: "open" }), live("in_progress"))).toEqual({ journey: { status: "in_progress", label: "In progress", withoutResult: false }, workStatus: "in_progress", held: true })
    expect(liveJourney(read({ status: "in_progress" }), live("done"))).toMatchObject({ journey: { status: "done" }, workStatus: "done", held: true })
    expect(liveJourney(read({ status: "done" }), live("in_progress"))).toMatchObject({ journey: { status: "in_progress" }, held: true })
    expect(liveJourney(read({ status: "done", releaseState: releaseState(release) }), live("done"))).toMatchObject({ journey: { status: "measuring" }, held: false })
  })

  it("shows Closed straight after a close saves, until the reads bring the closure", () => {
    expect(liveJourney(read({ status: "done", releaseState: releaseState(release) }), live("done", { withoutResult: true })))
      .toEqual({ journey: { status: "closed", label: "Closed without a result", withoutResult: true }, workStatus: "done", held: true })
    expect(liveJourney(read({ status: "done", releaseState: releaseState(release) }), live("done", { withoutResult: false }))).toMatchObject({ journey: { status: "closed", label: "Closed" }, held: true })
    const closedRead = { journey: { status: "closed" as const, label: "Closed" as const, withoutResult: false }, workStatus: "done" as const, release }
    expect(liveJourney(closedRead, live("done", { withoutResult: false }))).toEqual({ journey: closedRead.journey, workStatus: "done", held: false })
  })

  it("offers nothing on a held step, and a held close still says where it stopped and that it can't be reopened", () => {
    const pickedUp = timelineSteps(input({ status: "open" }, ANA, { ...liveJourney(read({ status: "open" }), live("in_progress")), assigneeName: "Dev" }))
    expect(step(pickedUp, "in_progress")).toMatchObject({ state: "current", actions: [], more: [], next: "Dev is working on this. Mark Done when the work is finished." })
    expect(said(step(pickedUp, "in_progress"))).toEqual(["Picked up by Dev."])
    const closing = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA, liveJourney(read({ status: "done", releaseState: releaseState(release) }), live("done", { withoutResult: true }))))
    expect(closing.map(s => [s.label, s.state])).toEqual([
      ["Open", "finished"], ["In progress", "finished"], ["Done", "finished"], ["Measuring", "finished"], ["Closed without a result", "current"],
    ])
    expect(step(closing, "closed")).toMatchObject({ happened: [], next: "Closed Requests can’t be reopened.", actions: [], more: [] })
  })
})

// #295: what the Journey draws from the Request alone, before its reads (which ask Clerk) arrive. Words the Request
// already holds are shown; null holds the place of a line the reads fill in, so nothing below moves when they land.
function outline(facts: Facts, reader: { isGuest?: boolean; readOnly?: boolean; viewer?: JourneyViewer } = {}): OutlineInput {
  const saved = { status: facts.status, releaseState: facts.releaseState ?? null, outcomeClosure: facts.outcomeClosure ?? null, exceptionClosure: facts.exceptionClosure ?? null, createdBy: "ana", takenOnBy: null }
  return {
    journey: journeyStatus(saved), workStatus: facts.status, isGuest: reader.isGuest ?? false, readOnly: reader.readOnly ?? false,
    // The reader's actions from the same rules as the read journey; only the Requester's name is a stand-in.
    actions: journeyActions(saved, reader.viewer ?? ANA, { requesterName: "Ana", requesterActive: true }, NOW), hasAgreedResult: true,
    requestedBy: "Ana", requestedAt: "2026-10-01T10:00:00Z", assigneeName: facts.status === "open" ? null : "Dev", audience: "All shoppers",
    releaseState: saved.releaseState, closure: (facts.outcomeClosure ?? facts.exceptionClosure ?? null) as OutlineInput["closure"], now: NOW,
  }
}
const outlineStep = (input: OutlineInput, status: TimelineStep["status"]) => journeyOutline(input).steps.find(s => s.status === status)!
const heldActions = (input: OutlineInput, status: TimelineStep["status"]) => actionsOf(outlineStep(input, status))
/** An outline's lines as read in UTC: a Journey line's moments as their day there, held lines still null. */
const read = (lines: OutlineLine[]) => lines.map(line => Array.isArray(line) ? (line as Line).map(part => typeof part === "string" ? part : momentDay(part.at, { now: NOW, timeZone: "UTC" })).join("") : line)

describe("Journey outline", () => {
  it("draws an Open Request's five steps, who asked and when, its reviewers, and what is next", () => {
    const { steps } = journeyOutline(outline({ status: "open" }))
    expect(steps.map(s => [s.label, s.state])).toEqual([
      ["Open", "current"], ["In progress", "upcoming"], ["Done", "upcoming"], ["Measuring", "upcoming"], ["Closed", "upcoming"],
    ])
    expect(steps[0]).toMatchObject({
      reviews: true, after: ["Waiting for someone to pick this up. Reviews are optional and never block pickup."], actions: [],
    })
    // The moment stays a moment, so the outline shows it as the read journey will (LocalTime, #261).
    expect(read(steps[0].happened)).toEqual(["Requested by Ana on 1 Oct."])
    expect(steps.slice(1).every(s => !s.happened.length && !s.reviews && !s.after.length && !s.actions.length)).toBe(true)
  })

  it("holds the pickup line and the step's buttons for work in progress, and says who is working on it", () => {
    const steps = journeyOutline(outline({ status: "in_progress" })).steps
    expect(steps[0]).toMatchObject({ state: "finished", reviews: true, after: [], actions: [] })
    expect(read(steps[0].happened)).toEqual(["Requested by Ana on 1 Oct."])
    expect(steps[1]).toMatchObject({ state: "current", happened: [null], after: ["Dev is working on this. Mark Done when the work is finished."] })
    // The reader's buttons, as the read journey will show them; handover shows only when available.
    expect(actionsOf(steps[1])).toEqual(["Close without a result"])
  })

  it("holds a refused button with its reason for a teammate who isn't the Requester", () => {
    expect(heldActions(outline({ status: "in_progress" }, { viewer: DEV }), "in_progress")).toEqual(["Close without a result: Only the Requester, Ana, can close this."])
  })

  it("holds no buttons for a Guest or a Viewer, who are offered none", () => {
    expect(outlineStep(outline({ status: "in_progress" }, { isGuest: true }), "in_progress").actions).toEqual([])
    expect(outlineStep(outline({ status: "in_progress" }, { readOnly: true }), "in_progress").actions).toEqual([])
  })

  it("holds the Done date and the release buttons at Done, and names the audience to release to", () => {
    expect(heldActions(outline({ status: "done" }), "done")).toEqual(["Record release", "Close without a result"])
    expect(outlineStep(outline({ status: "done" }), "done")).toMatchObject({
      state: "current", happened: [null],
      after: ["Record the release once the work reaches All shoppers. Anyone working on this Request can record it."],
    })
  })

  it("shows a release's saved evidence and fixed window, and holds who recorded it, the countdown and the Requester", () => {
    const fixed = { ...release, windowKind: "fixed" as const, startDate: "2026-10-22", dueDate: "2026-11-05" }
    expect(outlineStep(outline({ status: "done", releaseState: releaseState(fixed) }), "measuring")).toMatchObject({
      state: "current", happened: [null],
      after: ["Evidence: Feature flag at 100%", "Agreed fixed window: 22 Oct to 5 Nov. Release timing does not move these dates.", "The due date does not close this Request automatically.", null, null],
    })
    expect(heldActions(outline({ status: "done", releaseState: releaseState(fixed) }), "measuring")).toEqual(["Close Request: Opens on 5 Nov."])
    expect(moreOf(outlineStep(outline({ status: "done", releaseState: releaseState(fixed) }), "measuring"))).toEqual(["Close without a result", "Correct release", "Create follow-up Request", "Void incorrect release (set apart)"])
    const done = outlineStep(outline({ status: "done", releaseState: releaseState(release) }), "done")
    expect(done).toMatchObject({ state: "finished", happened: [null], after: [], actions: [] })
  })

  it("holds the value before release when one was recorded", () => {
    const state = releaseState(release)
    const withValue: ReleaseState = { ...state, history: state.history.map(e => ({ ...e, input: { ...e.input, valueBeforeRelease: { value: 40, unit: "%" } } })) as ReleaseState["history"] }
    expect(outlineStep(outline({ status: "done", releaseState: withValue }), "measuring").after).toEqual(["Evidence: Feature flag at 100%", null, "The due date does not close this Request automatically.", null, null])
  })

  it("shows why a Request closed without a result and what was learned, and holds who closed it", () => {
    const closure = { kind: "exception" as const, reasonCode: "rolled_back" as const, reason: "Broke Safari checkout", learned: "Test Safari first", actorId: "ana", closedAt: "2026-10-22T08:00:00Z", release: null }
    const steps = journeyOutline(outline({ status: "in_progress", exceptionClosure: closure })).steps
    expect(steps.map(s => [s.label, s.state])).toEqual([
      ["Open", "finished"], ["In progress", "finished"], ["Done", "skipped"], ["Measuring", "skipped"], ["Closed without a result", "current"],
    ])
    expect(steps[1]).toMatchObject({ happened: [null], after: [], actions: [] })
    expect(steps[2]).toMatchObject({ happened: [], after: [], actions: [] })
    expect(steps[4]).toMatchObject({
      happened: ["Closed without a result at In progress: Rolled back.", null],
      after: ["Broke Safari checkout", "What we learned: Test Safari first", "Closed Requests can’t be reopened."],
    })
    expect(actionsOf(steps[4])).toEqual(["Add correction"])
  })

  it("shows a measured close's evidence and observation dates, and holds who closed it and the results against the prediction", () => {
    const guardrail = { metric: "Refunds", operator: "lte", limit: 2, unit: "%", actual: 1 }
    const closure = { kind: "measured" as const, actorId: "ana", closedAt: "2026-10-29T08:00:00Z", release, primary: { kind: "numeric", actual: 46, unit: "%" }, guardrails: [guardrail], evidence: "Dashboard export", observedFrom: "2026-10-21", observedTo: "2026-10-28" }
    const steps = journeyOutline(outline({ status: "done", releaseState: releaseState(release), outcomeClosure: closure as unknown as TimelineInput["closure"] })).steps
    expect(steps[3]).toMatchObject({ state: "finished", happened: [null], after: ["Evidence: Feature flag at 100%"], actions: [] })
    expect(steps[4]).toMatchObject({
      label: "Closed", state: "current", happened: [null],
      after: [null, null, null, "Evidence: Dashboard export", "Observed 21 Oct to 28 Oct.", "Closed Requests can’t be reopened."],
    })
    expect(actionsOf(steps[4])).toEqual(["Add correction", "Create follow-up Request"])
  })

  it("holds the release history line once a release was recorded", () => {
    expect(journeyOutline(outline({ status: "done", releaseState: releaseState(release) })).history).toBe(true)
    expect(journeyOutline(outline({ status: "done" })).history).toBe(false)
  })
})
