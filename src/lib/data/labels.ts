import "server-only";

import { and, asc, eq, exists, isNull, or } from "drizzle-orm";

import { db, projects, workspaceLabels } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import { DEFAULT_LABELS, type RequestLabel } from "@/lib/request-labels";
import { canChangeThings } from "@/lib/role-rules";

export type LabelCatalogue = { labels: RequestLabel[]; canCreate: boolean };

/**
 * The labels a member may use: the defaults, the workspace's own, and labels of
 * Projects they can see (a guest sees only theirs). Read by the (app) layout so
 * pickers start with them, and by the listLabels action for a client refresh.
 */
export async function loadLabels(auth: MemberAuth): Promise<LabelCatalogue> {
  const labels = await db
    .select({ id: workspaceLabels.id, name: workspaceLabels.name, colour: workspaceLabels.colour, projectId: workspaceLabels.projectId })
    .from(workspaceLabels)
    .where(and(
      eq(workspaceLabels.orgId, auth.orgId),
      auth.role === "guest"
        ? or(isNull(workspaceLabels.projectId), exists(db.select({ id: projects.id }).from(projects).where(and(accessibleProjectsWhere(auth), eq(projects.id, workspaceLabels.projectId)))))
        : undefined,
    ))
    .orderBy(asc(workspaceLabels.name));
  return { labels: [...DEFAULT_LABELS, ...labels], canCreate: canChangeThings(auth.role) };
}
