import { createElement, type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"

// Isolate external session/database boundaries; render the real workspace.
const state = vi.hoisted(() => ({ role: "admin", rows: [] as object[], search: "" }))
// Plan item 1.7: the status view and Project filter come from the URL in the browser, through the layout's list view state.
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams(state.search), redirect: vi.fn() }))
// Plan item 1.8: the workspace reads through src/lib/data (server-only). Vitest cannot resolve Next's
// "server-only" marker, and the page now derives identity from claims (getMember) before it queries.
vi.mock("server-only", () => ({}))
// Every reviewer below is still in the workspace, so each answer counts.
vi.mock("@/lib/workspace-roster", () => ({ workspaceRoster: async () => [{ nominee: { kind: "member", userId: "user-priya" } }, { nominee: { kind: "member", userId: "user-sam" } }], pendingInvitations: async () => [] }))
vi.mock("@/lib/ensure-workspace", () => ({
  getMember: async () => ({ userId: "user_test", orgId: "org_test", role: state.role }),
  getWorkspace: async () => ({ needsOnboarding: false, role: state.role, profileRole: "pm", orgId: "org_test", userId: "user_test", workspaceName: "Studio", fullName: "Alex", email: "alex@example.com" }),
}))
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema")
  const query = {
    from: () => query, leftJoin: () => query, where: () => query,
    orderBy: () => query, limit: () => query, unionAll: async () => state.rows,
  }
  return { ...schema, db: { select: () => query } }
})
vi.mock("./requests/[id]/comment-form", () => ({ CommentForm: () => null }))
vi.mock("./requests/[id]/attachment-download", () => ({ AttachmentDownload: () => null }))
vi.mock("./requests/[id]/lifecycle-buttons", () => ({ LifecycleButtons: () => null }))
vi.mock("./request-workspace-keyboard", () => ({ RequestWorkspaceKeyboard: () => null }))
// Deep-link rendering includes this unrelated client filter; the overview uses its real toolbar.

import { RequestsWorkspace } from "./requests-workspace"
import { WorkspaceProjectsProvider } from "@/components/projects/workspace-projects-provider"
import { RequestDetailWorkspace } from "./request-detail-workspace"
import { RequestListViewProvider } from "@/components/requests/list-view-state"

// The root layout always supplies the toast stack that row actions report errors through,
// and the (app) layout the list view state.
// The (app) layout's providers, as the page always has them.
const wrap = (page: ReactElement) => renderToStaticMarkup(createElement(ToastStackProvider, null, createElement(RequestListViewProvider, null, createElement(WorkspaceProjectsProvider, { orgId: "org_test", initialProjects: [] }, page))))
const render = async (search = "") => {
  state.search = search
  return wrap(await RequestsWorkspace())
}

const intakeLinksOf = (html: string) => html.match(/<a [^>]*href="\/intake"[^>]*>/g) ?? []
const isInert = (tag: string) => /\binert=""/.test(tag)

