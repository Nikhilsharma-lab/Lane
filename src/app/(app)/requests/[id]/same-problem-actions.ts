"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireActiveMember, guardCanChange } from "@/lib/auth-guard";
import { loadIterations } from "@/lib/data/impact";
import type { Iterations } from "@/lib/impact-read-model";
import { canChangeThings } from "@/lib/role-rules";
import { linkRequests, readSameProblemHistory, sameProblemGroupOf, unlinkRequest, type SameProblemHistoryLine } from "@/lib/same-problem";

/**
 * #218: Same problem links on a Request page. Admins and Members add and remove them at any status, Closed included;
 * nothing on either Request changes. Guests see no links; Viewers read them all and change nothing.
 * Workspace from the page, identity and role from the session (the shared guards).
 */

const GUEST_REFUSAL = "Guests can’t link Requests in this workspace.";
const UNAVAILABLE = "Request unavailable.";

const linkSchema = z.object({ requestId: z.uuid(), otherRequestId: z.uuid() });
const unlinkSchema = z.object({ requestId: z.uuid() });

export type SameProblemView =
  | { shown: false }
  | { shown: true; iterations: Iterations | null; history: SameProblemHistoryLine[]; canChange: boolean };

/** Links two Requests as Same problem: their groups join, and two groups combine. */
export async function linkSameProblem(data: { requestId: string; otherRequestId: string }, context: { orgId: string }): Promise<{ success: true } | { error: string; sessionExpired?: true }> {
  const parsed = linkSchema.safeParse(data);
  if (!parsed.success) return { error: "Choose a Request to link." };
  const auth = await guardCanChange(context.orgId, GUEST_REFUSAL);
  if ("error" in auth) return auth;
  const result = await linkRequests(auth, parsed.data.requestId, parsed.data.otherRequestId);
  if ("success" in result) revalidatePath("/impact");
  return result;
}

/** Takes one Request out of its Same problem group; the rest stay linked. */
export async function removeSameProblemLink(data: { requestId: string }, context: { orgId: string }): Promise<{ success: true } | { error: string; sessionExpired?: true }> {
  const parsed = unlinkSchema.safeParse(data);
  if (!parsed.success) return { error: UNAVAILABLE };
  const auth = await guardCanChange(context.orgId, GUEST_REFUSAL);
  if ("error" in auth) return auth;
  const result = await unlinkRequest(auth, parsed.data.requestId);
  if ("success" in result) revalidatePath("/impact");
  return result;
}

/** "Iterations of this problem" and the Request's link history, for its page. Nothing for a guest. */
export async function readSameProblem(requestId: string, context: { orgId: string }): Promise<SameProblemView | { error: string; sessionExpired?: true }> {
  try {
    if (!z.uuid().safeParse(requestId).success) return { error: UNAVAILABLE };
    const auth = await requireActiveMember(context.orgId);
    if (!auth) return { error: UNAVAILABLE };
    if (auth.role === "guest") return { shown: false };
    const group = await sameProblemGroupOf(auth, requestId);
    if (group === undefined) return { error: UNAVAILABLE };
    const [iterations, history] = await Promise.all([loadIterations(auth, requestId, group, { now: new Date() }), readSameProblemHistory(auth, requestId)]);
    return { shown: true, iterations, history, canChange: canChangeThings(auth.role) };
  } catch {
    return { error: "Couldn't load the Iterations. Try again." };
  }
}
