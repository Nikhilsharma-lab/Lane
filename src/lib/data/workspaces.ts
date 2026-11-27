import "server-only";

import { asc, eq, sql } from "drizzle-orm";

import { db, member, workspaces } from "@/db";

/** A workspace as the account menu's switcher lists it. */
export type OwnWorkspace = { id: string; name: string };

/** #389: the person's workspaces, by name: the ones they have a member row in. */
export async function loadWorkspaces(userId: string): Promise<OwnWorkspace[]> {
  return db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(member)
    .innerJoin(workspaces, eq(workspaces.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(sql`lower(${workspaces.name})`, asc(workspaces.id));
}
