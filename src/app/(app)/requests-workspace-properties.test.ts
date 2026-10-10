import { beforeEach, describe, expect, it, vi } from "vitest"
import { RequestsWorkspace } from "./requests-workspace"

// Exercise the real Drizzle query builder with a SQL recorder, never a connection.
const recorded = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], role: "member" as "member" | "guest", projectAvailable: false }))
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema")
  const { drizzle } = await import("drizzle-orm/pg-proxy")
  return { ...schema, db: drizzle(async (sql, params) => {
    recorded.queries.push({ sql, params })
    return { rows: recorded.projectAvailable && sql.includes('from "projects" where') ? [["00000000-0000-4000-8000-000000000002", "Website"]] : [] }
  }, { schema }) }
})
vi.mock("@/lib/ensure-workspace", () => ({
  // Plan item 1.8: the page reads Clerk claims first, then runs its loaders in parallel.
  getMember: async () => ({ userId: "person_current", orgId: "org_visible", role: recorded.role }),
  getWorkspace: async () => ({ orgId: "org_visible", userId: "person_current", role: recorded.role, needsOnboarding: false }),
}))
vi.mock("./requests/[id]/actions", () => ({ addComment: vi.fn(), pickUpRequest: vi.fn(), markDone: vi.fn(), getAttachmentDownloadUrl: vi.fn() }))

beforeEach(() => { recorded.queries = []; recorded.role = "member"; recorded.projectAvailable = false })

describe("Request property reads preserve workspace and guest boundaries", () => {
  it("reads the saved code in the list query instead of generating it from result order", async () => {
    await RequestsWorkspace({ filter: "all" })
    expect(recorded.queries[0].sql).toContain('"requests"."request_number"')
    expect(recorded.queries[0].sql).toMatch(/where .*"requests"\."org_id" = \$\d+/)
  })

  it("joins Project names within the active workspace in both list and detail queries", async () => {
    await RequestsWorkspace({ filter: "all", selectedRequestId: "00000000-0000-4000-8000-000000000001" })
    expect(recorded.queries).toHaveLength(2)
    for (const query of recorded.queries) {
      expect(query.sql).toMatch(/left join "projects" on \("requests"\."project_id" = "projects"\."id" and "projects"\."org_id" = \$\d+\)/)
      expect(query.sql).toMatch(/where .*"requests"\."org_id" = \$\d+/)
      expect(query.params.filter(value => value === "org_visible")).toHaveLength(2)
      expect(query.sql).toContain('"requests"."request_type"')
    }
    expect(recorded.queries[0].sql).toContain("limit")
    expect(recorded.queries[0].params).toContain(200)
  })

  it("restricts both guest queries to Requests created by the session user", async () => {
    recorded.role = "guest"
    await RequestsWorkspace({ filter: "all", selectedRequestId: "00000000-0000-4000-8000-000000000001" })
    expect(recorded.queries).toHaveLength(2)
    for (const query of recorded.queries) {
      expect(query.sql).toMatch(/where .*"requests"\."created_by" = \$\d+/)
      expect(query.params).toContain("person_current")
      expect(query.params.filter(value => value === "org_visible")).toHaveLength(2)
    }
  })

  it("applies Project and status in SQL before the 200 Request limit", async () => {
    recorded.projectAvailable = true
    await RequestsWorkspace({ filter: "open", projectFilter: "00000000-0000-4000-8000-000000000002" })
    const query = recorded.queries.find(item => item.sql.includes('from "requests" left join'))!
    expect(query.sql).toMatch(/where .*"requests"\."status" = \$\d+.*"requests"\."project_id" = \$\d+.*order by.*limit/)
    expect(query.params).toContain("open")
    expect(query.params).toContain("00000000-0000-4000-8000-000000000002")
    expect(query.params).toContain(200)
  })

  it("uses a null predicate for No Project without requiring a Project record", async () => {
    await RequestsWorkspace({ filter: "all", projectFilter: "none" })
    expect(recorded.queries).toHaveLength(1)
    expect(recorded.queries[0].sql).toMatch(/where .*"requests"\."project_id" is null.*limit/)
  })

  it("does not fall back to all Requests for invalid or inaccessible Projects", async () => {
    await RequestsWorkspace({ filter: "all", projectFilter: "bad-id" })
    expect(recorded.queries).toHaveLength(0)
    await RequestsWorkspace({ filter: "all", projectFilter: "00000000-0000-4000-8000-000000000002" })
    expect(recorded.queries).toHaveLength(1)
    expect(recorded.queries[0].sql).toContain('from "projects"')
    expect(recorded.queries[0].params).toContain("org_visible")
  })

  it("requires guest Project access and still limits Requests to their submitter", async () => {
    recorded.role = "guest"
    recorded.projectAvailable = true
    await RequestsWorkspace({ filter: "all", projectFilter: "00000000-0000-4000-8000-000000000002" })
    expect(recorded.queries).toHaveLength(2)
    const [project, request] = recorded.queries
    expect(project.sql).toContain("exists (select")
    expect(project.params).toContain("person_current")
    expect(request.sql).toMatch(/where .*"requests"\."created_by" = \$\d+.*"requests"\."project_id" = \$\d+/)
    expect(request.params).toContain("person_current")
  })

  it("resolves a direct Request link independently when its Project context is malformed", async () => {
    await RequestsWorkspace({ filter: "open", projectFilter: "bad-id", selectedRequestId: "00000000-0000-4000-8000-000000000001" })
    expect(recorded.queries).toHaveLength(1)
    const detail = recorded.queries[0]
    expect(detail.sql).toMatch(/where .*"requests"\."id" = \$\d+.*"requests"\."org_id" = \$\d+/)
    expect(detail.params).toContain("00000000-0000-4000-8000-000000000001")
    expect(detail.params).not.toContain(200)
  })

  it("retains guest Request ownership checks when the linked Project is inaccessible", async () => {
    recorded.role = "guest"
    await RequestsWorkspace({ filter: "all", projectFilter: "00000000-0000-4000-8000-000000000002", selectedRequestId: "00000000-0000-4000-8000-000000000001" })
    expect(recorded.queries).toHaveLength(2)
    const detail = recorded.queries[1]
    expect(detail.sql).toMatch(/where .*"requests"\."id" = \$\d+.*"requests"\."org_id" = \$\d+.*"requests"\."created_by" = \$\d+/)
    expect(detail.params).toContain("person_current")
    expect(detail.params).not.toContain(200)
  })
})
