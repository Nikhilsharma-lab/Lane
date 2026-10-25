import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { AppProviders } from "@/test/app-providers"
import type { RequestDetail } from "./detail-view"

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

const render = (readOnly: boolean) => renderToStaticMarkup(createElement(ToastStackProvider, null, createElement(AppProviders, null,
  createElement(RequestDetailPane, { request, comments: [], attachments: [], returnHref: "/", orgId: "org_test", isGuest: false, currentUserId: "user_reader", viewerName: "Robin", isAdmin: false, readOnly }))))

describe("a Request page for a Viewer (#210)", () => {
  it("reads in full, with no move, edit, delete or comment box, even on a Request they filed", () => {
    const member = render(false)
    const viewer = render(true)
    // The same Request, read by its creator as a Member: the controls are there, so their absence below means something.
    expect(member).toContain(">Pick up<")
    expect(member).toMatch(/aria-label="[^"]*[Cc]omment/)
    expect(member).toContain(`aria-label="Edit Request"`)
    expect(member).toContain(`aria-label="Delete Request"`)
    expect(member).toContain(`aria-label="Priority: `)

    expect(viewer).toContain("Checkout fails on mobile")
    expect(viewer).toContain("People can&#x27;t pay on phones.")
    expect(viewer).not.toContain(">Pick up<")
    expect(viewer).not.toMatch(/aria-label="[^"]*[Cc]omment/)
    expect(viewer).not.toContain(`aria-label="Edit Request"`)
    expect(viewer).not.toContain(`aria-label="Delete Request"`)
    expect(viewer).not.toContain(`aria-label="Priority: `)
  })
})
