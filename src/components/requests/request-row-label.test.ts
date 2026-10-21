import { describe, expect, it } from "vitest"
import { matchCountText, requestRowLabel } from "./request-row-label"
import type { OverviewRequest } from "@/lib/request-overview"

const request: OverviewRequest = {
  id: "a", requestNumber: 12, title: "Signup drops at the phone step", reframedProblem: null, status: "in_progress",
  createdAt: "2026-10-01T09:00:00.000Z", creatorName: "Alex Morgan", assigneeName: "Sam Lee", assignedTo: "sam",
  projectId: "p", projectName: "Website", requestType: "bug", priority: "high",
}

describe("requestRowLabel", () => {
  it("reads every value the row shows, without dates", () => {
    expect(requestRowLabel(request, { code: "LAN-12", priority: "high" })).toBe("LAN-12, Signup drops at the phone step. In Progress, High priority, Website, Bug, Assignee Sam Lee")
  })
  it("names empty values and leaves out an unset type", () => {
    expect(requestRowLabel({ ...request, status: "open", priority: undefined, projectId: null, projectName: null, requestType: null, assignedTo: null, assigneeName: null }, null))
      .toBe("Signup drops at the phone step. Open, No priority, No Project, No assignee")
  })
  it("prefers the reframed problem and the overlay's priority", () => {
    expect(requestRowLabel({ ...request, reframedProblem: "People cannot finish signup" }, { code: "LAN-12", priority: "urgent" }))
      .toBe("LAN-12, People cannot finish signup. In Progress, Urgent priority, Website, Bug, Assignee Sam Lee")
  })
  it("reads the concern marker only when a concern is open (#77)", () => {
    const concern = { name: "Priya", reason: "No API yet." }
    expect(requestRowLabel({ ...request, reviewState: { concerns: [concern, concern], unanswered: 1 } }, { code: "LAN-12", priority: "high" }))
      .toBe("LAN-12, Signup drops at the phone step. In Progress, High priority, Website, Bug, Assignee Sam Lee, 2 concerns")
    expect(requestRowLabel({ ...request, reviewState: { concerns: [], unanswered: 3 } }, { code: "LAN-12", priority: "high" }))
      .toBe("LAN-12, Signup drops at the phone step. In Progress, High priority, Website, Bug, Assignee Sam Lee")
  })
})

describe("matchCountText", () => {
  it("agrees in number", () => {
    expect(matchCountText(0)).toBe("0 Requests match")
    expect(matchCountText(1)).toBe("1 Request matches")
    expect(matchCountText(12)).toBe("12 Requests match")
  })
})
