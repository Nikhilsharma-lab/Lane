import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { db, organizations, profiles, projects, requests, workspaceLabels } from "@/db";
import { requireTestDatabase } from "@/test/test-database";
import { deleteProject } from "./project-actions";

const session = vi.hoisted(() => ({ userId: "", orgId: "", orgRole: "org:member" }));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => session }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

it("deletes only the selected workspace Project, keeps Requests and workspace labels, and tolerates a repeated confirmation", async () => {
  requireTestDatabase(process.env.DATABASE_URL);
  const suffix = randomUUID();
  const orgA = `project-delete-a-${suffix}`, orgB = `project-delete-b-${suffix}`;
  const userId = `project-delete-${suffix}`;
  session.userId = userId; session.orgId = orgA;
  try {
    await db.insert(profiles).values({ id: userId, fullName: "Project deletion check", email: "project-delete@example.test" });
    await db.insert(organizations).values([{ id: orgA, name: "Delete fixture", slug: orgA }, { id: orgB, name: "Other fixture", slug: orgB }]);
    const [target, other] = await db.insert(projects).values([
      { orgId: orgA, name: "Target", createdBy: userId }, { orgId: orgB, name: "Other", createdBy: userId },
    ]).returning();
    const [local, shared] = await db.insert(workspaceLabels).values([
      { orgId: orgA, projectId: target.id, name: "Project label", colour: "blue", createdBy: userId },
      { orgId: orgA, name: "Workspace label", colour: "green", createdBy: userId },
    ]).returning();
    const [request, otherRequest] = await db.insert(requests).values([
      { orgId: orgA, projectId: target.id, title: "Keep me", description: "Saved context", createdBy: userId, labelKeys: ["bug", local.id, shared.id] },
      { orgId: orgB, projectId: other.id, title: "Other workspace", description: "Untouched", createdBy: userId },
    ]).returning();
    expect(await deleteProject(other.id, { orgId: orgA })).toEqual({ success: true });
    expect(await db.select().from(projects).where(eq(projects.id, other.id))).toHaveLength(1);
    expect(await deleteProject(target.id, { orgId: orgA })).toEqual({ success: true });
    expect(await deleteProject(target.id, { orgId: orgA })).toEqual({ success: true });
    expect(await db.select().from(projects).where(eq(projects.id, target.id))).toEqual([]);
    const [kept] = await db.select().from(requests).where(eq(requests.id, request.id));
    expect(kept).toMatchObject({ projectId: null, title: "Keep me", description: "Saved context", status: "open", requestType: "bug", labelKeys: ["bug", shared.id] });
    expect(await db.select().from(workspaceLabels).where(eq(workspaceLabels.orgId, orgA))).toMatchObject([{ id: shared.id }]);
    expect(await db.select().from(requests).where(eq(requests.id, otherRequest.id))).toMatchObject([{ projectId: other.id }]);
  } finally {
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(profiles).where(eq(profiles.id, userId));
  }
});
