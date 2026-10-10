"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, requests, comments, notifications, requestAttachments } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { requireActiveMember, requireMemberOrAbove } from "@/lib/auth-guard";
import { createNotifications } from "@/lib/notify";
import { REQUEST_ATTACHMENTS_BUCKET } from "@/lib/request-attachments";
import { requestPrioritySchema } from "@/lib/request-properties";
import { createServiceClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Members and admins change Requests; guests and anyone outside the
 * workspace get this instead of "Not found", which is kept for a Request that
 * is missing or belongs to another workspace. */
const CANNOT_CHANGE_REQUESTS = "You can't change Requests in this workspace.";

type LifecycleTransition = {
  /** The status the Request must still have for the move to apply. */
  from: "open" | "in_progress";
  to: "in_progress" | "done";
  notification: "request_picked_up" | "request_done";
  /** What the Request is "no longer" when the status guard fails. */
  label: "Open" | "In Progress";
  /** The verb for the race copy: the row matched the guard but did not update. */
  verb: "pick it up" | "mark it Done";
};

const PICK_UP: LifecycleTransition = {
  from: "open",
  to: "in_progress",
  notification: "request_picked_up",
  label: "Open",
  verb: "pick it up",
};

const MARK_DONE: LifecycleTransition = {
  from: "in_progress",
  to: "done",
  notification: "request_done",
  label: "In Progress",
  verb: "mark it Done",
};

/** Moves a Request between lifecycle statuses in ONE statement (plan item 1.4).
 * A data-modifying CTE does the conditional UPDATE and inserts the requester's
 * notification from the row it returned, so both commit or fail together and
 * concurrent callers can only win once: the second UPDATE re-checks the status
 * guard on the locked row and matches nothing. The outer SELECT reads from `u`
 * with a LEFT JOIN on the insert, so the caller still sees the update when the
 * insert skipped a self-notification (`created_by <> actor`, as notify.ts did).
 *
 * Decision 8.17: a failed notification insert now fails the whole mutation.
 * Nothing swallows the error any more; a Done Request without its notification
 * was the worse outcome. */
async function transitionRequest(
  transition: LifecycleTransition,
  requestId: string,
  auth: { userId: string; orgId: string }
): Promise<{ id: string } | undefined> {
  const assignment =
    transition.to === "in_progress"
      ? sql`"status" = ${transition.to}::request_status, "assigned_to" = ${auth.userId}`
      : sql`"status" = ${transition.to}::request_status`;
  const rows = await db.execute<{ id: string; notification_id: string | null }>(sql`
    with u as (
      update ${requests}
      set ${assignment}
      where ${requests.id} = ${requestId}
        and ${requests.orgId} = ${auth.orgId}
        and ${requests.status} = ${transition.from}::request_status
      returning ${requests.id}, ${requests.orgId}, ${requests.createdBy}
    ), n as (
      insert into ${notifications} ("user_id", "org_id", "type", "request_id", "actor_id")
      select u.created_by, u.org_id, ${transition.notification}::notification_type, u.id, ${auth.userId}
      from u
      where u.created_by <> ${auth.userId}
      returning ${notifications.id}
    )
    select u.id as id, n.id as notification_id
    from u left join n on true
  `);
  return rows[0];
}

/** Runs only after the one-statement transition matched no row, to say why
 * in the same words as before: missing, another workspace's, already moved
 * on, or changed between the two statements. */
async function explainFailedTransition(
  transition: LifecycleTransition,
  requestId: string,
  orgId: string
): Promise<string> {
  const [req] = await db
    .select({ status: requests.status, orgId: requests.orgId })
    .from(requests)
    .where(eq(requests.id, requestId));

  if (!req) return "Request not found";
  if (req.orgId !== orgId) return "Not found";
  if (req.status !== transition.from) {
    return `This Request is no longer ${transition.label}. Refresh to see its current state.`;
  }
  return `This Request changed before Lane could ${transition.verb}. Refresh and try again.`;
}

export async function pickUpRequest(
  requestId: string,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: CANNOT_CHANGE_REQUESTS };

  const updated = await transitionRequest(PICK_UP, requestId, auth);
  if (!updated) {
    // "changed before Lane could pick it up" when the guard matched after all.
    return { error: await explainFailedTransition(PICK_UP, requestId, auth.orgId) };
  }

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true };
}

export async function markDone(
  requestId: string,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: CANNOT_CHANGE_REQUESTS };

  const updated = await transitionRequest(MARK_DONE, requestId, auth);
  if (!updated) {
    // "changed before Lane could mark it Done" when the guard matched after all.
    return { error: await explainFailedTransition(MARK_DONE, requestId, auth.orgId) };
  }

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true };
}

const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty")
    .max(5000, "Comment must be 5,000 characters or fewer"),
});

/** How long after a Done move its Undo stays valid. The list's toast offers it
 * for seconds; the window only has to outlast a slow network.
 *
 * Decision 8.18: the window is measured from updated_at (stamped by the 0002
 * trigger on every update), so a priority edit on a Done Request restarts it.
 * A dedicated done_at column (migration 0020) is the alternative if that ever
 * matters. */
const UNDO_DONE_WINDOW_MS = 15 * 60 * 1000;

