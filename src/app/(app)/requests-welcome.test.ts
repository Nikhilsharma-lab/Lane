import { createElement } from "react"
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
vi.mock("./request-status-filter", () => ({ RequestStatusFilter: () => null }))

import { RequestsWorkspace } from "./requests-workspace"
import { RequestListViewProvider } from "@/components/requests/list-view-state"

// The root layout always supplies the toast stack that row actions report errors through,
// and the (app) layout the list view state.
const render = async (props: Parameters<typeof RequestsWorkspace>[0], search = "") => {
  state.search = search
  return renderToStaticMarkup(createElement(ToastStackProvider, null, createElement(RequestListViewProvider, null, await RequestsWorkspace(props))))
}

describe("Requests first-use landing", () => {
  it.each(["admin", "member", "guest"])("gives an empty %s workspace one Intake action and appropriate navigation", async (role) => {
    state.role = role
    state.rows = []
    const html = await render({})
    expect(html.match(/href="\/intake"/g)).toHaveLength(1)
    expect(html).not.toContain("Select a Request")
    expect(html).not.toContain('aria-label="Active filters"')
    expect(html).not.toContain('aria-label="Filter Requests by title"')
    expect(html.includes('href="/settings/members"')).toBe(role === "admin")
    if (role === "guest") expect(html).toContain("Only Requests you submit appear here")
  })

  it("does not mistake a status with no matches for a new workspace", async () => {
    state.role = "member"
    state.rows = [{ id: "request-1", title: "Existing problem", reframedProblem: null, status: "done", createdAt: new Date(), creatorName: "Alex", assigneeName: null }]
    const html = await render({}, "status=open")
    expect(html).toContain('aria-label="Active filters"')
    expect(html).toContain('aria-label="Remove Status: Open"')
    expect(html).toContain("Clear all")
    expect(html).toContain("No matching Requests")
    expect(html).toContain("Change or clear your filters.")
    expect(html).not.toContain("No Requests yet")
  })

  it("keeps an unavailable deep link recoverable instead of replacing it with onboarding", async () => {
    state.rows = []
    const html = await render({ selectedRequestId: "invalid-id" })
    expect(html).toContain("Back to Requests")
  })

  it("keeps existing work visible in the shared list", async () => {
    state.role = "member"
    state.rows = [{ id: "request-1", title: "Existing problem", reframedProblem: null, status: "open", createdAt: new Date(), creatorName: "Alex", assigneeName: null }]
    const html = await render({})
    expect(html).toContain('href="/requests/request-1"')
    expect(html).toContain("Existing problem")
    expect(html).toContain('aria-label="Filter Requests by title"')
    expect(html).toContain("Add filter")
    expect(html).not.toContain("requests-welcome-title")
  })
})
