import "server-only";

import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, profiles } from "@/db";
import type { WorkspacePermission } from "./auth-guard";
import { RETURN_ADDRESS_HEADER, signInReturningTo } from "./auth-return-address";
import { readBetterAuthSession, readBetterAuthWorkspaceLeft } from "./better-auth-session";

/**
 * #350 / #387: the session seam, the only Lane server code that reads who is signed in. It speaks Lane's terms
 * (person, workspace, Lane role) and takes nothing from the browser but Better Auth's signed, httpOnly session cookie
 * (#333 Q19). It caches nothing; `getSession` keeps the per-request cache.
 */

/** The signed-in person, the workspace their session is in and their role there. A role Lane doesn't know is null: no access. */
export type Session = { userId: string; orgId: string | null; role: WorkspacePermission | null };

/** The signed-in person's session, or null for anyone signed out. */
export async function readSession(): Promise<Session | null> {
  return readBetterAuthSession(await cookies());
}

/** The name of the workspace the signed-in person is no longer in, when that left them with none (#391); else null. */
export async function readWorkspaceLeft(): Promise<string | null> {
  return readBetterAuthWorkspaceLeft(await cookies());
}

/** Sends a signed-out visitor to sign in, and back to the page they opened (the proxy names it) afterwards. */
export async function sendToSignIn(): Promise<never> {
  redirect(signInReturningTo((await headers()).get(RETURN_ADDRESS_HEADER)));
}

/** The signed-in account: the person's name and email, from their profile. */
export type Account = { name: string; email: string };

/** The signed-in account, or null for anyone signed out. */
export async function readAccount(): Promise<Account | null> {
  const session = await readSession();
  if (!session) return null;
  const [account] = await db
    .select({ name: profiles.fullName, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, session.userId))
    .limit(1);
  return account ?? null;
}
