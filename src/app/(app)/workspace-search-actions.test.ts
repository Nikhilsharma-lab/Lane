import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  session: { userId: "user_member", orgId: "org_a", orgRole: "org:member" } as { userId: string | null; orgId: string | null; orgRole: string | null },
  queries: [] as { sql: string; params: unknown[] }[],
  requestRows: [] as unknown[][],
  projectRows: [] as unknown[][],
  requestTotal: 0,
  projectTotal: 0,
  failure: false,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => boundary.session }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("@/db/schema");
  return { ...schema, db: drizzle(async (sql, params) => {
    boundary.queries.push({ sql, params });
    if (boundary.failure) throw new Error("Private SQL failure: customer secret");
    const isRequest = sql.match(/from "(requests|projects)"/)?.[1] === "requests";
    return { rows: sql.includes("count(*)")
      ? [[isRequest ? boundary.requestTotal : boundary.projectTotal]]
      : isRequest ? boundary.requestRows : boundary.projectRows };
  }, { schema }) };
});

const PROJECT_ID = "00000000-0000-4000-a000-000000000001";
const REQUEST_ID = "00000000-0000-4000-a000-000000000002";
const REQUEST = [REQUEST_ID, 42, "Signup", "People cannot finish signup", "open", PROJECT_ID, "Website", "bug", "2025-01-01T10:00:00.000Z"];
const PROJECT = [PROJECT_ID, "Website", "Public website"];

beforeEach(() => {
  boundary.session = { userId: "user_member", orgId: "org_a", orgRole: "org:member" };
  boundary.queries = []; boundary.requestRows = []; boundary.projectRows = [];
  boundary.requestTotal = 0; boundary.projectTotal = 0; boundary.failure = false;
});

async function search(input: Parameters<typeof import("./workspace-search-actions").searchWorkspace>[0], orgId = "org_a") {
  return (await import("./workspace-search-actions")).searchWorkspace(input, { orgId });
}

function queryFor(table: "requests" | "projects", count = false) {
  const query = boundary.queries.find(({ sql }) => sql.match(/from "(requests|projects)"/)?.[1] === table && sql.includes("count(*)") === count);
  expect(query).toBeDefined();
  return query!;
}

function whereClause(sql: string) {
  return sql.split(" where ")[1].split(" order by ")[0].replace(/\$\d+/g, "$param");
}

