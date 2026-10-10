import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { REQUEST_STATUS_FILTERS, requestDetailHref } from "@/lib/request-workspace"
import { columns } from "@/components/requests/tasks/columns"
import type { ReactElement } from "react"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const WORKSPACE = source("src/app/(app)/requests-workspace.tsx")
const LIST_PAGE = source("src/app/(app)/page.tsx")
const DETAIL_PAGE = source("src/app/(app)/requests/[id]/page.tsx")
const DETAIL_VIEW = source("src/components/requests/detail-view.tsx")
const REQUEST_STYLES = source("src/components/requests/requests.module.css")
const DATA_TABLE = source("src/components/requests/tasks/data-table.tsx")
const SIDEBAR_VIEW = source("src/components/shell/sidebar-view.tsx")
const NEXT_CONFIG = source("next.config.ts")

describe("Requests workspace contract", () => {
  it("keeps one shared workspace behind list and deep-link routes", () => {
    expect(LIST_PAGE).toContain("<RequestsWorkspace")
    expect(DETAIL_PAGE).toContain("<RequestsWorkspace")
    expect(WORKSPACE).toContain('data-slot="requests-workspace"')
  })

  it("marks the selected Request and uses the Arc selected surface without an edge stripe", () => {
    expect(DETAIL_VIEW).toContain('aria-current={request.id === selectedRequestId ? "page" : undefined}')
    expect(DETAIL_VIEW).toContain('className={styles.requestLink}')
    expect(REQUEST_STYLES).toMatch(/\.requestLink\[aria-current="page"\]\s*\{[^}]*background:\s*var\(--accent-subtle\)/)
    expect(REQUEST_STYLES).not.toMatch(/(?:border-left|border-inline-start)\s*:/)
  })

  it("reads through the server-only loaders instead of querying inline (plan items 1.8 and 1.9)", () => {
    expect(WORKSPACE).toContain('from "@/lib/data/requests"')
    expect(WORKSPACE).toContain("Promise.all([")
    expect(WORKSPACE).not.toContain('from "@/db"')
    for (const loader of ["shell", "requests", "projects", "notifications"]) {
      expect(source(`src/lib/data/${loader}.ts`)).toMatch(/^import "server-only"/)
    }
  })

  it("keeps lifecycle actions in detail instead of the Request list", () => {
    expect(WORKSPACE).not.toContain("PickUpButton")
    expect(WORKSPACE).toContain("<LifecycleButtons")
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
    expect(WORKSPACE).toMatch(/selectedRequestId \? null : loadRequestList\(member\)/)
    expect(WORKSPACE).not.toContain("<RequestListPane")
  })

  it("keeps fully prefetched routes fresh for 30 seconds (plan item 1.11)", () => {
    expect(NEXT_CONFIG).toMatch(/staleTimes: \{ dynamic: 30, static: 30 \}/)
  })

  it("preserves native deep links and the three-state MVP lifecycle", () => {
    const titleLink = columns.find(column => column.key === "title")!.render({
      id: "request-1", title: "Example Request", reframedProblem: null,
      status: "open", createdAt: "2026-10-07T00:00:00.000Z", creatorName: null, assigneeName: null,
    }, "in_progress", "project-1") as ReactElement<{ href: string }>
    // Canonical /requests/[id]: the list context lives in the layout's list view state.
    expect(titleLink.props.href).toBe("/requests/request-1")
    expect(REQUEST_STATUS_FILTERS).toEqual(["all", "open", "in_progress", "done"])
    expect(requestDetailHref("request-1", "all")).toBe("/requests/request-1")
    expect(requestDetailHref("request-1", "in_progress")).toBe("/requests/request-1?status=in_progress")
  })
})
