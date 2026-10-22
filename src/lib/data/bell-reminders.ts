import "server-only";

import { and, eq, or, sql } from "drizzle-orm";

import { db, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { seeable } from "@/lib/request-access";
import { remindersDue } from "@/lib/request-journey";
import { journeyStatusCondition, requesterColumn } from "@/lib/request-journey-sql";

/**
 * #127 / #136: bell reminders are written when a member's bell count loads, not by a scheduled job.
 * Asks the journey module which reminders `auth`'s member is owed today and inserts the missing ones
 * (no actor: Lane is reminding), following the writer contract on `DueReminder`: nothing of the same kind
 * for that Request and member since the reminder's `day`, and ON CONFLICT DO NOTHING against migration
 * 0033's once-a-day key, so concurrent loads write once.
 *
 * The recipient is always the signed-in member. Their session already proves workspace access, so the
 * live roster is not re-read on every bell load; guests never receive reminders.
 */
export async function writeDueReminders(auth: MemberAuth, now: Date = new Date()): Promise<void> {
  if (auth.role === "guest") return;

  // Only Done and Measuring Requests can owe a reminder, and only to their assignee or Requester; the
  // journey module's own conditions say which those are, and remindersDue decides the rest.
  const candidates = await db
    .select({
      id: requests.id,
      status: requests.status,
      releaseState: requests.releaseState,
      outcomeClosure: requests.outcomeClosure,
      exceptionClosure: requests.exceptionClosure,
      createdBy: requests.createdBy,
      assignedTo: requests.assignedTo,
      doneAt: requests.doneAt,
    })
    .from(requests)
    .where(
      and(
        seeable(auth),
        or(journeyStatusCondition("done"), journeyStatusCondition("measuring")),
        or(eq(requests.assignedTo, auth.userId), eq(requesterColumn, auth.userId))
      )
    );

  const me = new Set([auth.userId]);
  const due = candidates.flatMap((request) =>
    remindersDue(request, now, me).map((reminder) => ({ ...reminder, requestId: request.id }))
  );
  if (!due.length) return;

  const rows = sql.join(
    due.map((r) => sql`(${r.requestId}::uuid, ${r.kind}::public.notification_type, ${r.day}::date)`),
    sql`, `
  );
  await db.execute(sql`
    insert into public.notifications (user_id, org_id, type, request_id, actor_id, created_at)
    select ${auth.userId}, ${auth.orgId}, due.type, due.request_id, null, ${now.toISOString()}::timestamptz
    from (values ${rows}) as due(request_id, type, day)
    where not exists (
      select 1 from public.notifications sent
      where sent.request_id = due.request_id and sent.user_id = ${auth.userId} and sent.type = due.type
        and (sent.created_at at time zone 'UTC')::date >= due.day
    )
    on conflict do nothing
  `);
}
