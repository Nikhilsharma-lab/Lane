import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { accountNameOf } from "./account-name";
import type { WorkspacePermission } from "./auth-guard";
import { clerkWorkspacePermission } from "./role-rules";

/**
 * #350 / #351: the session seam, the only Lane server code that reads who is signed in from Clerk. It speaks
 * Lane's terms (person, workspace, Lane role) and takes nothing from the browser (#333 Q19): everything comes
 * from the server session. It caches nothing; `getMember` keeps the per-request cache.
 */

/** The signed-in person, their active workspace and their role in it. A role Lane doesn't know is null: no access. */
export type Session = { userId: string; orgId: string | null; role: WorkspacePermission | null };

type SessionReadOptions = {
  /** A session still waiting on Clerk's choose-a-workspace step counts as signed in. Only "Page not found" asks. */
  pendingCountsAsSignedIn?: boolean;
};

/** The signed-in person's session, or null for anyone signed out (by default, a pending session too). */
export async function readSession(options: SessionReadOptions = {}): Promise<Session | null> {
  const { userId, orgId, orgRole } = await (options.pendingCountsAsSignedIn ? auth({ treatPendingAsSignedOut: false }) : auth());
  if (!userId) return null;
  return { userId, orgId: orgId ?? null, role: orgId ? clerkWorkspacePermission(orgRole) : null };
}

/** Sends a signed-out visitor to sign in, and back to the page they opened afterwards. */
export async function sendToSignIn(): Promise<never> {
  return (await auth()).redirectToSignIn();
}

/**
 * The signed-in account: its name (by the account-name rule), primary email ("" when it has none) and image.
 * The image is kept only because Onboarding still saves `avatarUrl` (avatars are dropped later, #345).
 */
export type Account = { name: string; email: string; imageUrl: string };

/** The signed-in account, or null when no account can be read. */
export async function readAccount(): Promise<Account | null> {
  const user = await currentUser();
  if (!user) return null;
  return { name: accountNameOf(user), email: user.primaryEmailAddress?.emailAddress ?? "", imageUrl: user.imageUrl };
}
