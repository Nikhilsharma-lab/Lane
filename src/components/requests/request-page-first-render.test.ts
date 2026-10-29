import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { AppProviders } from "@/test/app-providers"
import type { RequestDetail } from "./detail-view"

// #295: what the Request page draws before the Journey's, the Reviewers' and the Iterations' reads arrive. Those reads
// can take a second (the Journey's ask Clerk), so the first render holds their shape and Conversation does not move.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/requests/request-1" }))
vi.mock("@/app/(app)/requests/[id]/actions", () => ({ addComment: vi.fn(), pickUpRequest: vi.fn(), markDone: vi.fn(), undoMarkDone: vi.fn(), setRequestPriority: vi.fn(), deleteRequest: vi.fn(), getAttachmentDownloadUrl: vi.fn() }))

import { RequestDetailPane } from "./request-detail-pane"

const open = {
  id: "request-1", requestNumber: 7, priority: "none", title: "Checkout fails on mobile", description: "People can't pay on phones.",
  affectedPeople: null, desiredChange: null, observedEvidence: null, uncertainty: null, usefulLink: null,
  reframedProblem: null, extractedSolution: null, classification: "problem", status: "open", assignedTo: null,
  createdBy: "user_reader", createdAt: new Date("2026-10-20T10:00:00Z"), creatorName: "Robin", assigneeName: null, assigneeAvatarUrl: null,
  agreementRevision: 1, reviewerOutline: [],
} as unknown as RequestDetail
const inProgress = { ...open, status: "in_progress", assignedTo: "user_dev", assigneeName: "Dev" } as RequestDetail

const render = (request: RequestDetail, reader: { readOnly?: boolean; isGuest?: boolean } = {}) => renderToStaticMarkup(createElement(ToastStackProvider, null, createElement(AppProviders, null,
  createElement(RequestDetailPane, { request, comments: [], attachments: [], returnHref: "/", orgId: "org_test", isGuest: reader.isGuest ?? false, currentUserId: "user_reader", viewerName: "Robin", isAdmin: false, readOnly: reader.readOnly ?? false }))))
const section = (markup: string, id: string) => markup.match(new RegExp(`<section id="${id}"[\\s\\S]*?</section>`))?.[0] ?? ""
/** The Journey's section, up to the end of its steps (the reviewers' section nests inside it). */
const journey = (markup: string) => markup.slice(markup.indexOf('<section id="journey"'), markup.indexOf("</ol>", markup.indexOf('<section id="journey"')))
const text = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")

describe("the Request page before its reads arrive (#295)", () => {
  it("draws the Journey's five steps from the Request, who asked and when, and what is next", () => {
    const shown = journey(render(open))
    expect(text(shown)).toMatch(/Open .*In progress .*Done .*Measuring .*Closed/)
    expect(text(shown)).toContain("Requested by Robin on 20 Oct 2026.")
    expect(text(shown)).toContain("Waiting for someone to pick this up. Reviews are optional and never block pickup.")
    expect(shown).toMatch(/<li[^>]*data-state="current"[^>]*aria-current="step"[^>]*>[\s\S]*?Open/)
    // Screen readers still hear that it is loading; the Requester's name is held until it arrives.
    expect(shown).toMatch(/role="status"[^>]*>Loading journey…/)
    expect(shown).toMatch(/Requester: <span[^>]*data-pending/)
  })

  it("holds a follow-up's \"Follow-up of\" line above the steps until its code and title arrive", () => {
    const above = (markup: string) => markup.slice(markup.indexOf('<section id="journey"'), markup.indexOf("<ol", markup.indexOf('<section id="journey"')))
    expect(above(render({ ...open, followUpOf: "request-0" } as RequestDetail))).toContain("data-pending")
    expect(above(render(open))).not.toMatch(/<p[^>]*data-pending/)
  })

  it("starts the Reviewers in the Open step straight away, holding the Optional line and Add reviewer's height", () => {
    const reviewers = section(render(open), "reviewers")
    expect(text(reviewers)).toContain("Optional. People who should look at this before work starts.")
    expect(text(reviewers)).toContain("Loading reviewers…")
    expect(reviewers).toMatch(/data-holds-button/)
    // Each saved reviewer's row is held, with its Remove button for the Request's creator and a line for a concern's reason.
    const reviewerOutline = [{ note: false, concern: true, mine: false }, { note: false, concern: false, mine: false }]
    const twoReviewers = section(render({ ...open, reviewerOutline } as RequestDetail), "reviewers")
    expect(twoReviewers.match(/<li[^>]*data-pending/g)).toHaveLength(2)
    expect(twoReviewers.match(/data-held-button/g)).toHaveLength(2)
    expect(twoReviewers.match(/data-held-line/g)).toHaveLength(1)
    // Someone else's Request: no Remove, so only the reader's own review holds its Looks good and Raise a concern.
    const othersRequest = { ...open, createdBy: "user_someone", reviewerOutline: [{ note: true, concern: false, mine: true }, { note: false, concern: false, mine: false }] } as RequestDetail
    const asked = section(render(othersRequest), "reviewers")
    expect(asked.match(/data-held-button/g)).toHaveLength(1)
    expect(asked.match(/data-held-line/g)).toHaveLength(1)
    // A Viewer can't add anyone, so no button's height is held.
    expect(section(render(open, { readOnly: true }), "reviewers")).not.toMatch(/data-holds-button/)
  })

  it("holds a row of buttons on the current step for a Member, and none for a Viewer", () => {
    expect(journey(render(inProgress))).toMatch(/aria-current="step"[\s\S]*data-pending="actions"/)
    expect(text(journey(render(inProgress)))).toContain("Dev is working on this. Mark Done when the work is finished.")
    expect(journey(render(inProgress, { readOnly: true }))).not.toContain('data-pending="actions"')
  })

  it("holds the Iterations at the height of their empty state, with room for Link a Request", () => {
    const iterations = section(render(open), "iterations")
    expect(iterations).toMatch(/role="status"[^>]*>Loading Iterations…/)
    expect(iterations).toMatch(/aria-hidden="true"[^>]*>No other Request is linked as Same problem yet. Link Requests that tackle the same problem to see each attempt and its result together.</)
    expect(iterations).toMatch(/data-holds-button/)
    // A Viewer sees the section only when the Request is linked, which is rare: nothing is held for them.
    expect(section(render(open, { readOnly: true }), "iterations")).toBe("")
  })
})
