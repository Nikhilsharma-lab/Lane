"use server";

import { canChange, changeable, seeable, seeableSql } from "@/lib/request-access";
import { notify } from "@/lib/notify";
import { CANNOT_CHANGE_REQUESTS, transitionRequests } from "@/lib/request-transition";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, requests, comments, notifications, requestAttachments } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { requireActiveMember, requireMemberOrAbove, refusal } from "@/lib/auth-guard";
import { requestPrioritySchema } from "@/lib/request-properties";
import { removeObjects, signDownload } from "@/lib/attachment-storage";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One Request's move: the same rules, copy and statement as a bulk move. */
async function transitionOne(
  move: "pick-up" | "done",
  requestId: string,
  context: { orgId: string }
): Promise<{success?: boolean; error?: string}> {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const outcome = await transitionRequests(move, [requestId], context);
  if (outcome.error) return { error: outcome.error };
  return outcome.moved.length ? { success: true } : { error: outcome.failed[0]?.error ?? "Not found" };
}

export async function pickUpRequest(requestId: string, context: { orgId: string }) {
  return transitionOne("pick-up", requestId, context);
}

export async function markDone(requestId: string, context: { orgId: string }) {
  return transitionOne("done", requestId, context);
}

/** Bulk pick up from the list's selection: one statement for every row. */
export async function pickUpRequests(requestIds: string[], context: { orgId: string }) {
  return transitionRequests("pick-up", requestIds, context);
}

