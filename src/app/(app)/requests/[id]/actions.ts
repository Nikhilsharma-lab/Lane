"use server";

import { CANNOT_CHANGE_REQUESTS, transitionRequests } from "@/lib/request-transition";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, requests, comments, notifications, requestAttachments } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { requireActiveMember, requireMemberOrAbove } from "@/lib/auth-guard";
import { REQUEST_ATTACHMENTS_BUCKET } from "@/lib/request-attachments";
import { nameReviewResetActor } from "@/lib/request-reviewers";
import { requestPrioritySchema } from "@/lib/request-properties";
import { createServiceClient } from "@/lib/supabase/admin";
import { MAX_MEASUREMENT_GUARDRAILS, measurementPlanSchema, measurementRequestTypeIssue, type MeasurementPlan } from "@/lib/request-measurement";

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
  if (!auth) return { error: "Not found" };

  const parsed = commentSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  // A guest may comment only on a Request they created; anything else reads
  // as missing, the same answer as another workspace's or a malformed id.
  const guestGuard =
    auth.role === "guest" ? sql`and ${requests.createdBy} = ${auth.userId}` : sql``;
  const rows = await db.execute<{ id: string; created_at: Date | string }>(sql`
    with r as (
      select ${requests.id}, ${requests.orgId}, ${requests.createdBy}, ${requests.assignedTo}
      from ${requests}
      where ${requests.id} = ${requestId}
        and ${requests.orgId} = ${auth.orgId}
        ${guestGuard}
    ), c as (
      insert into ${comments} ("request_id", "author_id", "body")
      select r.id, ${auth.userId}, ${parsed.data.body} from r
      returning ${comments.id}, ${comments.createdAt}
    ), n as (
      insert into ${notifications} ("user_id", "org_id", "type", "request_id", "actor_id")
      select distinct recipient, r.org_id, ${"comment_added"}::notification_type, r.id, ${auth.userId}
      from r cross join c cross join unnest(array[r.created_by, r.assigned_to]) as recipient
      where recipient is not null and recipient <> ${auth.userId}
      returning ${notifications.id}
    )
    select c.id as id, c.created_at as created_at from c
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
    .where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId), eq(requests.status, "open"), sql`${requests.exceptionClosure} is null`, auth.role === "admin" ? undefined : eq(requests.createdBy, auth.userId)))
    .returning({ priority: requests.priority });

  if (!updated) return { error: "Request not found" };

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true as const, priority: updated.priority };
}

const currentValuesSchema = z.strictObject({
  expectedImpact: measurementPlanSchema,
  primary: z.number().finite().nullable(),
  guardrails: z.array(z.number().finite().nullable()).max(MAX_MEASUREMENT_GUARDRAILS),
});

/** The requester may supply missing numbers while Open. The client snapshot is
 * a compare-and-swap version, never a source of editable metric definitions. */
export async function saveRequestCurrentValues(
  requestId: string,
  input: unknown,
  context: { orgId: string }
): Promise<{ error: string } | { success: true; impact: MeasurementPlan }> {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireActiveMember(context.orgId);
  if (!auth) return { error: "Not found" };
  const parsed = currentValuesSchema.safeParse(input);
  if (!parsed.success) return { error: "Enter valid current values for the saved metrics." };

  const result = await db.transaction(async tx => {
  // This also permits a guest to supply numbers for their own Request. It
  // grants neither pickup permission nor access to another person's Request.
  const [request] = await tx.select({
    status: requests.status,
    expectedImpact: requests.expectedImpact,
    requestType: requests.requestType,
  }).from(requests).where(and(
    eq(requests.id, requestId),
    eq(requests.orgId, auth.orgId),
    eq(requests.createdBy, auth.userId),
  )).for("update");
  if (!request) return { error: "Not found" };
  if (request.status !== "open") return { error: "Current values can only change before this Request is picked up." };
  const stored = measurementPlanSchema.safeParse(request.expectedImpact);
  if (!stored.success) return { error: "This Request does not have an editable measurement plan." };
  if (JSON.stringify(stored.data) !== JSON.stringify(parsed.data.expectedImpact)) {
    return { error: "The measurement plan changed. Refresh before editing current values." };
  }
  if (parsed.data.guardrails.length !== stored.data.guardrails.length) {
    return { error: "Enter a current value or leave it blank for each saved guardrail." };
  }
  const next = measurementPlanSchema.safeParse({
    ...stored.data,
    primary: { ...stored.data.primary, current: parsed.data.primary },
    guardrails: stored.data.guardrails.map((guardrail, index) => ({ ...guardrail, current: parsed.data.guardrails[index] })),
  });
  if (!next.success) return { error: next.error.issues[0].message };
  const typeIssue = measurementRequestTypeIssue(next.data, request.requestType);
  if (typeIssue) return { error: typeIssue };

  // Changing values resets reviews; the notification names this editor.
  await nameReviewResetActor(tx, auth.userId);
  const [updated] = await tx.update(requests).set({ expectedImpact: next.data }).where(and(
    eq(requests.id, requestId),
    eq(requests.orgId, auth.orgId),
    eq(requests.createdBy, auth.userId),
    eq(requests.status, "open"),
    sql`${requests.expectedImpact} = ${JSON.stringify(request.expectedImpact)}::jsonb`,
    sql`${requests.requestType} is not distinct from ${request.requestType}::request_type`,
  )).returning({ id: requests.id });
  if (!updated) return { error: "This Request changed before the values were saved. Refresh and try again." };
  return { success: true as const, impact: next.data };
  });
  if ("error" in result) return result;
  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return result;
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
  if (!auth) return { error: "Not found" };

  const result = await db.transaction(async (tx): Promise<{ error: string } | { files: string[] }> => {
    const [request] = await tx.select({ status: requests.status, createdBy: requests.createdBy })
      .from(requests)
      .where(and(eq(requests.id, requestId), eq(requests.orgId, auth.orgId)))
      .for("update");
    if (!request || (auth.role === "guest" && request.createdBy !== auth.userId)) return { error: "Not found" };
    if (request.createdBy !== auth.userId && auth.role !== "admin") return { error: "Only the requester or an admin can delete this Request." };
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
    const { error } = await createServiceClient().storage.from(REQUEST_ATTACHMENTS_BUCKET).remove(result.files);
    if (error) console.error("[request/delete] file cleanup failed", { count: result.files.length, kind: error.name });
  }

  revalidatePath("/");
  return { success: true };
}