/** Returns a Request that was just marked Done to In Progress: the undo for
 * markDone, not a reverse lifecycle move. It only applies while the Done move
 * is recent (updated_at, see UNDO_DONE_WINDOW_MS), the status row and its Done
 * notification change together in one statement, and Closed outcomes are a
 * later lifecycle state that never reopens this way. */
export async function undoMarkDone(
  requestId: string,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: CANNOT_CHANGE_REQUESTS };

  // One CTE: the conditional UPDATE and the DELETE of the Done notification
  // commit or fail together, and the DELETE only runs when the UPDATE matched.
  const windowStart = new Date(Date.now() - UNDO_DONE_WINDOW_MS);
  const rows = await db.execute<{ status: "in_progress" }>(sql`
    with u as (
      update ${requests}
      set "status" = ${"in_progress"}::request_status
      where ${requests.id} = ${requestId}
        and ${requests.orgId} = ${auth.orgId}
        and ${requests.status} = ${"done"}::request_status
        and ${requests.updatedAt} > ${windowStart.toISOString()}::timestamptz
      returning ${requests.id}, ${requests.status}
    ), d as (
      delete from ${notifications}
      where ${notifications.requestId} = ${requestId}
        and ${notifications.orgId} = ${auth.orgId}
        and ${notifications.type} = ${"request_done"}::notification_type
        and exists (select 1 from u)
      returning ${notifications.id}
    )
    select u.status as status from u
  `);
  const updated = rows[0];

  if (!updated) {
    const [req] = await db
      .select({ status: requests.status, orgId: requests.orgId, updatedAt: requests.updatedAt })
      .from(requests)
      .where(eq(requests.id, requestId));

    if (!req) return { error: "Request not found" };
    if (req.orgId !== auth.orgId) return { error: "Not found" };
    if (req.status !== "done") {
      return { error: "This Request is not Done. Refresh to see its current state." };
    }
    if (req.updatedAt.getTime() <= windowStart.getTime()) {
      return { error: "Undo is only offered right after a Request is marked Done. Further work needs a new Request." };
    }
    return {
      error:
        "This Request changed before Lane could undo. Refresh and try again.",
    };
  }

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true as const, status: updated.status };
}

export async function addComment(
  requestId: string,
  formData: FormData,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "Not found" };

  const parsed = commentSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const [req] = await db
    .select({ orgId: requests.orgId, createdBy: requests.createdBy, assignedTo: requests.assignedTo })
    .from(requests)
    .where(eq(requests.id, requestId));

  if (!req || req.orgId !== auth.orgId) {
    return { error: "Request not found" };
  }

  if (auth.role === "guest" && req.createdBy !== auth.userId) {
    return { error: "Not found" };
  }

  await db.insert(comments).values({
    requestId,
    authorId: auth.userId,
    body: parsed.data.body,
  });

  const recipients: string[] = [];
  if (auth.userId === req.createdBy) {
    if (req.assignedTo) recipients.push(req.assignedTo);
  } else if (auth.userId === req.assignedTo) {
    recipients.push(req.createdBy);
  } else {
    recipients.push(req.createdBy);
    if (req.assignedTo) recipients.push(req.assignedTo);
  }

  await createNotifications(
    recipients.map((userId) => ({
      userId,
      orgId: auth.orgId,
      type: "comment_added" as const,
      requestId,
      actorId: auth.userId,
    }))
  );

  revalidatePath(`/requests/${requestId}`);
  return { success: true };
}

export async function getAttachmentDownloadUrl(
  attachmentId: string,
  context: { orgId: string }
) {
  if (!UUID_RE.test(attachmentId)) return { error: "File not found" };
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "File not found" };

  const [attachment] = await db
    .select({
      storagePath: requestAttachments.storagePath,
      fileName: requestAttachments.fileName,
      requestCreatedBy: requests.createdBy,
    })
    .from(requestAttachments)
    .innerJoin(requests, eq(requestAttachments.requestId, requests.id))
    .where(
      and(
        eq(requestAttachments.id, attachmentId),
        eq(requestAttachments.orgId, auth.orgId),
        eq(requests.orgId, auth.orgId),
        sql`${requestAttachments.uploadedAt} is not null`
      )
    )
    .limit(1);

  if (
    !attachment ||
    (auth.role === "guest" &&
      attachment.requestCreatedBy !== auth.userId)
  ) {
    return { error: "File not found" };
  }

  const { data, error } = await createServiceClient()
    .storage.from(REQUEST_ATTACHMENTS_BUCKET)
    .createSignedUrl(attachment.storagePath, 60, {
      download: attachment.fileName,
    });

  if (error || !data) {
    console.error("[request/attachments] download signing failed:", error);
    return {
      error: "Lane could not prepare this download. Try again.",
    };
  }

  return { success: true, url: data.signedUrl };
}

/** Priority is a triage signal on the row. It never changes status,
 * assignment or what anyone may do; guests cannot set it. */
export async function setRequestPriority(
  requestId: string,
  priority: unknown,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const parsed = requestPrioritySchema.safeParse(priority);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: CANNOT_CHANGE_REQUESTS };

  const [updated] = await db
    .update(requests)
    .set({ priority: parsed.data })
    .where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId)))
    .returning({ priority: requests.priority });

  if (!updated) return { error: "Request not found" };

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true as const, priority: updated.priority };
}
