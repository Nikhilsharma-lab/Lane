import "server-only";

import { asc } from "drizzle-orm";

import { db, projects } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import type { ProjectOption } from "@/lib/request-properties";

/**
 * Plan item 1.8: the Projects a member may see, read by the (app) layout so the
 * sidebar and the pickers start with data instead of calling the listProjects
 * action after hydration. Same selection and guard as that action (the action
 * stays for the client refresh after a create or a failed load).
 */
export async function loadProjects(auth: MemberAuth): Promise<ProjectOption[]> {
  return db
    .select({ id: projects.id, name: projects.name, description: projects.description })
    .from(projects)
    .where(accessibleProjectsWhere(auth))
    .orderBy(asc(projects.name));
}
