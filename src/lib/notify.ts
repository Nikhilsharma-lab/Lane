import "server-only";
import { sql, type SQL } from "drizzle-orm";
import type { notificationTypeEnum } from "@/db/schema/notifications";

export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

const value = (item: SQL | string) => (typeof item === "string" ? sql`${item}` : item);

/**
 * A call to public.notify (migration 0032), the one writer of in-app
 * notifications, for use inside the statement or transaction that makes the
 * change. Pass column references (sql`r.created_by`) or values. It never
 * notifies the actor, a missing recipient, anyone twice, or anyone without a
 * profile, and evaluates to how many it wrote.
 */
export function notify(recipients: (SQL | string)[], orgId: SQL | string, kind: NotificationType, requestId: SQL | string, actorId: string, detail?: string | null): SQL<number> {
  return sql<number>`public.notify(array[${sql.join(recipients.map(value), sql`, `)}]::text[], ${value(orgId)}, ${kind}::notification_type, ${value(requestId)}, ${actorId}, ${detail ?? null})`;
}
