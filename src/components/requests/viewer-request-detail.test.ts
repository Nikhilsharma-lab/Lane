import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { AppProviders } from "@/test/app-providers"
import type { RequestComment, RequestDetail } from "./detail-view"

// The page's islands render for real; only the router and the server actions they import are stand-ins.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/requests/request-1" }))
vi.mock("@/app/(app)/requests/[id]/actions", () => ({ addComment: vi.fn(), pickUpRequest: vi.fn(), markDone: vi.fn(), undoMarkDone: vi.fn(), setRequestPriority: vi.fn(), deleteRequest: vi.fn(), getAttachmentDownloadUrl: vi.fn() }))

import { RequestDetailPane } from "./request-detail-pane"

/** An Open Request the reader filed while they were still a Member. */
const request = {
  id: "request-1", requestNumber: 7, priority: "none", title: "Checkout fails on mobile", description: "People can't pay on phones.",
  affectedPeople: null, desiredChange: null, observedEvidence: null, uncertainty: null, usefulLink: null,
  reframedProblem: null, extractedSolution: null, classification: "problem", status: "open", assignedTo: null,
  createdBy: "user_reader", createdAt: new Date("2026-10-20T10:00:00Z"), creatorName: "Robin", assigneeName: null, assigneeAvatarUrl: null,
  agreementRevision: 1,
} as unknown as RequestDetail

const render = (readOnly: boolean, comments: RequestComment[] = []) => renderToStaticMarkup(createElement(ToastStackProvider, null, createElement(AppProviders, null,
  createElement(RequestDetailPane, { request, comments, attachments: [], returnHref: "/", orgId: "org_test", isGuest: false, currentUserId: "user_reader", viewerName: "Robin", isAdmin: false, readOnly }))))

describe("a Request page for a Viewer (#210)", () => {
  it("reads in full, with no move, edit, delete or comment box, even on a Request they filed", () => {
    const member = render(false)
    const viewer = render(true)
    // The same Request, read by its creator as a Member: the controls are there, so their absence below means something.
    expect(member).toContain(">Pick up<")
    expect(member).toMatch(/<textarea[^>]*aria-label="Comment"/)
    expect(member).toContain(`aria-label="Edit Request"`)
    expect(member).toContain(`aria-label="Delete Request"`)
    expect(member).toContain(`aria-label="Priority: `)

    expect(viewer).toContain("Checkout fails on mobile")
    expect(viewer).toContain("People can&#x27;t pay on phones.")
    expect(viewer).not.toContain(">Pick up<")
    expect(viewer).not.toMatch(/<textarea[^>]*aria-label="Comment"/)
    expect(viewer).not.toContain(`aria-label="Edit Request"`)
    expect(viewer).not.toContain(`aria-label="Delete Request"`)
    expect(viewer).not.toContain(`aria-label="Priority: `)
    // With no comments and no box, the conversation says it's empty rather than showing a bare heading.
    expect(viewer).toContain("No comments yet.")
    expect(member).toContain("No comments yet.")
  })
  it("renders saved comments through Arc without exposing unsupported thread mutations", () => {
    const comments = [{ id: "comment-1", authorName: "Robin", body: "The checkout problem is reproducible.", createdAt: new Date("2026-10-20T11:00:00Z") }]
    for (const readOnly of [true, false]) {
      const markup = render(readOnly, comments)
      const conversation = markup.match(/<section id="conversation"[\s\S]*?<\/section>/)?.[0]
      expect(conversation).toBeDefined()
      expect(conversation).toContain('aria-label="Comment by Robin"')
      expect(conversation).toContain("The checkout problem is reproducible.")
      expect(conversation).toContain('dateTime="2026-10-20T11:00:00.000Z"')
      expect(conversation).not.toMatch(/>(?:Reply|Edit|Delete|Resolve)<|aria-label="Add reaction"/)
      expect(conversation?.includes('<textarea')).toBe(!readOnly)
    }
  })

})
