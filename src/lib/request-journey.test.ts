import { describe, expect, it } from "vitest"
import type { ReleaseFact, ReleaseState } from "./request-release"
import { dueSignal, journeyActions, journeyStatus, remindersDue, type JourneyViewer } from "./request-journey"

const released: ReleaseFact = { exposureDate: "2026-10-21", audience: "All shoppers", evidence: "Rollout log", dueDate: "2026-10-28", startDate: "2026-10-21", windowKind: "relative" }
const releaseState = (release: ReleaseFact | null, ownerId = "requester"): ReleaseState => ({ version: 1, ownerId, release, history: [] })
const measured = { kind: "measured" }
const noResult = { kind: "exception" }

describe("journeyStatus", () => {
  // Every combination of work status × release × closure. Rows the database refuses still get a defined answer.
  const table = [
    ["open", null, null, null, "open", "Open"],
    ["open", released, null, null, "open", "Open"],
    ["open", null, measured, null, "closed", "Closed"],
    ["open", null, null, noResult, "closed", "Closed without a result"],
    ["in_progress", null, null, null, "in_progress", "In progress"],
    ["in_progress", released, null, null, "in_progress", "In progress"],
    ["in_progress", null, null, noResult, "closed", "Closed without a result"],
    ["in_progress", null, measured, null, "closed", "Closed"],
    ["done", null, null, null, "done", "Done"],
    ["done", released, null, null, "measuring", "Measuring"],
    ["done", released, measured, null, "closed", "Closed"],
    ["done", null, measured, null, "closed", "Closed"],
    ["done", released, null, noResult, "closed", "Closed without a result"],
    ["done", null, null, noResult, "closed", "Closed without a result"],
  ] as const
  it.each(table)("%s, release %o, measured %o, no result %o → %s (%s)", (status, release, outcomeClosure, exceptionClosure, expected, label) => {
    const journey = journeyStatus({ status, releaseState: releaseState(release), outcomeClosure, exceptionClosure })
    expect(journey).toEqual({ status: expected, label, withoutResult: label === "Closed without a result" })
  })
  it("reads a Request with no release record as not released", () => {
    expect(journeyStatus({ status: "done", releaseState: null, outcomeClosure: null, exceptionClosure: null }).status).toBe("done")
  })
  it("returns to Done after the release is voided", () => {
    expect(journeyStatus({ status: "done", releaseState: releaseState(null), outcomeClosure: null, exceptionClosure: null }).status).toBe("done")
  })
})

describe("dueSignal", () => {
  const measuring = { status: "done", releaseState: releaseState(released), outcomeClosure: null, exceptionClosure: null } as const
  // Due date 2026-10-28 (UTC). The signal changes at UTC midnight, like the measurement countdown.
  const table = [
    ["2026-10-24T12:00:00Z", { kind: "none" }],
    ["2026-10-24T23:59:59.999Z", { kind: "none" }],
    ["2026-10-25T00:00:00Z", { kind: "due_soon", days: 3, label: "Due in 3 days" }],
    ["2026-10-26T08:00:00Z", { kind: "due_soon", days: 2, label: "Due in 2 days" }],
    ["2026-10-27T23:59:59.999Z", { kind: "due_soon", days: 1, label: "Due in 1 day" }],
    ["2026-10-28T00:00:00Z", { kind: "due_today", days: 0, label: "Due today" }],
    ["2026-10-28T23:59:59.999Z", { kind: "due_today", days: 0, label: "Due today" }],
    ["2026-10-29T00:00:00Z", { kind: "overdue", days: 1, label: "Overdue 1 day" }],
    ["2026-11-07T10:00:00Z", { kind: "overdue", days: 10, label: "Overdue 10 days" }],
  ] as const
  it.each(table)("at %s reads %o", (now, signal) => {
    expect(dueSignal(measuring, new Date(now))).toEqual(signal)
  })
  it("shows nothing unless the Request is Measuring", () => {
    const overdueDay = new Date("2026-11-07T00:00:00Z")
    expect(dueSignal({ ...measuring, outcomeClosure: measured }, overdueDay)).toEqual({ kind: "none" })
    expect(dueSignal({ ...measuring, exceptionClosure: noResult }, overdueDay)).toEqual({ kind: "none" })
    expect(dueSignal({ ...measuring, releaseState: releaseState(null) }, overdueDay)).toEqual({ kind: "none" })
    expect(dueSignal({ ...measuring, status: "in_progress" }, overdueDay)).toEqual({ kind: "none" })
  })
})

