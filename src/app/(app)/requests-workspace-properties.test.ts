import { beforeEach, describe, expect, it, vi } from "vitest"
import { RequestsWorkspace } from "./requests-workspace"
import { RequestDetailWorkspace } from "./request-detail-workspace"

// Exercise the real Drizzle query builder with a SQL recorder, never a connection.
const recorded = vi.hoisted(() => ({ queries: [] as { sql: string; params: unknown[] }[], role: "member" as "member" | "guest" }))
vi.mock("@/db", async () => {
  const schema = await import("@/db/schema")
  const { drizzle } = await import("drizzle-orm/pg-proxy")
  return { ...schema, db: drizzle(async (sql, params) => {
    recorded.queries.push({ sql, params })
    return { rows: [] }
  }, { schema }) }
})
vi.mock("@/lib/ensure-workspace", () => ({
  // Plan item 1.8: the page reads Clerk claims first, then runs its loaders in parallel.
  getMember: async () => ({ userId: "person_current", orgId: "org_visible", role: recorded.role }),
  getWorkspace: async () => ({ orgId: "org_visible", userId: "person_current", role: recorded.role, needsOnboarding: false }),
}))
vi.mock("./requests/[id]/actions", () => ({ addComment: vi.fn(), pickUpRequest: vi.fn(), markDone: vi.fn(), getAttachmentDownloadUrl: vi.fn() }))

beforeEach(() => { recorded.queries = []; recorded.role = "member" })

const REQUEST_ID = "00000000-0000-4000-8000-000000000001"
const orgParams = (query: { params: unknown[] }) => query.params.filter(value => value === "org_visible")

describe("Request property reads preserve workspace and guest boundaries", () => {
  it("reads the saved code in the list query instead of generating it from result order", async () => {
    await RequestsWorkspace()
    expect(recorded.queries).toHaveLength(1)
    expect(recorded.queries[0].sql).toContain('"requests"."request_number"')
    expect(recorded.queries[0].sql).toMatch(/where .*"requests"\."org_id" = \$\d+/)
  })

  it("loads active Requests under the cap and the latest finished ones in one statement, with no Project filter in SQL (plan item 1.7; #133)", async () => {
    await RequestsWorkspace()
    const [list] = recorded.queries
    // Open and In progress, then Done, Measuring and Closed: the journey module's conditions (request-journey-sql.ts).
    expect(list.sql).toMatch(/^\(select .*"requests"\."status" = 'open'\) or .*"requests"\."status" = 'in_progress'.*limit \$\d+\) union all \(select .*"requests"\."status" = 'done'.*"requests"\."outcome_closure" is not null or "requests"\."exception_closure" is not null.*limit \$\d+\)$/)
    expect(list.params).toEqual(expect.arrayContaining([201, 51]))
    for (const where of list.sql.match(/where \([^)]*\)/g) ?? []) expect(where).not.toContain('"requests"."project_id"')
    expect(list.sql.match(/where \(/g)).toHaveLength(2)
    // Both halves join Projects within the workspace and filter by it.
    expect(orgParams(list)).toHaveLength(4)
    expect(list.sql.match(/left join "projects" on \("requests"\."project_id" = "projects"\."id" and "projects"\."org_id" = \$\d+\)/g)).toHaveLength(2)
  })

  it("restricts both halves of a guest's list to Requests they created", async () => {
    recorded.role = "guest"
    await RequestsWorkspace()
    const [list] = recorded.queries
    // Each half shows only what the guest created; its edit flag reads who answers for it now (#212).
    expect(list.sql.match(/"requests"\."created_by" = \$\d+/g)).toHaveLength(2)
    expect(list.sql.match(/coalesce\("requests"\."taken_on_by", "requests"\."created_by"\) = \$\d+/g)).toHaveLength(2)
    expect(list.params.filter(value => value === "person_current")).toHaveLength(4)
  })

  it("loads only the Request, its comments and its files on a Request page, never the list (plan item 1.10)", async () => {
    await RequestDetailWorkspace({ selectedRequestId: REQUEST_ID })
    expect(recorded.queries).toHaveLength(3)
    for (const query of recorded.queries) {
      expect(query.sql).not.toContain("union all")
      expect(query.sql).toMatch(/where .*"requests"\."id" = \$\d+.*"requests"\."org_id" = \$\d+/)
      expect(query.params).toContain(REQUEST_ID)
      expect(query.params).toContain("org_visible")
    }
    const [detail, commentRows, attachmentRows] = recorded.queries
    expect(detail.sql).toMatch(/left join "projects" on \("requests"\."project_id" = "projects"\."id" and "projects"\."org_id" = \$\d+\)/)
    expect(detail.sql).toContain('"requests"."request_type"')
    // Plan item 2.5: the code, priority and Assignee avatar ride the same statement.
    expect(detail.sql).toContain('"requests"."request_number"')
    expect(detail.sql).toContain('"requests"."priority"')
    expect(detail.sql).toContain('"request_detail_assignee"."avatar_url"')
    expect(commentRows.sql).toMatch(/from "comments" inner join "requests" on "comments"\."request_id" = "requests"\."id"/)
    expect(attachmentRows.sql).toMatch(/from "request_attachments" inner join "requests" on "request_attachments"\."request_id" = "requests"\."id"/)
  })

  it("keeps the creator check on every guest detail statement, including comments and files", async () => {
    recorded.role = "guest"
    await RequestDetailWorkspace({ selectedRequestId: REQUEST_ID })
    expect(recorded.queries).toHaveLength(3)
    for (const query of recorded.queries) {
      expect(query.sql).toMatch(/where .*"requests"\."id" = \$\d+.*"requests"\."org_id" = \$\d+.*"requests"\."created_by" = \$\d+/)
      expect(query.params).toContain("person_current")
    }
  })

  it("runs no statement for a malformed Request id", async () => {
    await RequestDetailWorkspace({ selectedRequestId: "bad-id" })
    expect(recorded.queries).toHaveLength(0)
  })
})
