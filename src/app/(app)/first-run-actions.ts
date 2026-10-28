"use server";

import { revalidatePath } from "next/cache";
import { guardActiveMember } from "@/lib/auth-guard";
import { changeFirstRun } from "@/lib/first-run";
import { parseFirstRunChange } from "@/lib/first-run-rules";

/**
 * #217: the signed-in person's own first run in this workspace: a step read, skip, finish, or reopen from help.
 * It is personal state, like the profile label, so every role may change their own, Viewers included. The
 * workspace comes from the page; the person only from the session.
 */
export async function updateFirstRun(data: { change: string; step?: string }, context: { orgId: string }): Promise<{ success: true } | { error: string; sessionExpired?: true }> {
  const change = parseFirstRunChange(data);
  if (!change) return { error: "That step isn't part of your first run." };
  const auth = await guardActiveMember(context.orgId, "You can't change the first run in this workspace.");
  if ("error" in auth) return auth;

  const result = await changeFirstRun(auth, change);
  if ("refused" in result)
    return { error: result.refused === "not_a_step" ? "That step isn't part of your first run." : "Your first run isn't ready yet. Reload the page and try again." };
  // Only skip, finish and reopen change what the pages show; a step read is already on screen.
  if (change.change !== "step") { revalidatePath("/"); revalidatePath("/intake"); }
  return { success: true };
}
