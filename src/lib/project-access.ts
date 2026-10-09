import { and, eq, exists, or } from "drizzle-orm";
import { db, projects, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";

/** Shared by picker, duplicate resolution and Intake validation. */
export function accessibleProjectsWhere(auth: MemberAuth) {
  return and(
    eq(projects.orgId, auth.orgId),
    auth.role === "guest"
      ? or(
          eq(projects.createdBy, auth.userId),
          exists(db.select({ id: requests.id }).from(requests).where(and(
            eq(requests.orgId, auth.orgId),
            eq(requests.createdBy, auth.userId),
            eq(requests.projectId, projects.id),
          ))),
        )
      : undefined,
  );
}

export async function canUseProject(projectId: string | null, auth: MemberAuth) {
  if (projectId === null) return true;
  const [project] = await db.select({ id: projects.id }).from(projects)
    .where(and(accessibleProjectsWhere(auth), eq(projects.id, projectId)))
    .limit(1);
  return Boolean(project);
}
