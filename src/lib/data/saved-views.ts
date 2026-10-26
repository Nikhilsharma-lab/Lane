import "server-only";

import { cache } from "react";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, savedViews } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { readSavedViewFilters, type SavedView } from "@/lib/saved-view-rules";

// One read per render: the (app) layout's navigation and the list page share it.
const ownViews = cache(async (orgId: string, userId: string): Promise<SavedView[]> => {
  const rows = await db.select({ id: savedViews.id, name: savedViews.name, filters: savedViews.filters }).from(savedViews)
    .where(and(eq(savedViews.orgId, orgId), eq(savedViews.ownerId, userId)))
    .orderBy(asc(sql`lower(${savedViews.name})`), asc(savedViews.id));
  return rows.map(row => ({ id: row.id, name: row.name, filters: readSavedViewFilters(row.filters) }));
});

/** #219: the signed-in person's own saved views in this workspace, by name. Nobody else's are ever read. */
export function loadSavedViews(auth: MemberAuth): Promise<SavedView[]> {
  return ownViews(auth.orgId, auth.userId);
}
