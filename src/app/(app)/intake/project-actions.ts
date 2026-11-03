"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { db, projects, requests, workspaceLabels } from "@/db";
import { guardActiveMember, guardCanChange, guardCanContribute } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import { projectInputSchema, type ProjectOption } from "@/lib/request-properties";

export type ProjectFailure = {
  code: "session_expired" | "validation" | "conflict" | "load_failed" | "save_failed";
  message: string;
  field?: "name" | "description";
};
export type ListProjectsResponse = { success: true; projects: ProjectOption[] } | { success: false; error: ProjectFailure };
export type CreateProjectResponse = { success: true; project: ProjectOption } | { success: false; error: ProjectFailure };
export type DeleteProjectResponse = { success: true } | { success: false; error: ProjectFailure };

const projectSelection = { id: projects.id, name: projects.name, description: projects.description };
const sessionError: ProjectFailure = { code: "session_expired", message: "Your session ended. Sign in again to use Projects." };

export async function deleteProject(id: string, context: { orgId: string }): Promise<DeleteProjectResponse> {
  const auth = await guardCanChange(context.orgId, "Only workspace Admins and Members can delete Projects.");
  if ("error" in auth) return { success: false, error: auth.sessionExpired ? sessionError : { code: "validation", message: auth.error } };
  if (!z.uuid().safeParse(id).success) return { success: false, error: { code: "validation", message: "Choose a valid Project." } };
  try {
    await db.transaction(async tx => {
      const scope = and(eq(projects.orgId, auth.orgId), eq(projects.id, id));
      // Lock the parent before detaching children, so concurrent assignment cannot leave a dangling Project.
      const [project] = await tx.select({ id: projects.id }).from(projects).where(scope).for("update");
      if (!project) return; // A repeated confirmation is safe; another workspace is never touched.
      await tx.update(requests).set({
        projectId: null,
        labelKeys: sql`array(select key from unnest(${requests.labelKeys}) as key where not exists (
          select 1 from ${workspaceLabels} where ${workspaceLabels.id}::text = key
            and ${workspaceLabels.orgId} = ${auth.orgId} and ${workspaceLabels.projectId} = ${id}
        ))`,
      }).where(and(eq(requests.orgId, auth.orgId), eq(requests.projectId, id)));
      await tx.delete(workspaceLabels).where(and(eq(workspaceLabels.orgId, auth.orgId), eq(workspaceLabels.projectId, id)));
      await tx.delete(projects).where(scope);
    });
  } catch (error) {
    console.error("[projects] delete failed:", error);
    return { success: false, error: { code: "save_failed", message: "The Project couldn't be deleted. Try again." } };
  }
  revalidatePath("/", "layout");
  return { success: true };
}

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

    // Concurrent creates and case-only duplicates resolve to the same visible
    // Project. A guest must never learn a hidden Project's identity here.
    const [existing] = await db.select(projectSelection).from(projects)
      .where(and(accessibleProjectsWhere(auth), eq(sql`lower(${projects.name})`, sql`lower(${parsed.data.name})`)))
      .limit(1);
    if (existing) return { success: true, project: existing };
    return { success: false, error: { code: "conflict", message: "This Project name is unavailable. Choose another name.", field: "name" } };
  } catch (error) {
    console.error("[projects] create failed:", error);
    return { success: false, error: { code: "save_failed", message: "The Project couldn't be created. Try again." } };
  }
}
