"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, requests, comments } from "@/db";
import { eq } from "drizzle-orm";
import { requireActiveMember, requireMemberOrAbove } from "@/lib/auth-guard";
import { createNotification, createNotifications } from "@/lib/notify";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pickUpRequest(
  requestId: string,
  context: { orgId: string }
) {
  if (!UUID_RE.test(requestId)) return { error: "Not found" };
  const auth = await requireMemberOrAbove(context.orgId);
  if (!auth) return { error: "Not found" };

  const [req] = await db
    .select({ status: requests.status, orgId: requests.orgId, createdBy: requests.createdBy })
    .from(requests)
    .where(eq(requests.id, requestId));

  if (!req) return { error: "Request not found" };
  if (req.orgId !== auth.orgId) return { error: "Not found" };
  if (req.status !== "open")
    return { error: "Only open requests can be picked up" };

  await db
    .update(requests)
    .set({ status: "in_progress", assignedTo: auth.userId })
    .where(eq(requests.id, requestId));

  await createNotification({
    userId: req.createdBy,
    orgId: auth.orgId,
    type: "request_picked_up",
    requestId,
    actorId: auth.userId,
  });

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
  if (!auth) return { error: "Not found" };

  const [req] = await db
    .select({ status: requests.status, orgId: requests.orgId, createdBy: requests.createdBy })
    .from(requests)
    .where(eq(requests.id, requestId));

  if (!req) return { error: "Request not found" };
  if (req.orgId !== auth.orgId) return { error: "Not found" };
  if (req.status !== "in_progress")
    return { error: "Only in-progress requests can be marked done" };

  await db
    .update(requests)
    .set({ status: "done" })
    .where(eq(requests.id, requestId));

  await createNotification({
    userId: req.createdBy,
    orgId: auth.orgId,
    type: "request_done",
    requestId,
    actorId: auth.userId,
  });

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true };
}

const commentSchema = z.object({
  body: z.string().min(1, "Comment cannot be empty").max(5000),
});

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
