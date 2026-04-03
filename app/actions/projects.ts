"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { projects, profiles, requests } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { PROJECT_COLORS } from "@/lib/projects";

async function getAuthProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  return profile ?? null;
}

export async function createProject(formData: FormData) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const color = (formData.get("color") as string) || "#71717a";

  if (!name) return { error: "Project name is required" };
  if (!(PROJECT_COLORS as readonly string[]).includes(color)) return { error: "Invalid color" };

  await db.insert(projects).values({
    orgId: profile.orgId,
    name,
    description,
    color,
    createdBy: profile.id,
  });

  revalidatePath("/settings/projects");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateProject(projectId: string, formData: FormData) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const color = (formData.get("color") as string) || project.color;

  if (!name) return { error: "Project name is required" };
  if (!(PROJECT_COLORS as readonly string[]).includes(color)) return { error: "Invalid color" };

  await db.update(projects)
    .set({ name, description, color, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  revalidatePath("/settings/projects");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function archiveProject(projectId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

  await db.update(projects)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  revalidatePath("/settings/projects");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function unarchiveProject(projectId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

  await db.update(projects)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  revalidatePath("/settings/projects");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteProject(
  projectId: string,
  action: "move" | "delete",
  moveToProjectId?: string
) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

  // Guard: must have at least one other project in the org
  const [otherProject] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.orgId, profile.orgId), ne(projects.id, projectId)))
    .limit(1);
  if (!otherProject) return { error: "You can't delete your last project. Create another project first." };

  if (action === "move") {
    if (!moveToProjectId) return { error: "Target project is required" };
    const [target] = await db.select().from(projects).where(eq(projects.id, moveToProjectId));
    if (!target || target.orgId !== profile.orgId) return { error: "Target project not found" };

    await db.update(requests)
      .set({ projectId: moveToProjectId })
      .where(eq(requests.projectId, projectId));
  } else {
    // Delete all requests in this project (cascades to comments, assignments, etc.)
    await db.delete(requests).where(eq(requests.projectId, projectId));
  }

  await db.delete(projects).where(eq(projects.id, projectId));

  revalidatePath("/settings/projects");
  revalidatePath("/dashboard");
  return { success: true };
}
