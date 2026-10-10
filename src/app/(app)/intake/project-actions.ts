"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { db, projects } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import { projectInputSchema, type ProjectOption } from "@/lib/request-properties";

export type ProjectFailure = {
  code: "session_expired" | "validation" | "conflict" | "load_failed" | "save_failed";
  message: string;
  field?: "name" | "description";
};
export type ListProjectsResponse = { success: true; projects: ProjectOption[] } | { success: false; error: ProjectFailure };
export type CreateProjectResponse = { success: true; project: ProjectOption } | { success: false; error: ProjectFailure };

const projectSelection = { id: projects.id, name: projects.name, description: projects.description };
const sessionError: ProjectFailure = { code: "session_expired", message: "Your session ended. Sign in again to use Projects." };

export async function listProjects(context: { orgId: string }): Promise<ListProjectsResponse> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionError };
  try {
    const rows = await db.select(projectSelection).from(projects)
      .where(accessibleProjectsWhere(auth)).orderBy(asc(projects.name));
    return { success: true, projects: rows };
  } catch (error) {
    console.error("[projects] list failed:", error);
    return { success: false, error: { code: "load_failed", message: "Projects could not be loaded. Try again." } };
  }
}

export async function createProject(
  input: { name: string; description?: string | null },
  context: { orgId: string },
): Promise<CreateProjectResponse> {
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { success: false, error: sessionError };
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0] === "description" ? "description" : "name";
    return { success: false, error: { code: "validation", field, message: issue.message } };
  }
  try {
    const [created] = await db.insert(projects).values({
      orgId: auth.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      createdBy: auth.userId,
    }).onConflictDoNothing().returning(projectSelection);
    if (created) return { success: true, project: created };

    // Concurrent creates and case-only duplicates resolve to the same visible
    // Project. A guest must never learn a hidden Project's identity here.
    const [existing] = await db.select(projectSelection).from(projects)
      .where(and(accessibleProjectsWhere(auth), eq(sql`lower(${projects.name})`, sql`lower(${parsed.data.name})`)))
      .limit(1);
    if (existing) return { success: true, project: existing };
    return { success: false, error: { code: "conflict", message: "This Project name is unavailable. Choose another name.", field: "name" } };
  } catch (error) {
    console.error("[projects] create failed:", error);
    return { success: false, error: { code: "save_failed", message: "The Project could not be created. Try again." } };
  }
}
