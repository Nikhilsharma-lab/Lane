import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { REQUEST_STATUS_FILTERS, finishedViewOf, requestDetailHref } from "@/lib/request-workspace"
import { columns } from "@/components/requests/tasks/columns"
import type { ReactElement } from "react"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const WORKSPACE = source("src/app/(app)/requests-workspace.tsx")
// Plan item 2.12: the Request page has its own server module, so neither route's first load carries the other's client code.
const DETAIL_WORKSPACE = source("src/app/(app)/request-detail-workspace.tsx")
const LIST_PAGE = source("src/app/(app)/page.tsx")
const DETAIL_PAGE = source("src/app/(app)/requests/[id]/page.tsx")
const DETAIL_VIEW = source("src/components/requests/detail-view.tsx")
// Plan item 2.12: the detail pane both the Request page and the list's preview render.
const DETAIL_PANE = source("src/components/requests/request-detail-pane.tsx")
const REQUEST_STYLES = source("src/components/requests/requests.module.css")
const ROW_STYLES = source("src/components/requests/request-rows.module.css")
const DATA_TABLE = source("src/components/requests/tasks/data-table.tsx")
const SIDEBAR_VIEW = source("src/components/shell/sidebar-view.tsx")
const NEXT_CONFIG = source("next.config.ts")

describe("Requests workspace contract", () => {
  it("renders the list and deep-link routes in the same workspace frame, from separate modules", () => {
    expect(LIST_PAGE).toContain("<RequestsWorkspace")
    expect(DETAIL_PAGE).toContain("<RequestDetailWorkspace")
    expect(DETAIL_WORKSPACE).toContain('data-slot="requests-workspace"')
    // The list's server module imports no detail island, so "/" ships none in its first load.
    expect(WORKSPACE).not.toContain("RequestDetailPane")
    expect(WORKSPACE).not.toContain("detail-view")
    expect(DETAIL_WORKSPACE).not.toContain("requests-overview")
  })

  // Plan item 2.5: the legacy list pane, People and the duplicate phone lifecycle block are gone.
  it("renders Request detail without the old list pane, People or a second lifecycle block", () => {
    for (const removed of ["RequestListPane", "requestLink", "request-people", "mobileLifecycleActions", '"Expected result"', "--surface-hover"]) {
      expect(DETAIL_VIEW, removed).not.toContain(removed)
      expect(REQUEST_STYLES, removed).not.toContain(removed)
    }
    expect(DETAIL_WORKSPACE).not.toContain("mobileLifecycleActions")
    expect(DETAIL_WORKSPACE).toContain("viewerName={")
    expect(REQUEST_STYLES).not.toMatch(/(?:border-left|border-inline-start)\s*:/)
  })

  it("reads through the server-only loaders instead of querying inline (plan items 1.8 and 1.9)", () => {
    for (const workspace of [WORKSPACE, DETAIL_WORKSPACE]) {
      expect(workspace).toContain('from "@/lib/data/requests"')
      expect(workspace).toContain("Promise.all([")
      expect(workspace).not.toContain('from "@/db"')
    }
    for (const loader of ["shell", "requests", "projects", "notifications"]) {
      expect(source(`src/lib/data/${loader}.ts`)).toMatch(/^import "server-only"/)
    }
  })

  it("keeps lifecycle actions in detail instead of the Request list", () => {
    expect(WORKSPACE).not.toContain("PickUpButton")
    expect(DETAIL_WORKSPACE).toContain("<RequestDetailPane")
    expect(DETAIL_PANE).toContain("<LifecycleButtons")
  })

  it("keeps the status view and Project filter out of the server render (plan item 1.7)", () => {
    for (const page of [LIST_PAGE, DETAIL_PAGE]) expect(page).not.toContain("searchParams")
    expect(WORKSPACE).not.toContain("filter={filter}")
    expect(WORKSPACE).not.toContain("loadProjectScope")
    // Views switch in the browser: no router navigation with a list URL in the table.
    expect(DATA_TABLE).not.toMatch(/router\.(replace|push)/)
    expect(DATA_TABLE).toContain("useRequestListUrlSync(")
    expect(DATA_TABLE).toContain("usePendingMutations()")
    expect(SIDEBAR_VIEW).toContain("event.preventDefault()")
  })

  it("loads only the selected Request on a Request page (plan item 1.10)", () => {
    expect(DETAIL_WORKSPACE).not.toContain("loadRequestList")
    expect(DETAIL_WORKSPACE).toContain("loadRequestDetail(member, selectedRequestId)")
    expect(DETAIL_WORKSPACE).not.toContain("<RequestListPane")
  })

  it("keeps fully prefetched routes fresh for 30 seconds (plan item 1.11)", () => {
    expect(NEXT_CONFIG).toMatch(/staleTimes: \{ dynamic: 30, static: 30 \}/)
  })

  it("decides the lifecycle move in one shared function (plan item 2.4)", () => {
    for (const path of [
      "src/components/requests/request-row-actions.tsx",
      "src/components/requests/use-request-selection.ts",
      "src/app/(app)/requests/[id]/lifecycle-buttons.tsx",
    ]) {
      const file = source(path)
      expect(file, path).toContain('from "@/lib/request-lifecycle"')
      expect(file, path).toContain("availableMove(")
      // No caller keeps its own status-to-move decision.
      expect(file, path).not.toMatch(/status === "(open|in_progress)"/)
    }
  })

  it("lists waiting Guest submissions as a view of Open work, always loaded in full", () => {
    expect(finishedViewOf("waiting")).toBeNull()
  })

  it("shows the Waiting to be taken on tag at every width, phones included", () => {
    const rules = ROW_STYLES.replace(/\/\*[\s\S]*?\*\//g, "")
    const hidden = [...rules.matchAll(/([^{}]*)\{\s*display:\s*none;?\s*\}/g)].map(match => match[1])
    for (const selector of hidden) {
      expect(selector, selector).not.toMatch(/data-row-property="waiting"\]\s*$/)
      // A rule hiding every property but a few must name the tag among those it keeps.
      if (/\.properties > span:not\(/.test(selector)) expect(selector).toContain('[data-row-property="waiting"]')
    }
  })

  it("preserves native deep links and the five journey status views plus Due soon or overdue (#133)", () => {
    const titleLink = columns.find(column => column.key === "title")!.render({
      id: "request-1", title: "Example Request", reframedProblem: null,
      status: "open", createdAt: "2026-10-07T00:00:00.000Z", creatorName: null, assigneeName: null,
    }, "in_progress", "project-1") as ReactElement<{ href: string }>
    // Canonical /requests/[id]: the list context lives in the layout's list view state.
    expect(titleLink.props.href).toBe("/requests/request-1")
    expect(REQUEST_STATUS_FILTERS).toEqual(["all", "open", "in_progress", "done", "measuring", "closed", "due", "waiting"])
    expect(requestDetailHref("request-1", "all")).toBe("/requests/request-1")
    expect(requestDetailHref("request-1", "in_progress")).toBe("/requests/request-1?status=in_progress")
  })
})