describe("journeyActions", () => {
  const ok = { allowed: true }
  const no = (reason: string) => ({ allowed: false, reason })
  const requester: JourneyViewer = { id: "requester", role: "member", active: true }
  const teammate: JourneyViewer = { id: "teammate", role: "member", active: true }
  const admin: JourneyViewer = { id: "admin", role: "admin", active: true }
  const guest: JourneyViewer = { id: "guest", role: "guest", active: true }
  const people = { requesterName: "Asha", requesterActive: true }
  const base = { createdBy: "requester", releaseState: null, outcomeClosure: null, exceptionClosure: null }
  const open = { ...base, status: "open" } as const
  const inProgress = { ...base, status: "in_progress" } as const
  const done = { ...base, status: "done" } as const
  const measuring = { ...base, status: "done", releaseState: releaseState(released) } as const
  const closed = { ...measuring, outcomeClosure: measured } as const
  const closedEarly = { ...inProgress, exceptionClosure: noResult } as const
  const beforeDue = new Date("2026-10-27T23:59:59Z")
  const dueDay = new Date("2026-10-28T00:00:00Z")

  it("lets any active non-guest member record, correct and void a release while Done or Measuring", () => {
    for (const viewer of [requester, teammate, admin]) {
      expect(journeyActions(done, viewer, people, beforeDue)).toMatchObject({ release: ok, correctRelease: no("There is no release to correct yet."), voidRelease: no("There is no release to void yet.") })
      expect(journeyActions(measuring, viewer, people, beforeDue)).toMatchObject({ release: no("The release is already recorded."), correctRelease: ok, voidRelease: ok })
    }
  })
  it("keeps release closed before Done and after closure", () => {
    for (const facts of [open, inProgress]) expect(journeyActions(facts, teammate, people, beforeDue)).toMatchObject({ release: no("Opens once the work is Done."), correctRelease: no("Opens once the work is Done."), voidRelease: no("Opens once the work is Done.") })
    for (const facts of [closed, closedEarly]) expect(journeyActions(facts, requester, people, beforeDue)).toMatchObject({ release: no("This Request is closed."), correctRelease: no("This Request is closed."), voidRelease: no("This Request is closed.") })
  })
  it("lets only the Requester close, naming them to everyone else", () => {
    expect(journeyActions(measuring, requester, people, dueDay)).toMatchObject({ close: ok, closeWithoutResult: ok })
    for (const viewer of [teammate, admin]) {
      expect(journeyActions(measuring, viewer, people, dueDay)).toMatchObject({ close: no("Only the Requester, Asha, can close this."), closeWithoutResult: no("Only the Requester, Asha, can close this.") })
    }
  })
  it("opens measured closure on the due date (UTC) and says when", () => {
    expect(journeyActions(measuring, requester, people, beforeDue).close).toEqual({ allowed: false, reason: "Opens on 28 Oct 2026.", opensOn: "2026-10-28" })
    for (const facts of [open, inProgress, done]) expect(journeyActions(facts, requester, people, dueDay).close).toEqual(no("Opens once the release is recorded and the result is due."))
  })
  it("lets the Requester close without a result at any point after pickup", () => {
    expect(journeyActions(open, requester, people, dueDay).closeWithoutResult).toEqual(no("Opens once the work is picked up."))
    for (const facts of [inProgress, done, measuring]) expect(journeyActions(facts, requester, people, dueDay).closeWithoutResult).toEqual(ok)
    expect(journeyActions(closed, requester, people, dueDay)).toMatchObject({ close: no("This Request is closed."), closeWithoutResult: no("This Request is closed.") })
  })
  it("lets only the Requester add corrections, and only once closed", () => {
    for (const facts of [closed, closedEarly]) {
      expect(journeyActions(facts, requester, people, dueDay).correctClosure).toEqual(ok)
      expect(journeyActions(facts, teammate, people, dueDay).correctClosure).toEqual(no("Only the Requester, Asha, can add a correction."))
    }
    expect(journeyActions(measuring, requester, people, dueDay).correctClosure).toEqual(no("Corrections open once the Request is closed."))
  })
  it("follows the current Requester after a handover; the former Requester loses close rights", () => {
    const handedOver = { ...measuring, releaseState: releaseState(released, "teammate") }
    const next = { requesterName: "Ravi", requesterActive: true }
    expect(journeyActions(handedOver, teammate, next, dueDay)).toMatchObject({ close: ok, closeWithoutResult: ok })
    expect(journeyActions(handedOver, requester, next, dueDay)).toMatchObject({ close: no("Only the Requester, Ravi, can close this.") })
  })
  it("lets an admin hand over from pickup onwards, only once the Requester has lost access", () => {
    const gone = { requesterName: "Asha", requesterActive: false }
    for (const facts of [inProgress, done, measuring, closed, closedEarly]) expect(journeyActions(facts, admin, gone, dueDay).handover).toEqual(ok)
    expect(journeyActions(open, admin, gone, dueDay).handover).toEqual(no("Handover opens once the work is picked up."))
    expect(journeyActions(inProgress, admin, people, dueDay).handover).toEqual(no("Asha still has workspace access."))
    expect(journeyActions(inProgress, teammate, gone, dueDay).handover).toEqual(no("Only a workspace admin can hand this over."))
  })
  it("offers a follow-up Request to any active member once the work was released, even after closure", () => {
    for (const viewer of [requester, teammate, admin]) {
      expect(journeyActions(measuring, viewer, people, dueDay).followUp).toEqual(ok)
      expect(journeyActions(closed, viewer, people, dueDay).followUp).toEqual(ok)
    }
    for (const facts of [inProgress, done, closedEarly]) expect(journeyActions(facts, teammate, people, dueDay).followUp).toEqual(no("Opens once the work is released."))
    const releasedThenClosedWithoutResult = { ...measuring, exceptionClosure: { kind: "exception", release: released } }
    expect(journeyActions(releasedThenClosedWithoutResult, teammate, people, dueDay).followUp).toEqual(ok)
  })
  it("gives a guest, even the Requester, no actions", () => {
    const guestRequester = { ...measuring, createdBy: "guest" }
    const actions = journeyActions(guestRequester, guest, people, dueDay)
    for (const action of Object.values(actions)) expect(action).toEqual(no("Guests can follow this Request but can’t change it."))
  })
  it("gives someone whose workspace access has ended no actions", () => {
    const actions = journeyActions(measuring, { ...requester, active: false }, people, dueDay)
    for (const action of Object.values(actions)) expect(action).toEqual(no("Your workspace membership is no longer active."))
  })
})