describe("Requests first-use landing", () => {
  // Plan item 2.1: an empty workspace renders the list's own strip and toolbar
  // row with the welcome in its records region, so the first Request lands in place.
  it.each(["admin", "member", "guest"])("gives an empty %s workspace the list's frame with the welcome inside it", async (role) => {
    state.role = role
    state.rows = []
    const html = await render()
    expect(html.match(/data-slot="page-strip"/g)).toHaveLength(1)
    expect(html).toMatch(new RegExp(`<h1[^>]*>${role === "guest" ? "My Requests" : "Requests"}</h1>`))
    expect(html).toContain("data-requests-welcome")
    expect(html).toContain('data-slot="requests-toolbar"')
    expect(html).toContain("data-empty-workspace")
    // The 2026-09-29 rule stands: nothing to filter in a truly empty workspace.
    expect(html).not.toContain("Filter Requests by title")
    expect(html).not.toContain("Active filters")
    expect(html).not.toContain("Select a Request")
    // Exactly one Intake link (docs/superpowers/plans/2026-09-29-requests-welcome.md):
    // the welcome's. The strip's keeps its box for the first Request, but inert
    // (hidden by CSS), so it is neither reachable nor announced.
    const intakeLinks = intakeLinksOf(html)
    expect(intakeLinks.filter(link => !isInert(link))).toHaveLength(1)
    expect(html).toMatch(/data-requests-welcome[\s\S]*<a [^>]*href="\/intake"/)
    expect(intakeLinks.filter(isInert)).toHaveLength(1)
    expect(html).toMatch(/data-slot="page-strip"[\s\S]*<a (?=[^>]*\binert="")[^>]*href="\/intake"[\s\S]*data-requests-welcome/)
    expect(html.includes('href="/settings/members"')).toBe(role === "admin")
    expect(html).toContain("to create a Request.")
    expect(html).toMatch(/<kbd[^>]*>C<\/kbd> to create a Request\./)
    expect(html).not.toContain("min-h-dvh")
    if (role === "guest") {
      // The strip's note (above 640px) and the body line say different things.
      expect(html).toContain("Only Requests you submit appear here.")
      expect(html).toContain("Create a Request and follow it here.")
      expect(html).not.toMatch(/(?<!Only )Requests you submit appear here/)
    } else {
      expect(html).toContain("Create a Request for your team to review and pick up.")
    }
  })

  it("keeps the welcome for a filtered view of an empty workspace", async () => {
    state.role = "member"
    state.rows = []
    const html = await render("status=done")
    expect(html).toContain("data-requests-welcome")
    expect(html).not.toContain("No matching Requests")
    expect(html).not.toContain("Active filters")
  })

  it("does not mistake a status with no matches for a new workspace", async () => {
    state.role = "member"
    state.rows = [{ id: "request-1", title: "Existing problem", reframedProblem: null, status: "done", createdAt: new Date(), creatorName: "Alex", assigneeName: null }]
    const html = await render("status=open")
    expect(html).toContain('aria-label="Active filters"')
    expect(html).toContain('aria-label="Remove Status: Open"')
    expect(html).toContain("Clear all")
    expect(html).toContain("No matching Requests")
    expect(html).toContain("Change or clear your filters.")
    expect(html).not.toContain("No Requests yet")
    expect(html).not.toContain("data-requests-welcome")
  })

  it("keeps an unavailable deep link recoverable instead of replacing it with onboarding", async () => {
    state.rows = []
    state.search = ""
    const html = wrap(await RequestDetailWorkspace({ selectedRequestId: "invalid-id" }))
    expect(html).toContain("Back to Requests")
  })

  const reviewer = (userId: string, name: string, decision: { kind: "concern"; reason: string } | null) => ({
    id: `reviewer-${userId}`, nominee: { kind: "member", userId }, displayNameAtSelection: name, addedBy: "user-alex", note: "",
    decision: decision && { ...decision, actorId: userId, at: "2026-10-22T00:00:00Z" },
  })
  it("marks a row with open concerns, and only those rows (#77)", async () => {
    state.role = "member"
    const base = { reframedProblem: null, status: "open", createdAt: new Date(), creatorName: "Alex", assigneeName: null }
    state.rows = [
      { ...base, id: "request-concern", title: "Has a concern", reviewers: [reviewer("user-priya", "Priya", { kind: "concern", reason: "No API yet." })] },
      { ...base, id: "request-unanswered", title: "Only unanswered", reviewers: [reviewer("user-priya", "Priya", null), reviewer("user-sam", "Sam", null)] },
    ]
    const html = await render()
    expect(html.match(/data-row-property="concerns"/g)).toHaveLength(1)
    expect(html).toMatch(/data-request-id="request-concern"[\s\S]*data-row-property="concerns"[^>]*>[\s\S]*?1 concern</)
  })

  it("keeps existing work visible in the shared list", async () => {
    state.role = "member"
    state.rows = [{ id: "request-1", title: "Existing problem", reframedProblem: null, status: "open", createdAt: new Date(), creatorName: "Alex", assigneeName: null }]
    const html = await render()
    expect(html).toContain('href="/requests/request-1"')
    expect(html).toContain("Existing problem")
    expect(html).toContain('aria-label="Filter Requests by title"')
    expect(html).toContain("Add filter")
    expect(html).not.toContain("data-requests-welcome")
    expect(html).not.toContain("data-empty-workspace")
    // With Requests, the strip's New Request is live again.
    expect(html).toMatch(/data-slot="page-strip"[\s\S]*<a [^>]*href="\/intake"/)
    expect(intakeLinksOf(html).filter(isInert)).toHaveLength(0)
  })
})
