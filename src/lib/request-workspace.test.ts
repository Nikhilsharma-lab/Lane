import { describe, expect, it } from "vitest"
import { parseRequestProjectFilter, requestDetailHref, requestListHref } from "./request-workspace"

const projectId = "00000000-0000-4000-8000-000000000002"

describe("Request navigation context", () => {
  it("keeps status-only and unfiltered links compatible", () => {
    expect(requestListHref("all")).toBe("/")
    expect(requestListHref("open")).toBe("/?status=open")
    expect(requestDetailHref("request-1", "done")).toBe("/requests/request-1?status=done")
  })

  it("preserves Project across list and detail navigation with a status filter", () => {
    expect(requestListHref("in_progress", projectId)).toBe(`/?status=in_progress&project=${projectId}`)
    expect(requestDetailHref("request-1", "in_progress", projectId)).toBe(`/requests/request-1?status=in_progress&project=${projectId}`)
    expect(requestListHref("all", projectId)).toBe(`/?project=${projectId}`)
    expect(requestDetailHref("request-1", "all", "none")).toBe("/requests/request-1?project=none")
  })

  it("defaults only absent Project context and leaves invalid IDs for guarded rejection", () => {
    expect(parseRequestProjectFilter(undefined)).toBe("all")
    expect(parseRequestProjectFilter("none")).toBe("none")
    expect(parseRequestProjectFilter([projectId, "none"])).toBe(projectId)
    expect(parseRequestProjectFilter("invalid-id")).toBe("invalid-id")
  })

  it("normalizes UUID casing so client matching agrees with the database", () => {
    expect(parseRequestProjectFilter("AE000000-0000-4000-8000-000000000002")).toBe("ae000000-0000-4000-8000-000000000002")
  })
})
