import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, workspaceLabels } from "@/db";
import { DEFAULT_LABELS } from "./request-labels";
import { labelKeysSchema } from "./request-label-schemas";
export async function canUseLabels(keys: string[] | undefined, orgId: string, projectId: string | null = null): Promise<boolean> {
 if (!labelKeysSchema.safeParse(keys).success) return false;
 const custom=(keys ?? []).filter(key=>!DEFAULT_LABELS.some(label=>label.id===key));
 if (!custom.length) return true;
 const rows=await db.select({id:workspaceLabels.id}).from(workspaceLabels).where(and(eq(workspaceLabels.orgId,orgId),inArray(workspaceLabels.id,custom),projectId ? or(isNull(workspaceLabels.projectId),eq(workspaceLabels.projectId,projectId)) : isNull(workspaceLabels.projectId)));
 return rows.length===custom.length;
}
