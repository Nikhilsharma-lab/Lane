import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// Isolate external session/database boundaries; render the real workspace.
const state = vi.hoisted(() => ({ role: "admin", rows: [] as object[] }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), redirect: vi.fn() }))
vi.mock("@/lib/ensure-workspace", () => ({
  getWorkspace: async () => ({ needsOnboarding: false, role: state.role, orgId: "org_test", userId: "user_test", workspaceName: "Studio", fullName: "Alex", email: "alex@example.com" }),
}))
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema")
  const query = {
    from: () => query, leftJoin: () => query, where: () => query,
    orderBy: () => query, limit: async () => state.rows,
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

describe("Requests first-use landing", () => {
  it.each(["admin", "member", "guest"])("gives an empty %s workspace one Intake action and appropriate navigation", async (role) => {
    state.role = role
    state.rows = []
    const html = renderToStaticMarkup(await RequestsWorkspace({ filter: "all" }))
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
    const html = renderToStaticMarkup(await RequestsWorkspace({ filter: "open" }))
    expect(html).toContain('aria-label="Active filters"')
    expect(html).toContain('aria-label="Remove Status: Open"')
    expect(html).toContain("Clear all")
    expect(html).toContain("No matching Requests")
    expect(html).toContain("Change or clear your filters.")
    expect(html).not.toContain("No Requests yet")
  })

  it("keeps an unavailable deep link recoverable instead of replacing it with onboarding", async () => {
    state.rows = []
    const html = renderToStaticMarkup(await RequestsWorkspace({ filter: "all", selectedRequestId: "invalid-id" }))
    expect(html).toContain("Back to Requests")
  })

  it("keeps existing work visible in the shared list", async () => {
    state.role = "member"
    state.rows = [{ id: "request-1", title: "Existing problem", reframedProblem: null, status: "open", createdAt: new Date(), creatorName: "Alex", assigneeName: null }]
    const html = renderToStaticMarkup(await RequestsWorkspace({ filter: "all" }))
    expect(html).toContain('href="/requests/request-1"')
    expect(html).toContain("Existing problem")
    expect(html).toContain('aria-label="Filter Requests by title"')
    expect(html).toContain("Add filter")
    expect(html).not.toContain("requests-welcome-title")
  })
})
