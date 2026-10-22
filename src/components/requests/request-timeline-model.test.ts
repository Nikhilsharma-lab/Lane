import { describe, expect, it } from "vitest"
import { journeyActions, journeyStatus, type JourneyViewer } from "@/lib/request-journey"
import type { RequestStatus } from "@/lib/request-lifecycle"
import type { ReleaseFact, ReleaseState } from "@/lib/request-release"
import { timelineSteps, type TimelineInput, type TimelineStep } from "./request-timeline-model"

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
  const saved = { status: facts.status, releaseState: facts.releaseState ?? null, outcomeClosure: facts.outcomeClosure ?? null, exceptionClosure: facts.exceptionClosure ?? null, createdBy: "ana" }
  const closure = facts.outcomeClosure ?? facts.exceptionClosure ?? null
  return {
    journey: journeyStatus(saved), workStatus: facts.status, isGuest: viewer.role === "guest", audience: "All shoppers",
    requesterName: "Ana", requestedBy: "Ana", requestedAt: "2026-10-01T10:00:00Z",
    assigneeName: facts.status === "open" ? null : "Dev", doneAt: facts.status === "done" ? "2026-10-20T15:00:00Z" : null,
    release: facts.releaseState?.release ?? null, releaseHistory: facts.releaseState?.history ?? [], closure, names: NAMES,
    hasAgreedResult: true, now: NOW,
    actions: journeyActions(saved, viewer, { requesterName: "Ana", requesterActive }, NOW),
    ...more,
  }
}
const step = (steps: TimelineStep[], status: TimelineStep["status"]) => steps.find(s => s.status === status)!
const actionsOf = (s: TimelineStep) => s.actions.map(a => a.available ? a.label : `${a.label}: ${a.reason}`)

describe("Request timeline", () => {
  it("lists the five steps in order with the current one marked", () => {
    const steps = timelineSteps(input({ status: "in_progress" }, ANA))
    expect(steps.map(s => [s.label, s.state])).toEqual([
      ["Open", "finished"], ["In progress", "current"], ["Done", "upcoming"], ["Measuring", "upcoming"], ["Closed", "upcoming"],
    ])
  })

  it("says what happened, when and who on finished steps", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA))
    expect(step(steps, "open").happened).toEqual(["Requested by Ana on 1 Oct 2026."])
    expect(step(steps, "in_progress").happened).toEqual(["Picked up by Dev."])
    expect(step(steps, "done").happened).toEqual(["Marked Done on 20 Oct 2026."])
    expect(step(steps, "measuring").happened).toEqual(["Released to All shoppers on 21 Oct 2026, recorded by Dev."])
  })

  it("says what is next and who does it on the current step only", () => {
    const steps = timelineSteps(input({ status: "done" }, DEV))
    expect(step(steps, "done").next).toBe("Record the release once All shoppers has the work. Anyone working on this Request can record it.")
    expect(steps.filter(s => s.next).map(s => s.status)).toEqual(["done"])
    expect(step(timelineSteps(input({ status: "open" }, DEV)), "open").next).toBe("Waiting for someone to pick this up. Reviews are optional and never block pickup.")
    expect(step(timelineSteps(input({ status: "in_progress" }, DEV)), "in_progress").next).toBe("Dev is working on this. Mark Done when the work is finished.")
  })

  it("shows the countdown only in the current Measuring step", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA))
    expect(step(steps, "measuring").countdown).toBe("Result due 28 Oct 2026 · 3 days remaining")
    expect(steps.filter(s => s.countdown).map(s => s.status)).toEqual(["measuring"])
    expect(step(steps, "measuring").next).toBe("On 28 Oct 2026 the Requester, Ana, records the measured result and closes this Request.")
  })

  it("offers Close Request to the Requester, unavailable until the due date", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, ANA))
    expect(actionsOf(step(steps, "measuring"))).toEqual([
      "Close Request: Opens on 28 Oct 2026.", "Close without a result…", "Correct release", "Void incorrect release", "Create follow-up Request",
    ])
  })

  it("names the Requester when a teammate can't close", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, DEV))
    expect(actionsOf(step(steps, "measuring"))).toEqual([
      "Close Request: Only the Requester, Ana, can close this.", "Correct release", "Void incorrect release", "Create follow-up Request",
    ])
  })

  it("lets any member record the release at Done and keeps Close without a result with the Requester", () => {
    expect(actionsOf(step(timelineSteps(input({ status: "done" }, ANA)), "done"))).toEqual(["Record release", "Close without a result…"])
    expect(actionsOf(step(timelineSteps(input({ status: "done" }, DEV)), "done"))).toEqual(["Record release", "Close without a result…: Only the Requester, Ana, can close this."])
  })

  it("offers handover to an admin from pickup once the Requester has lost access, and hides it otherwise", () => {
    expect(actionsOf(step(timelineSteps(input({ status: "in_progress" }, ADMIN, {}, false)), "in_progress"))).toContain("Hand over to a new Requester")
    expect(actionsOf(step(timelineSteps(input({ status: "in_progress" }, ADMIN)), "in_progress")).join()).not.toContain("Hand over")
    expect(actionsOf(step(timelineSteps(input({ status: "in_progress" }, DEV, {}, false)), "in_progress")).join()).not.toContain("Hand over")
  })

  it("shows guests the timeline without actions or reasons", () => {
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release) }, GUEST))
    expect(steps.flatMap(s => s.actions)).toEqual([])
    expect(step(steps, "measuring").countdown).toBe("Result due 28 Oct 2026 · 3 days remaining")
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
    expect(step(steps, "closed").happened).toEqual(["Closed without a result at In progress: Rolled back.", "Closed by Ana on 22 Oct 2026."])
    expect(step(steps, "closed").next).toBe("Closed Requests never reopen.")
    expect(actionsOf(step(steps, "closed"))).toEqual(["Add correction"])
  })

  it("keeps the release on a measured closure and lets only the Requester correct it", () => {
    const closure = { kind: "measured" as const, actorId: "ana", closedAt: "2026-10-29T08:00:00Z", release }
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(release), outcomeClosure: closure }, DEV))
    expect(step(steps, "measuring").state).toBe("finished")
    expect(step(steps, "measuring").countdown).toBeNull()
    expect(step(steps, "measuring").happened).toEqual(["Released to All shoppers on 21 Oct 2026, recorded by Dev."])
    expect(step(steps, "closed").happened).toEqual(["Closed with a measured result by Ana on 29 Oct 2026."])
    expect(actionsOf(step(steps, "closed"))).toEqual(["Add correction: Only the Requester, Ana, can add a correction.", "Create follow-up Request"])
  })

  it("can't offer a measured close without an agreed result", () => {
    const due = { ...release, dueDate: "2026-10-25" }
    const steps = timelineSteps(input({ status: "done", releaseState: releaseState(due) }, ANA, { hasAgreedResult: false }))
    expect(actionsOf(step(steps, "measuring"))[0]).toBe("Close Request: There is no agreed Expected impact to measure against.")
  })
})
