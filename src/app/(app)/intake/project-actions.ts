"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { db, projects } from "@/db";
import { guardActiveMember, guardCanContribute } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import { projectInputSchema, type ProjectOption } from "@/lib/request-properties";

export type ProjectFailure = {
  code: "session_expired" | "validation" | "duplicate" | "conflict" | "load_failed" | "save_failed";
  message: string;
  field?: "name" | "description";
};
export type ListProjectsResponse = { success: true; projects: ProjectOption[] } | { success: false; error: ProjectFailure };
/** A `duplicate` refusal carries the `existing` Project: the sidebar's New Project says the name is taken, and the
 * New Request composer's picker quietly picks that Project instead. */
export type CreateProjectResponse = { success: true; project: ProjectOption } | { success: false; error: ProjectFailure; existing?: ProjectOption };

const projectSelection = { id: projects.id, name: projects.name, description: projects.description };
const sessionError: ProjectFailure = { code: "session_expired", message: "Your session ended. Sign in again to use Projects." };

export async function listProjects(context: { orgId: string }): Promise<ListProjectsResponse> {
  const auth = await guardActiveMember(context.orgId, "You do not have access to this workspace.");
  if ("error" in auth) return { success: false, error: auth.sessionExpired ? sessionError : { code: "validation", message: auth.error } };
  try {
    const rows = await db.select(projectSelection).from(projects)
      .where(accessibleProjectsWhere(auth)).orderBy(asc(projects.name));
    return { success: true, projects: rows };
  } catch (error) {
    console.error("[projects] list failed:", error);
    return { success: false, error: { code: "load_failed", message: "Projects couldn't be loaded. Try again." } };
  }
}

export async function createProject(
  input: { name: string; description?: string | null },
  context: { orgId: string },
): Promise<CreateProjectResponse> {
  const auth = await guardCanContribute(context.orgId, "You do not have access to this workspace.");
  if ("error" in auth) return { success: false, error: auth.sessionExpired ? sessionError : { code: "validation", message: auth.error } };
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

    // #269 (A19): the name is taken, in any capitals (the unique lower(name) index), including by a create that
    // landed a moment earlier. The answer names the Project as it is stored. A guest must never learn a hidden Project's identity here.
    const [existing] = await db.select(projectSelection).from(projects)
      .where(and(accessibleProjectsWhere(auth), eq(sql`lower(${projects.name})`, sql`lower(${parsed.data.name})`)))
      .limit(1);
    if (existing) return { success: false, error: { code: "duplicate", field: "name", message: `A Project called ${existing.name} already exists. Choose another name.` }, existing };
    return { success: false, error: { code: "conflict", message: "This Project name is unavailable. Choose another name.", field: "name" } };
  } catch (error) {
    console.error("[projects] create failed:", error);
    return { success: false, error: { code: "save_failed", message: "The Project couldn't be created. Try again." } };
  }
}
