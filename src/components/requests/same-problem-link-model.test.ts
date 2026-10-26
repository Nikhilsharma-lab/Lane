import { describe, expect, it } from "vitest"
import type { WorkspaceSearchRequest } from "@/lib/workspace-search"
import { linkCandidates } from "./same-problem-link-model"

// The Requests "Link a Request" offers (#218): search results, minus the Request itself and those already in its group.

const found = (id: string, requestNumber: number, over: Partial<WorkspaceSearchRequest> = {}): WorkspaceSearchRequest => ({
  id, requestNumber, title: `Request ${requestNumber}`, reframedProblem: null, status: "open", projectId: null, projectName: null, requestType: null, createdAt: "2026-10-01T00:00:00.000Z", ...over,
})

describe("Requests to link", () => {
  it("offers search results in order, with their code and status, at any status including Closed", () => {
    expect(linkCandidates([found("a", 3), found("b", 7, { status: "closed", withoutResult: true }), found("c", 9, { status: "closed" })], { requestId: "x", linkedIds: [] })).toEqual([
      { requestId: "a", code: "LAN-3", title: "Request 3", status: "Open" },
      { requestId: "b", code: "LAN-7", title: "Request 7", status: "Closed without a result" },
      { requestId: "c", code: "LAN-9", title: "Request 9", status: "Closed" },
    ])
  })

  it("leaves out the Request itself and the ones already in its group", () => {
    expect(linkCandidates([found("x", 1), found("a", 2), found("b", 3)], { requestId: "x", linkedIds: ["x", "b"] }).map(candidate => candidate.code)).toEqual(["LAN-2"])
  })
})
