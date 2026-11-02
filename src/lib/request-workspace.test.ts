import { describe, expect, it } from "vitest"
import { REQUEST_STATUS_FILTER_LABELS, REQUEST_TITLE_FILTER_MAX, changesListInPlace, hasRequestListContext, parseRequestListContext, parseRequestProjectFilter, parseRequestStatusFilter, requestDetailHref, requestListContextFromHref, requestListHref } from "./request-workspace"
import { JOURNEY_STATUSES } from "./request-journey"
import { TITLE_MAX } from "./request-schema"

describe("status views (#133)", () => {
  it("offers each journey status under its glossary label, plus Due soon or overdue", () => {
    for (const { status, label } of JOURNEY_STATUSES) expect(REQUEST_STATUS_FILTER_LABELS[status]).toBe(label)
    expect(REQUEST_STATUS_FILTER_LABELS.due).toBe("Due soon or overdue")
  })
  it("reads each view from the URL and links to it", () => {
    for (const view of ["measuring", "closed", "due"] as const) {
      expect(parseRequestStatusFilter(view)).toBe(view)
      expect(requestListHref(view)).toBe(`/?status=${view}`)
    }
    expect(parseRequestStatusFilter("archived")).toBe("all")
  })
})

describe("changesListInPlace", () => {
  it("changes the list in place only on / and only for a Requests list link", () => {
    expect(changesListInPlace("/", "/?project=none")).toBe(true)
    expect(changesListInPlace("/", "/")).toBe(true)
    expect(changesListInPlace("/intake", "/?project=none")).toBe(false)
    expect(changesListInPlace("/requests/r1", "/")).toBe(false)
    expect(changesListInPlace("/", "/settings/profile")).toBe(false)
    expect(changesListInPlace("/", "/requests/r1")).toBe(false)
  })
})

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

describe("the title filter in the list address (A214)", () => {
  it("sits beside status and Project, and is left out when empty", () => {
    expect(requestListHref("open", projectId, "checkout button")).toBe(`/?status=open&project=${projectId}&title=checkout+button`)
    expect(requestListHref("all", "all", "")).toBe("/")
    expect(requestListHref("all", "all", "   ")).toBe("/")
  })

  it("is read back from the address, as typed, and absent reads as no title", () => {
    expect(parseRequestListContext(new URLSearchParams("status=open&title=Checkout%20button"))).toEqual({ status: "open", project: "all", title: "Checkout button" })
    expect(parseRequestListContext(new URLSearchParams("status=open"))).toEqual({ status: "open", project: "all", title: "" })
    expect(hasRequestListContext(new URLSearchParams("title=checkout"))).toBe(true)
  })

  it("is cut to the longest Request title", () => {
    expect(parseRequestListContext(new URLSearchParams(`title=${"a".repeat(250)}`)).title).toBe("a".repeat(REQUEST_TITLE_FILTER_MAX))
    expect(REQUEST_TITLE_FILTER_MAX).toBe(TITLE_MAX)
  })

  it("names a title from a link only when the link has one, so a Project link keeps the title being typed", () => {
    expect(requestListContextFromHref("/?title=checkout")).toEqual({ status: "all", project: "all", title: "checkout" })
    expect(requestListContextFromHref(`/?project=${projectId}`)).toEqual({ status: "all", project: projectId })
  })
})
