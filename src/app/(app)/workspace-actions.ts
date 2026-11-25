"use server";

import { db } from "@/db";
import type { AuthAnswer, DoorAnswer } from "@/lib/auth-answer";
import { askAuthServer } from "@/lib/auth-server";
import { loadWorkspaces } from "@/lib/data/workspaces";
import { saveLastUsed } from "@/lib/last-workspace";
import { readSession } from "@/lib/session";

/**
 * #389 (spec #383): moving between workspaces. The person comes only from the session. Switching takes the workspace
 * to open, which must be one of the person's; it doesn't take the page's, because a switch that is rolled back, and
 * an invitation that opens its workspace, run from a page whose workspace isn't the session's.
 */
const SIGNED_OUT = { ok: false, code: "UNAUTHORIZED" } as const;
const NOT_A_MEMBER = { ok: false, code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" } as const;

/** Opens one of the person's workspaces, and remembers it as their last-used one. */
export async function switchWorkspace(workspaceId: string): Promise<AuthAnswer> {
  const session = await readSession();
  if (!session) return SIGNED_OUT;
  // Better Auth checks membership too, but a refusal there also clears the session's active workspace.
  const own = await loadWorkspaces(session.userId);
  if (!own.some(({ id }) => id === workspaceId)) return NOT_A_MEMBER;
  const switched = await askAuthServer((api, asCaller) => api.setActiveOrganization({ ...asCaller, body: { organizationId: workspaceId } }));
  if (!switched.ok) return switched;
  const remembered = await rememberLastUsed();
  return remembered.ok ? { ok: true } : remembered;
}

/**
 * Saves the workspace the session is in now as the person's last-used one; call it after a create or a join. It
 * takes nothing from the browser. `first` says this was the person's first workspace: none was saved before. Someone
 * who has left every workspace still has one saved, so for them it isn't.
 */
export async function rememberLastUsed(): Promise<DoorAnswer<{ first: boolean }>> {
  const session = await readSession();
  if (!session) return SIGNED_OUT;
  const { userId, orgId } = session;
  if (!orgId) return NOT_A_MEMBER;
  return { ok: true, data: await db.transaction((tx) => saveLastUsed(tx, { userId, orgId })) };
}
