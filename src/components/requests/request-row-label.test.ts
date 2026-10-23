import { describe, expect, it } from "vitest"
import { matchCountText, requestRowLabel } from "./request-row-label"
import type { OverviewRequest } from "@/lib/request-overview"
import type { ReleaseState } from "@/lib/request-release"

// A Request released with its result due on `dueDate` (UTC), still Measuring.
const releasedDue = (dueDate: string): ReleaseState => ({ version: 1, ownerId: "alex", history: [], release: { exposureDate: "2026-10-01", audience: "All shoppers", evidence: "Rollout log", dueDate, startDate: "2026-10-01", windowKind: "relative" } })
const now = new Date("2026-10-28T12:00:00Z")

const request: OverviewRequest = {
  id: "a", requestNumber: 12, title: "Signup drops at the phone step", reframedProblem: null, status: "in_progress",
  createdAt: "2026-10-01T09:00:00.000Z", creatorName: "Alex Morgan", assigneeName: "Sam Lee", assignedTo: "sam",
  projectId: "p", projectName: "Website", requestType: "bug", priority: "high",
}

describe("requestRowLabel", () => {
  it("reads every value the row shows, without dates", () => {
    expect(requestRowLabel(request, { code: "LAN-12", priority: "high" })).toBe("LAN-12, Signup drops at the phone step. In progress, High priority, Website, Bug, Assignee Sam Lee")
  })
  it("names empty values and leaves out an unset type", () => {
    expect(requestRowLabel({ ...request, status: "open", priority: undefined, projectId: null, projectName: null, requestType: null, assignedTo: null, assigneeName: null }, null))
      .toBe("Signup drops at the phone step. Open, No priority, No Project, No assignee")
  })
  it("prefers the reframed problem and the overlay's priority", () => {
    expect(requestRowLabel({ ...request, reframedProblem: "People cannot finish signup" }, { code: "LAN-12", priority: "urgent" }))
      .toBe("LAN-12, People cannot finish signup. In progress, Urgent priority, Website, Bug, Assignee Sam Lee")
  })
  it("reads the concern marker only on an Open Request with a concern open (#77)", () => {
    const concern = { name: "Priya", reason: "No API yet." }
    const open = { ...request, status: "open" as const, assignedTo: null, assigneeName: null }
    expect(requestRowLabel({ ...open, reviewState: { concerns: [concern, concern], unanswered: 1 } }, { code: "LAN-12", priority: "high" }))
      .toBe("LAN-12, Signup drops at the phone step. Open, High priority, Website, Bug, No assignee, 2 concerns")
    expect(requestRowLabel({ ...open, reviewState: { concerns: [], unanswered: 3 } }, { code: "LAN-12", priority: "high" }))
      .toBe("LAN-12, Signup drops at the phone step. Open, High priority, Website, Bug, No assignee")
    expect(requestRowLabel({ ...request, reviewState: { concerns: [concern], unanswered: 0 } }, { code: "LAN-12", priority: "high" }))
      .toBe("LAN-12, Signup drops at the phone step. In progress, High priority, Website, Bug, Assignee Sam Lee")
  })
})

describe("requestRowLabel on the journey (#133)", () => {
  const done = { ...request, status: "done" as const }
  it("reads the one journey status: Done, Measuring, Closed or Closed without a result", () => {
    expect(requestRowLabel(done, null, undefined, now)).toBe("Signup drops at the phone step. Done, High priority, Website, Bug, Assignee Sam Lee")
    expect(requestRowLabel({ ...done, releaseState: releasedDue("2026-11-20") }, null, undefined, now)).toBe("Signup drops at the phone step. Measuring, High priority, Website, Bug, Assignee Sam Lee")
    expect(requestRowLabel({ ...done, releaseState: releasedDue("2026-10-20"), outcomeClosure: { kind: "measured" } }, null, undefined, now)).toBe("Signup drops at the phone step. Closed, High priority, Website, Bug, Assignee Sam Lee")
    expect(requestRowLabel({ ...request, exceptionClosure: { kind: "exception" } }, null, undefined, now)).toBe("Signup drops at the phone step. Closed without a result, High priority, Website, Bug, Assignee Sam Lee")
  })
  it("reads the due tag's words after the status", () => {
    const due = (dueDate: string) => requestRowLabel({ ...done, releaseState: releasedDue(dueDate) }, null, undefined, now)
    expect(due("2026-10-31")).toBe("Signup drops at the phone step. Measuring, Due in 3 days, High priority, Website, Bug, Assignee Sam Lee")
    expect(due("2026-10-29")).toBe("Signup drops at the phone step. Measuring, Due in 1 day, High priority, Website, Bug, Assignee Sam Lee")
    expect(due("2026-10-28")).toBe("Signup drops at the phone step. Measuring, Due today, High priority, Website, Bug, Assignee Sam Lee")
    expect(due("2026-10-26")).toBe("Signup drops at the phone step. Measuring, Overdue 2 days, High priority, Website, Bug, Assignee Sam Lee")
    expect(due("2026-11-01")).toBe("Signup drops at the phone step. Measuring, High priority, Website, Bug, Assignee Sam Lee")
  })
})

describe("matchCountText", () => {
  it("agrees in number", () => {
    expect(matchCountText(0)).toBe("0 Requests match")
    expect(matchCountText(1)).toBe("1 Request matches")
    expect(matchCountText(12)).toBe("12 Requests match")
  })
})