/** Bulk Done from the list's selection: one statement for every row. */
export async function markDoneMany(requestIds: string[], context: { orgId: string }) {
  return transitionRequests("done", requestIds, context);
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
  if (!auth) return { error: await refusal(CANNOT_CHANGE_REQUESTS) };

  // One CTE: the conditional UPDATE and the DELETE of the Done notification
  // commit or fail together, and the DELETE only runs when the UPDATE matched.
  const windowStart = new Date(Date.now() - UNDO_DONE_WINDOW_MS);
  const rows = await db.execute<{ status: "in_progress" }>(sql`
    with u as (
      update ${requests}
      set "status" = ${"in_progress"}::request_status
      where ${requests.id} = ${requestId}
        and ${requests.orgId} = ${auth.orgId}
        and ${requests.exceptionClosure} is null
        and ${requests.outcomeClosure} is null
        and (${requests.releaseState} is null or ${requests.releaseState}->'release'='null'::jsonb)
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
      .select({ status: requests.status, updatedAt: requests.updatedAt })
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId)));

    if (!req) return { error: "Not found" };
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

/** Adds a comment and its notifications in ONE statement (plan item 2.5).
 * A data-modifying CTE reads the Request under the workspace guard (and, for
 * a guest, the creator guard), inserts the comment from that row, and inserts
 * a comment_added notification for the creator and the assignee, minus the
 * author and minus nobody, from the same row. `distinct` writes one when the
 * creator is also the assignee.
 *
 * Decision D2 (plan item 2.5, as decision 8.17 for lifecycle moves): the
 * comment and its notifications commit or fail together, so a failed
 * notification insert now fails the comment instead of being logged and
 * dropped. The new comment's id comes back for the pending-comment overlay. */
export async function addComment(
  requestId: string,
  formData: FormData,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("Not found") };

  const parsed = commentSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // Anyone who can see the Request comments; anything else reads as missing,
  // the same answer as another workspace's or a malformed id.
  const rows = await db.execute<{ id: string; created_at: Date | string }>(sql`
    with r as (
      select ${requests.id}, ${requests.orgId}, ${requests.createdBy}, ${requests.assignedTo}
      from ${requests}
      where ${requests.id} = ${requestId}
        ${seeableSql(auth)}
    ), c as (
      insert into ${comments} ("request_id", "author_id", "body")
      select r.id, ${auth.userId}, ${parsed.data.body} from r
      returning ${comments.id}, ${comments.createdAt}
    ), n as (
      select ${notify([sql`r.created_by`, sql`r.assigned_to`], sql`r.org_id`, "comment_added", sql`r.id`, auth.userId)} as sent
      from r cross join c
    )
    -- Joining n runs it: a plain CTE is evaluated only when read.
    select c.id as id, c.created_at as created_at from c cross join n
  `);
  const created = rows[0];

  if (!created) {
    return { error: "Not found" };
  }

  revalidatePath(`/requests/${requestId}`);
  return {
    success: true as const,
    comment: { id: created.id, createdAt: new Date(created.created_at) },
  };
}

export async function getAttachmentDownloadUrl(
  attachmentId: string,
  context: { orgId: string }
) {
  if (!UUID_RE.test(attachmentId)) return { error: "File not found" };
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("File not found") };

  const [attachment] = await db
    .select({
      storagePath: requestAttachments.storagePath,
      fileName: requestAttachments.fileName,
    })
    .from(requestAttachments)
    .innerJoin(requests, eq(requestAttachments.requestId, requests.id))
    .where(
      and(
        eq(requestAttachments.id, attachmentId),
        eq(requestAttachments.orgId, auth.orgId),
        seeable(auth),
        sql`${requestAttachments.uploadedAt} is not null`
      )
    )
    .limit(1);

  if (!attachment) return { error: "File not found" };

  try {
    return { success: true, url: await signDownload(attachment.storagePath, attachment.fileName) };
  } catch (error) {
    console.error("[request/attachments] download signing failed:", error);
    return { error: "Lane could not prepare this download. Try again." };
  }
}

/** Priority is a triage signal on the row. It never changes status,
 * assignment or what anyone may do. Whoever can change the Request sets it,
 * as the full editor does. */
export async function setRequestPriority(
  requestId: string,
  priority: unknown,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const parsed = requestPrioritySchema.safeParse(priority);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal(CANNOT_CHANGE_REQUESTS) };

  const [updated] = await db
    .update(requests)
    .set({ priority: parsed.data })
    .where(and(eq(requests.id, requestId), changeable(auth), eq(requests.status, "open"), sql`${requests.exceptionClosure} is null`))
    .returning({ priority: requests.priority });

  if (!updated) return { error: "Request not found" };

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true as const, priority: updated.priority };
}

/** The requester (or an admin) deletes a Request nobody has picked up yet. It
 * goes for good: its comments, files, notifications and reviews go with it.
 * Once work starts, a Request can only end with a result or a reason. */
export async function deleteRequest(
  requestId: string,
  context: { orgId: string }
): Promise<{ success: true } | { error: string }> {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: await refusal("Not found") };

  const result = await db.transaction(async (tx): Promise<{ error: string } | { files: string[] }> => {
    const [request] = await tx.select({ status: requests.status, createdBy: requests.createdBy })
      .from(requests)
      .where(and(eq(requests.id, requestId), seeable(auth)))
      .for("update");
    if (!request) return { error: "Not found" };
    if (!canChange(auth, request)) return { error: "Only the requester or an admin can delete this Request." };
    if (request.status !== "open") return { error: "Work has started, so this Request can’t be deleted. Close it without a result instead." };
    const files = await tx.select({ storagePath: requestAttachments.storagePath })
      .from(requestAttachments)
      .where(and(eq(requestAttachments.requestId, requestId), eq(requestAttachments.orgId, auth.orgId)));
    await tx.delete(requests).where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId), eq(requests.status, "open")));
    return { files: files.map(f => f.storagePath) };
  });
  if ("error" in result) return result;

  // The rows are gone; a stored file left behind is unreachable, so log rather than fail.
  if (result.files.length) {
    const { error } = await removeObjects(result.files);
    if (error) console.error("[request/delete] file cleanup failed", { count: result.files.length, kind: error.name });
  }

  revalidatePath("/");
  return { success: true };
}
