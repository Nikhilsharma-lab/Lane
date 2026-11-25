import "server-only";
import { eq } from "drizzle-orm";
import { profiles } from "@/db";
import type { WorkspacePerson } from "./auth-guard";
import type { RequestTx } from "./request-change-store";

/**
 * Saves the person's last-used workspace, which the caller has resolved from their session. `first` says none was
 * saved before.
 */
export async function saveLastUsed(tx: RequestTx, { userId, orgId }: WorkspacePerson): Promise<{ first: boolean }> {
  const [before] = await tx.select({ saved: profiles.lastWorkspaceId }).from(profiles).where(eq(profiles.id, userId)).for("update");
  await tx.update(profiles).set({ lastWorkspaceId: orgId }).where(eq(profiles.id, userId));
  return { first: before.saved === null };
}
