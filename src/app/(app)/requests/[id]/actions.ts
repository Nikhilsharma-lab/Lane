"use server";

import { revalidatePath } from "next/cache";
import { db, requests } from "@/db";
import { eq, and } from "drizzle-orm";
import { ensureWorkspace } from "@/lib/ensure-workspace";

export async function pickUpRequest(requestId: string) {
  const workspace = await ensureWorkspace();
  if (!workspace) return { error: "Not signed in" };

  // Verify the request belongs to this workspace and is open
  const [req] = await db
    .select({ status: requests.status, orgId: requests.orgId })
    .from(requests)
    .where(eq(requests.id, requestId));

  if (!req) return { error: "Request not found" };
  if (req.orgId !== workspace.orgId) return { error: "Not found" };
  if (req.status !== "open") return { error: "Only open requests can be picked up" };

  await db
    .update(requests)
    .set({ status: "in_progress", assignedTo: workspace.userId })
    .where(eq(requests.id, requestId));

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true };
}

export async function markDone(requestId: string) {
  const workspace = await ensureWorkspace();
  if (!workspace) return { error: "Not signed in" };

  const [req] = await db
    .select({ status: requests.status, orgId: requests.orgId })
    .from(requests)
    .where(eq(requests.id, requestId));

  if (!req) return { error: "Request not found" };
  if (req.orgId !== workspace.orgId) return { error: "Not found" };
  if (req.status !== "in_progress") return { error: "Only in-progress requests can be marked done" };

  await db
    .update(requests)
    .set({ status: "done" })
    .where(eq(requests.id, requestId));

  revalidatePath("/");
  revalidatePath(`/requests/${requestId}`);
  return { success: true };
}
