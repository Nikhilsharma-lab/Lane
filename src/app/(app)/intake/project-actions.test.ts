import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  session: { userId: "user_member", orgId: "org_a", orgRole: "org:member" } as { userId: string | null; orgId: string | null; orgRole: string | null },
  queries: [] as { sql: string; params: unknown[] }[],
  responses: [] as unknown[][][],
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => boundary.session }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const schema = await import("@/db/schema");
  return { ...schema, db: drizzle(async (sql, params) => {
    boundary.queries.push({ sql, params });
    return { rows: boundary.responses.shift() ?? [] };
  }, { schema }) };
});

const PROJECT = ["00000000-0000-4000-a000-000000000001", "Website", null];

beforeEach(() => {
  boundary.session = { userId: "user_member", orgId: "org_a", orgRole: "org:member" };
  boundary.queries = []; boundary.responses = [];
});

describe("Project actions", () => {
  it("rejects a different active workspace without querying", async () => {
    const { listProjects, createProject } = await import("./project-actions");
    expect(await listProjects({ orgId: "org_b" })).toMatchObject({ success: false, error: { code: "session_expired" } });
    expect(await createProject({ name: "Website" }, { orgId: "org_b" })).toMatchObject({ success: false });
    expect(boundary.queries).toHaveLength(0);
  });
  it("lists only the active workspace", async () => {
    const { listProjects } = await import("./project-actions");
    boundary.responses = [[PROJECT]];
    expect(await listProjects({ orgId: "org_a" })).toEqual({ success: true, projects: [{ id: PROJECT[0], name: "Website", description: null }] });
    expect(boundary.queries[0].sql).toContain('"projects"."org_id" = $1');
    expect(boundary.queries[0].params).toEqual(["org_a"]);
  });
  it("restricts guest lists to created or own-Request-referenced projects", async () => {
    const { listProjects } = await import("./project-actions");
    boundary.session.orgRole = "org:guest";
    await listProjects({ orgId: "org_a" });
    const query = boundary.queries[0];
    expect(query.sql).toContain('"projects"."created_by"');
    expect(query.sql).toContain('"requests"."created_by"');
    expect(query.sql).toContain('"requests"."org_id"');
    expect(query.sql).toContain('"requests"."project_id" = "projects"."id"');
    expect(query.params).toEqual(["org_a", "user_member", "org_a", "user_member"]);
  });
  it("allows a guest to create with session identity and normalized input", async () => {
    const { createProject } = await import("./project-actions");
    boundary.session.orgRole = "org:guest";
    boundary.responses = [[PROJECT]];
    const result = await createProject({ name: "  Website   ", createdBy: "forged" } as { name: string }, { orgId: "org_a" });
    expect(result).toMatchObject({ success: true, project: { name: "Website" } });
    expect(boundary.queries[0].params).toContain("user_member");
    expect(boundary.queries[0].params).not.toContain("forged");
    expect(boundary.queries[0].params).toContain("Website");
  });
  it("rejects blank names before database work", async () => {
    const { createProject } = await import("./project-actions");
    expect(await createProject({ name: "  " }, { orgId: "org_a" })).toMatchObject({ success: false, error: { code: "validation", field: "name" } });
    expect(boundary.queries).toHaveLength(0);
  });
  it("returns an accessible duplicate without creating another row", async () => {
    const { createProject } = await import("./project-actions");
    boundary.responses = [[], [PROJECT]];
    expect(await createProject({ name: "website" }, { orgId: "org_a" })).toMatchObject({ success: true, project: { name: "Website" } });
    expect(boundary.queries[0].sql).toContain("on conflict do nothing");
    expect(boundary.queries[1].sql).toContain("lower(");
  });
  it("does not disclose a hidden project on a guest duplicate", async () => {
    const { createProject } = await import("./project-actions");
    boundary.session.orgRole = "org:guest";
    boundary.responses = [[], []];
    expect(await createProject({ name: "Website" }, { orgId: "org_a" })).toMatchObject({ success: false, error: { code: "conflict" } });
    expect(boundary.queries[1].sql).toContain('"requests"."created_by"');
  });
});
