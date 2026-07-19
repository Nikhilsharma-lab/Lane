import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const WORKSPACE = source("src/app/(app)/requests-workspace.tsx")
const LIST_PAGE = source("src/app/(app)/page.tsx")
const DETAIL_PAGE = source("src/app/(app)/requests/[id]/page.tsx")
const DESIGN = source("DESIGN.md")

describe("Requests workspace contract", () => {
  it("keeps one shared workspace behind list and deep-link routes", () => {
    expect(LIST_PAGE).toContain("<RequestsWorkspace")
    expect(DETAIL_PAGE).toContain("<RequestsWorkspace")
    expect(WORKSPACE).toContain('data-slot="requests-workspace"')
  })

  it("uses a clean selected wash without a decorative edge stripe", () => {
    expect(WORKSPACE).toContain("bg-brand-soft hover:bg-brand-soft")
    expect(WORKSPACE).toContain('aria-current={selected ? "page" : undefined}')
    expect(WORKSPACE).not.toMatch(/\bborder-l-(?:2|4|8)\b/)
    expect(WORKSPACE).not.toContain("borderLeft")
    expect(DESIGN).toContain(
      "without a decorative edge stripe"
    )
  })

  it("keeps lifecycle actions in detail instead of the Request list", () => {
    expect(WORKSPACE).not.toContain("PickUpButton")
    expect(WORKSPACE).toContain("<LifecycleButtons")
  })

  it("preserves native deep links and the three-state MVP lifecycle", () => {
    expect(WORKSPACE).toContain("requestDetailHref(request.id, filter)")
    expect(WORKSPACE).toContain('"open" as const')
    expect(WORKSPACE).toContain('"in_progress" as const')
    expect(WORKSPACE).toContain('"done" as const')
  })
})