describe("remindersDue", () => {
  const active = new Set(["requester", "builder", "teammate"])
  const doneAt = new Date("2026-10-10T15:00:00Z")
  const base = { createdBy: "requester", assignedTo: "builder", doneAt, outcomeClosure: null, exceptionClosure: null }
  const done = { ...base, status: "done", releaseState: null } as const
  const measuring = { ...base, status: "done", releaseState: releaseState(released) } as const
  const on = (day: string) => new Date(day + "T09:00:00Z")

  // Release reminder: to the assignee 3 days after Done, then weekly while still Done. Each reminder belongs
  // to the day it was scheduled; opening Lane later that week still finds it (written once, keyed by `day`).
  it.each([
    ["2026-10-12", []],
    ["2026-10-13", [{ kind: "release_reminder", recipientId: "builder", day: "2026-10-13" }]],
    ["2026-10-19", [{ kind: "release_reminder", recipientId: "builder", day: "2026-10-13" }]],
    ["2026-10-20", [{ kind: "release_reminder", recipientId: "builder", day: "2026-10-20" }]],
  ])("on %s a Done Request owes %o", (day, expected) => {
    expect(remindersDue(done, on(day), active)).toEqual(expected)
  })

  // Due date 2026-10-28. Due soon 3 days before, due on the day, overdue from the next day then weekly.
  it.each([
    ["2026-10-24", []],
    ["2026-10-25", [{ kind: "result_due_soon", recipientId: "requester", day: "2026-10-25" }]],
    ["2026-10-27", [{ kind: "result_due_soon", recipientId: "requester", day: "2026-10-25" }]],
    ["2026-10-28", [{ kind: "result_due", recipientId: "requester", day: "2026-10-28" }]],
    ["2026-10-29", [{ kind: "result_overdue", recipientId: "requester", day: "2026-10-29" }]],
    ["2026-11-04", [{ kind: "result_overdue", recipientId: "requester", day: "2026-10-29" }]],
    ["2026-11-05", [{ kind: "result_overdue", recipientId: "requester", day: "2026-11-05" }]],
  ])("on %s a Measuring Request owes %o", (day, expected) => {
    expect(remindersDue(measuring, on(day), active)).toEqual(expected)
  })

  it("stops after close, with or without a result", () => {
    for (const closure of [{ outcomeClosure: measured }, { exceptionClosure: noResult }]) {
      expect(remindersDue({ ...measuring, ...closure }, on("2026-11-05"), active)).toEqual([])
      expect(remindersDue({ ...done, ...closure }, on("2026-10-20"), active)).toEqual([])
    }
  })
  it("stops after the release is voided", () => {
    const voided: ReleaseState = { version: 1, ownerId: "requester", release: null, history: [{ operationId: "op", fingerprint: "f", actorId: "teammate", at: "2026-10-26T00:00:00Z", input: { kind: "void", reason: "Only staging", neverExposed: true }, previousRelease: released, release: null, previousOwnerId: "requester", ownerId: "requester", revision: 2 }] }
    expect(remindersDue({ ...done, releaseState: voided }, on("2026-11-05"), active)).toEqual([])
  })
  it("goes to the new Requester after a handover, never the former one", () => {
    const handedOver = { ...measuring, releaseState: releaseState(released, "teammate") }
    expect(remindersDue(handedOver, on("2026-10-28"), active)).toEqual([{ kind: "result_due", recipientId: "teammate", day: "2026-10-28" }])
  })
  it("never goes to a guest or anyone without active access", () => {
    const guestRequester = { ...measuring, createdBy: "guest", releaseState: releaseState(released, "guest") }
    expect(remindersDue(guestRequester, on("2026-10-28"), active)).toEqual([])
    expect(remindersDue(done, on("2026-10-13"), new Set(["requester"]))).toEqual([])
  })
  it("owes nothing before Done, without an assignee, or without a Done time", () => {
    expect(remindersDue({ ...done, status: "in_progress" }, on("2026-10-20"), active)).toEqual([])
    expect(remindersDue({ ...done, assignedTo: null }, on("2026-10-20"), active)).toEqual([])
    expect(remindersDue({ ...done, doneAt: null }, on("2026-10-20"), active)).toEqual([])
  })
})
