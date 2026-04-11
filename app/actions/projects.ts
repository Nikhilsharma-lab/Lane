"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withUserDb } from "@/db/user";
import { projects, profiles, requests, projectMembers } from "@/db/schema";
import { eq, and, ne, isNull } from "drizzle-orm";
import { PROJECT_COLORS } from "@/lib/projects";

async function getAuthedUserId() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function createProject(formData: FormData) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const color = (formData.get("color") as string) || "#71717a";
  const targetDate = (formData.get("targetDate") as string) || null;

  if (!name) return { error: "Project name is required" };
  if (!(PROJECT_COLORS as readonly string[]).includes(color)) return { error: "Invalid color" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [project] = await db.insert(projects).values({
      orgId: profile.orgId,
      name,
      description,
      color,
      targetDate,
      leadId: userId,
      createdBy: profile.id,
    }).returning();

    // Add creator as lead member
    await db.insert(projectMembers).values({
      projectId: project.id,
      userId,
      role: "lead",
    });

    revalidatePath("/settings/projects");
    revalidatePath("/dashboard/projects");
    revalidatePath("/dashboard");
    return { success: true, project };
  });
}

export async function updateProject(projectId: string, formData: FormData) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim() || null;
  const color = formData.get("color") as string;

  if (!name) return { error: "Project name is required" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

    const finalColor = color || project.color;
    if (!(PROJECT_COLORS as readonly string[]).includes(finalColor)) return { error: "Invalid color" };

    await db.update(projects)
      .set({ name, description, color: finalColor, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    revalidatePath("/settings/projects");
    revalidatePath("/dashboard");
    return { success: true };
  });
}

export async function archiveProject(projectId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

    await db.update(projects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    revalidatePath("/settings/projects");
    revalidatePath("/dashboard");
    return { success: true };
  });
}

export async function unarchiveProject(projectId: string) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

    await db.update(projects)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(projects.id, projectId));

    revalidatePath("/settings/projects");
    revalidatePath("/dashboard");
    return { success: true };
  });
}

export async function deleteProject(
  projectId: string,
  action: "move" | "delete",
  moveToProjectId?: string
) {
  const userId = await getAuthedUserId();
  if (!userId) return { error: "Not authenticated" };

  return withUserDb(userId, async (db) => {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (!profile) return { error: "Not authenticated" };

    const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
    if (!project || project.orgId !== profile.orgId) return { error: "Project not found" };

    const [otherProject] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.orgId, profile.orgId), ne(projects.id, projectId), isNull(projects.archivedAt)))
      .limit(1);
    if (!otherProject) return { error: "You can't delete your last project. Create another project first." };

    if (action === "move") {
      if (!moveToProjectId) return { error: "Target project is required" };
      const [target] = await db.select().from(projects).where(eq(projects.id, moveToProjectId));
      if (!target || target.orgId !== profile.orgId || target.archivedAt) return { error: "Target project not found" };

      await db.update(requests)
        .set({ projectId: moveToProjectId })
        .where(eq(requests.projectId, projectId));
    } else {
      await db.delete(requests).where(eq(requests.projectId, projectId));
    }

    await db.delete(projects).where(eq(projects.id, projectId));

    revalidatePath("/settings/projects");
    revalidatePath("/dashboard");
    return { success: true };
  });
}