describe("workspace search", () => {
  it.each([
    { userId: null, orgId: "org_a", orgRole: "org:member" },
    { userId: "user_member", orgId: null, orgRole: "org:member" },
    { userId: "user_member", orgId: "org_b", orgRole: "org:member" },
    { userId: "user_member", orgId: "org_a", orgRole: "org:unknown" },
  ])("rejects an unavailable active membership before querying: %j", async (session) => {
    boundary.session = session;
    expect(await search({ query: "signup" })).toMatchObject({ success: false, error: { code: "session_expired" } });
    expect(boundary.queries).toHaveLength(0);
  });

  it("returns empty categories for a blank query without loading workspace data", async () => {
    expect(await search({ query: " \t\n " })).toEqual({
      success: true, query: "",
      requests: { items: [], total: 0, hasMore: false, page: 0 },
      projects: { items: [], total: 0, hasMore: false, page: 0 },
    });
    expect(boundary.queries).toHaveLength(0);
  });

  it.each([
    { query: "x".repeat(201) }, { query: "bad\u0000query" },
    { query: "signup", requestsPage: -1 }, { query: "signup", projectsPage: 0.5 },
    { query: "signup", requestsPage: Number.MAX_SAFE_INTEGER },
    { query: "signup", projectsPage: "1" }, { query: 123 }, null,
  ])("rejects invalid search input before querying: %j", async (input) => {
    expect(await search(input as Parameters<typeof search>[0])).toMatchObject({ success: false, error: { code: "validation" } });
    expect(boundary.queries).toHaveLength(0);
  });

  it("returns only result metadata with independent category totals and pages", async () => {
    boundary.requestRows = [REQUEST]; boundary.projectRows = [PROJECT];
    boundary.requestTotal = 41; boundary.projectTotal = 2;
    expect(await search({ query: "  Signup  ", requestsPage: 2 })).toEqual({
      success: true, query: "Signup",
      requests: { items: [{ id: REQUEST_ID, requestNumber: 42, title: "Signup", reframedProblem: "People cannot finish signup", status: "open", projectId: PROJECT_ID, projectName: "Website", requestType: "bug", createdAt: "2025-01-01T10:00:00.000Z" }], total: 41, hasMore: false, page: 2 },
      projects: { items: [{ id: PROJECT_ID, name: "Website", description: "Public website" }], total: 2, hasMore: false, page: 0 },
    });
  });

  it("applies tenant and search predicates to the complete dataset before page limits and uses stable ordering", async () => {
    boundary.requestRows = [REQUEST]; boundary.requestTotal = 241;
    const result = await search({ query: "signup", requestsPage: 11, projectsPage: 3 });
    expect(result).toMatchObject({ success: true, requests: { total: 241, page: 11, hasMore: true, items: [{ id: REQUEST_ID }] } });
    const requestQuery = queryFor("requests");
    const projectQuery = queryFor("projects");
    expect(requestQuery.sql).toContain('where ("requests"."org_id" =');
    expect(requestQuery.sql).toContain('"projects"."org_id" =');
    expect(requestQuery.sql).toContain('order by "requests"."created_at" desc, "requests"."id" desc');
    expect(requestQuery.sql).not.toContain('(select');
    expect(requestQuery.params.slice(-2)).toEqual([20, 220]);
    expect(projectQuery.params.slice(-2)).toEqual([20, 60]);
    expect(projectQuery.sql).toContain('order by lower("projects"."name") asc, "projects"."id" asc');
    for (const table of ["requests", "projects"] as const) {
      const rows = queryFor(table); const total = queryFor(table, true);
      expect(whereClause(rows.sql)).toBe(whereClause(total.sql));
      expect(rows.params).toContain("org_a"); expect(total.params).toContain("org_a");
      expect(total.sql).not.toContain("limit"); expect(total.sql).not.toContain("offset");
    }
  });

  it("restricts guest results and totals with the same own-Request and accessible-Project guards", async () => {
    boundary.session.orgRole = "org:guest";
    await search({ query: "signup", userId: "forged", role: "admin" } as Parameters<typeof search>[0]);
    for (const count of [false, true]) {
      const requestQuery = queryFor("requests", count);
      expect(requestQuery.sql).toContain('"requests"."created_by" =');
      expect(requestQuery.params).toContain("user_member");
      const projectQuery = queryFor("projects", count);
      expect(projectQuery.sql).toContain('"projects"."created_by" =');
      expect(projectQuery.sql).toContain('"requests"."created_by" =');
      expect(projectQuery.sql).toContain('"requests"."org_id" =');
      expect(projectQuery.sql).toContain('"requests"."project_id" = "projects"."id"');
      expect(projectQuery.sql).toContain("exists (select");
      expect(projectQuery.params.filter((param) => param === "user_member")).toHaveLength(2);
    }
    expect(boundary.queries.flatMap(({ params }) => params)).not.toContain("forged");
  });

  it("binds literal wildcard and SQL-looking text without treating it as SQL or a LIKE pattern", async () => {
    const query = "50%_\\' OR 1=1 --";
    await search({ query });
    expect(boundary.queries).toHaveLength(4);
    for (const emitted of boundary.queries) {
      expect(emitted.sql).not.toContain(query);
      expect(emitted.params).toContain(query);
      expect(emitted.sql).toContain("strpos(lower(coalesce(");
      expect(emitted.sql).not.toMatch(/\bilike\b|\blike\b/i);
    }
  });

  it.each(["org:member", "org:guest"])("searches saved codes inside the existing %s access boundary for rows and totals", async (role) => {
    boundary.session.orgRole = role;
    boundary.requestRows = [REQUEST]; boundary.requestTotal = 1;
    expect(await search({ query: "  lan-42  " })).toMatchObject({
      success: true, requests: { total: 1, items: [{ id: REQUEST_ID, requestNumber: 42 }] },
    });
    for (const count of [false, true]) {
      const query = queryFor("requests", count);
      expect(query.sql).toMatch(/where \("requests"\."org_id" = \$\d+ and /);
      expect(whereClause(query.sql)).toContain('"requests"."request_number" = $param');
      expect(query.params).toContain(42);
      expect(query.params).toContain("org_a");
      if (role === "org:guest") {
        expect(query.sql).toMatch(/and "requests"\."created_by" = \$\d+ and \(/);
        expect(query.params).toContain("user_member");
      }
    }
    expect(whereClause(queryFor("requests").sql)).toBe(whereClause(queryFor("requests", true).sql));
  });

  it("does not interpret partial or malformed codes as identifiers", async () => {
    await search({ query: "LAN-4%" });
    expect(whereClause(queryFor("requests").sql)).not.toContain('"request_number"');
    expect(queryFor("requests").params).toContain("LAN-4%");
  });

  it("searches saved Request and Expected impact text without searching comments, files, or profile emails", async () => {
    await search({ query: "métrique" });
    const { sql } = queryFor("requests");
    const predicate = whereClause(sql);
    for (const column of ["title", "description", "reframed_problem", "extracted_solution", "affected_people", "desired_change", "observed_evidence", "uncertainty", "useful_link"]) {
      expect(predicate).toContain(`"requests"."${column}"`);
    }
    for (const field of ["metric", "unit", "source", "result"]) expect(predicate).toContain(`->> '${field}'`);
    expect(sql).not.toMatch(/comments|attachments|profiles|email/);
    expect(queryFor("projects").sql).toContain('coalesce("projects"."description"');
  });

  it("does not report more results after the last page or an out-of-range page", async () => {
    boundary.requestTotal = 20; boundary.projectTotal = 0;
    expect(await search({ query: "signup", projectsPage: 7 })).toMatchObject({
      success: true, requests: { total: 20, hasMore: false, page: 0 }, projects: { total: 0, hasMore: false, page: 7 },
    });
  });

  it("returns a safe error if either category fails without exposing query or database details", async () => {
    boundary.failure = true;
    const result = await search({ query: "customer secret" });
    expect(boundary.queries.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ success: false, error: { code: "search_failed" } });
    expect(JSON.stringify(result)).not.toMatch(/customer secret|SQL/);
  });
});
