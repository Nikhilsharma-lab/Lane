import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, notifications } from "@/db/schema";
import { eq, and, isNull, lte, or, desc, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { InboxClient } from "./inbox-client";

export default async function InboxPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const actor = alias(profiles, "actor");
  const now = new Date();

  // All 3 queries are independent — run in parallel
  const [activeNotifs, archivedNotifs, [{ value: unreadCount }]] = await Promise.all([
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        url: notifications.url,
        readAt: notifications.readAt,
        archivedAt: notifications.archivedAt,
        snoozedUntil: notifications.snoozedUntil,
        createdAt: notifications.createdAt,
        requestId: notifications.requestId,
        actorName: actor.fullName,
      })
      .from(notifications)
      .leftJoin(actor, eq(notifications.actorId, actor.id))
      .where(
        and(
          eq(notifications.recipientId, user.id),
          isNull(notifications.archivedAt),
          or(
            isNull(notifications.snoozedUntil),
            lte(notifications.snoozedUntil, now)
          )
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(100),
    db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        body: notifications.body,
        url: notifications.url,
        readAt: notifications.readAt,
        archivedAt: notifications.archivedAt,
        snoozedUntil: notifications.snoozedUntil,
        createdAt: notifications.createdAt,
        requestId: notifications.requestId,
        actorName: actor.fullName,
      })
      .from(notifications)
      .leftJoin(actor, eq(notifications.actorId, actor.id))
      .where(
        and(
          eq(notifications.recipientId, user.id),
          sql`${notifications.archivedAt} IS NOT NULL`
        )
      )
      .orderBy(desc(notifications.archivedAt))
      .limit(50),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, user.id),
          isNull(notifications.archivedAt),
          isNull(notifications.readAt),
          or(
            isNull(notifications.snoozedUntil),
            lte(notifications.snoozedUntil, now)
          )
        )
      ),
  ]);

  const serialize = (n: (typeof activeNotifs)[number]) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    readAt: n.readAt?.toISOString() ?? null,
    archivedAt: n.archivedAt?.toISOString() ?? null,
    snoozedUntil: n.snoozedUntil?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
    requestId: n.requestId,
    actorName: n.actorName,
  });

  return (
    <InboxClient
      activeNotifications={activeNotifs.map(serialize)}
      archivedNotifications={archivedNotifs.map(serialize)}
      unreadCount={unreadCount}
    />
  );
}
