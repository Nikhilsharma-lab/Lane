"use server";

import { withAgreementProgress } from "@/lib/request-agreement-progress";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, requests, comments, notifications, requestAttachments } from "@/db";
import { and, eq, sql } from "drizzle-orm";
import { requireActiveMember, requireMemberOrAbove } from "@/lib/auth-guard";
import { REQUEST_ATTACHMENTS_BUCKET } from "@/lib/request-attachments";
import { nameReviewResetActor } from "@/lib/request-reviewers";
import { requestPrioritySchema } from "@/lib/request-properties";
import { createServiceClient } from "@/lib/supabase/admin";
import { MAX_MEASUREMENT_GUARDRAILS, measurementPlanSchema, measurementReadiness, measurementRequestTypeIssue, type MeasurementPlan } from "@/lib/request-measurement";

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
 * insert skipped a self-notification (`created_by <> actor`).
 *
 * Decision 8.17: a failed notification insert now fails the whole mutation.
 * Nothing swallows the error any more; a Done Request without its notification
 * was the worse outcome. */
async function transitionRequest(
  transition: LifecycleTransition,
  requestId: string,
  auth: { userId: string; orgId: string }
): Promise<{ id: string } | { error: string } | undefined> {
  const assignment =
    transition.to === "in_progress"
      ? sql`"status" = ${transition.to}::request_status, "assigned_to" = ${auth.userId}`
      : sql`"status" = ${transition.to}::request_status`;
  const readiness = transition.to === "in_progress"
    ? sql`public.request_measurement_ready(${requests.expectedImpact}, ${requests.requestType}::text)`
    : sql`true`;
  return withAgreementProgress(auth.orgId, auth.userId, [requestId], transition.from, async (tx, eligible, blocked) => {
  if (!eligible.length) return { error: blocked[0].error };
  const rows = await tx.execute<{ id: string; notification_id: string | null }>(sql`
    with u as (
      update ${requests}
      set ${assignment}
      where ${requests.id} = ${requestId}
        and ${requests.orgId} = ${auth.orgId}
        and ${requests.status} = ${transition.from}::request_status
        and ${readiness}
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
  });
}

/** Diagnoses a missed transition only within the authorized workspace.
 * Missing and invisible Requests have the same response; visible Requests
 * retain the status and race messages that explain how to recover. */
async function explainFailedTransition(
  transition: LifecycleTransition,
  requestId: string,
  orgId: string
): Promise<string> {
  const [req] = await db
    .select({ status: requests.status, expectedImpact: requests.expectedImpact, requestType: requests.requestType })
    .from(requests)
    .where(and(eq(requests.id, requestId), eq(requests.orgId, orgId)));

  if (!req) return "Not found";
  if (req.status !== transition.from) {
    return `This Request is no longer ${transition.label}. Refresh to see its current state.`;
  }
  if (transition.to === "in_progress") {
    const readiness = measurementReadiness(req.expectedImpact, req.requestType);
    if (readiness) return readiness;
  }
  return `This Request changed before Lane could ${transition.verb}. Refresh and try again.`;
}

export async function pickUpRequest(
  requestId: string,
  context: { orgId: string }
): Promise<{success?: boolean; error?: string}> {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: CANNOT_CHANGE_REQUESTS };

  const updated = await transitionRequest(PICK_UP, requestId, auth);
  if (updated && "error" in updated) return updated;
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
): Promise<{success?: boolean; error?: string}> {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: CANNOT_CHANGE_REQUESTS };

  const updated = await transitionRequest(MARK_DONE, requestId, auth);
  if (updated && "error" in updated) return updated;
  if (!updated) {
    // "changed before Lane could mark it Done" when the guard matched after all.
    return { error: await explainFailedTransition(MARK_DONE, requestId, auth.orgId) };
  }

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true };
}

/** The most rows one bulk move accepts: a page of the list at its largest. */
const BULK_LIMIT = 50;

type BulkOutcome = {
  error?: string;
  /** Ids the statement moved; their notifications were written with them. */
  moved: string[];
  /** Ids it did not move, each with the same copy a single move would show. */
  failed: { id: string; error: string }[];
};

/** Moves many Requests between lifecycle statuses in ONE statement (plan item
 * 1.6), with the single-row guards: the workspace, the from-status and the
 * member check before it. The notification INSERT reads the moved rows from
 * the UPDATE's RETURNING, so a row and its notification commit together. Only
 * when some ids did not move does one diagnostic read say why. */
async function transitionRequests(
  transition: LifecycleTransition,
  requestIds: string[],
  context: { orgId: string }
): Promise<BulkOutcome> {
  // Never trust the client's ids: anything but a string is dropped.
  const unique = [
    ...new Set(
      (Array.isArray(requestIds) ? requestIds : []).filter(
        (id): id is string => typeof id === "string"
      )
    ),
  ];
  const valid = unique.filter((id) => UUID_RE.test(id)).slice(0, BULK_LIMIT);
  const invalid = unique
    .filter((id) => !valid.includes(id))
    .map((id) => ({ id, error: "Not found" }));
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) {
    return {
      error: CANNOT_CHANGE_REQUESTS,
      moved: [],
      failed: unique.map((id) => ({ id, error: CANNOT_CHANGE_REQUESTS })),
    };
  }
  if (!valid.length) return { moved: [], failed: invalid };

  // Validated UUIDs only, so the array literal is one bound parameter.
  const outcome = await withAgreementProgress(auth.orgId, auth.userId, valid, transition.from, async (tx, eligible, blocked) => {
  if (!eligible.length) return { moved: [], failed: [...invalid, ...blocked] };
  const ids = `{${eligible.join(",")}}`;
  const assignment =
    transition.to === "in_progress"
      ? sql`"status" = ${transition.to}::request_status, "assigned_to" = ${auth.userId}`
      : sql`"status" = ${transition.to}::request_status`;
  const readiness = transition.to === "in_progress"
    ? sql`public.request_measurement_ready(${requests.expectedImpact}, ${requests.requestType}::text)`
    : sql`true`;
  const rows = await tx.execute<{ id: string }>(sql`
    with u as (
      update ${requests}
      set ${assignment}
      where ${requests.id} = any(${ids}::uuid[])
        and ${requests.orgId} = ${auth.orgId}
        and ${requests.status} = ${transition.from}::request_status
        and ${readiness}
      returning ${requests.id}, ${requests.orgId}, ${requests.createdBy}
    ), n as (
      insert into ${notifications} ("user_id", "org_id", "type", "request_id", "actor_id")
      select u.created_by, u.org_id, ${transition.notification}::notification_type, u.id, ${auth.userId}
      from u
      where u.created_by <> ${auth.userId}
      returning ${notifications.id}
    )
    select u.id as id from u
  `);
  const moved = rows.map((row) => row.id);
  const missed = eligible.filter((id) => !moved.includes(id));

  let failed = [...invalid, ...blocked];
  if (missed.length) {
    const found = await tx
      .select({ id: requests.id, status: requests.status, expectedImpact: requests.expectedImpact, requestType: requests.requestType })
      .from(requests)
      .where(and(
        eq(requests.orgId, auth.orgId),
        sql`${requests.id} = any(${`{${missed.join(",")}}`}::uuid[])`,
      ));
    failed = [
      ...invalid, ...blocked,
      ...missed.map((id) => {
        const req = found.find((row) => row.id === id);
        if (!req) return { id, error: "Not found" };
        if (req.status !== transition.from) {
          return { id, error: `This Request is no longer ${transition.label}. Refresh to see its current state.` };
        }
        if (transition.to === "in_progress") {
          const readiness = measurementReadiness(req.expectedImpact, req.requestType);
          if (readiness) return { id, error: readiness };
        }
        return { id, error: `This Request changed before Lane could ${transition.verb}. Refresh and try again.` };
      }),
    ];
  }

  return { moved, failed };
  });
  const { moved, failed } = outcome;
  if (moved.length) {
    revalidatePath("/");
    for (const id of moved) revalidatePath(`/requests/${id}`);
  }
  return { moved, failed };
}

/** Bulk pick up from the list's selection: one statement for every row. */
export async function pickUpRequests(
  requestIds: string[],
  context: { orgId: string }
) {
  return transitionRequests(PICK_UP, requestIds, context);
}

/** Bulk Done from the list's selection: one statement for every row. */
export async function markDoneMany(
  requestIds: string[],
  context: { orgId: string }
) {
  return transitionRequests(MARK_DONE, requestIds, context);
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
