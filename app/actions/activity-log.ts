"use server";

import { systemDb } from "@/db/system";
import { activityLog, profiles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// logActivity is an internal utility called from within authenticated contexts.
// It uses the system DB (privileged) intentionally — authorization is enforced
// by the callers, not at this layer.
export async function logActivity(data: {
  requestId: string;
  actorId: string | null;
  action: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: Record<string, unknown>;
}) {
  await systemDb.insert(activityLog).values({
    requestId: data.requestId,
    actorId: data.actorId,
    action: data.action,
    field: data.field ?? null,
    oldValue: data.oldValue ?? null,
    newValue: data.newValue ?? null,
    metadata: data.metadata ?? {},
  });
}

export async function getActivityLog(requestId: string) {
  const entries = await systemDb
    .select({
      id: activityLog.id,
      requestId: activityLog.requestId,
      actorId: activityLog.actorId,
      action: activityLog.action,
      field: activityLog.field,
      oldValue: activityLog.oldValue,
      newValue: activityLog.newValue,
      metadata: activityLog.metadata,
      createdAt: activityLog.createdAt,
      actorName: profiles.fullName,
    })
    .from(activityLog)
    .leftJoin(profiles, eq(activityLog.actorId, profiles.id))
    .where(eq(activityLog.requestId, requestId))
    .orderBy(desc(activityLog.createdAt));

  return entries;
}
