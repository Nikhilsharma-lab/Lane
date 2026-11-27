import { redirect } from "next/navigation";
import { cache } from "react";

import { activeMemberOf, type MemberAuth, type WorkspacePermission } from "@/lib/auth-guard";
import { loadShell } from "@/lib/data/shell";
import { ONBOARDING_URL } from "@/lib/onboarding-address";
import { timed } from "@/lib/request-timings";
import { readSession, sendToSignIn } from "@/lib/session";

export type WorkspaceContext = {
  userId: string;
  orgId: string;
  role: WorkspacePermission;
  /** The functional label chosen at onboarding; Settings → Profile edits it. */
  profileRole: "pm" | "designer" | "developer";
  fullName: string;
  email: string;
  workspaceName: string;
};

/** The session seam's one read, cached per request, so the layout and the page share it. */
export const getSession = cache(async function getSession() {
  return timed("session", () => readSession());
});

/**
 * Identity and workspace permission from the session alone. Plan item 1.8
 * starts the page's reads from this so they run in parallel with the
 * profile/workspace join in getWorkspace.
 */
export const getMember = cache(async function getMember(): Promise<MemberAuth | null> {
  return activeMemberOf(await getSession());
});

/**
 * Where a page or layout sends someone `getMember` knows no membership for: signed in, to Onboarding, which joins or
 * starts a workspace; signed out, to sign in and back (#387).
 */
export async function sendAwayMemberless(): Promise<never> {
  if (await getSession()) redirect(ONBOARDING_URL);
  return sendToSignIn();
}

/** The session's person and workspace, or null for anyone `getMember` knows no membership for. */
export const getWorkspace = cache(async function getWorkspace(): Promise<WorkspaceContext | null> {
  const member = await getMember();
  if (!member) return null;
  // Plan item 1.9: profile and workspace in one statement.
  const shell = await timed("workspace", () => loadShell(member));
  return shell && { ...member, ...shell };
});
