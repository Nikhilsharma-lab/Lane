import { and, eq } from "drizzle-orm";
import { db, invites } from "@/db";
import { inviteTokenFromPath, safeRedirectPath } from "@/lib/safe-redirect";

export async function getValidSignupInvite(
  redirectTo: string | null | undefined,
  submittedEmail?: string
) {
  const target = safeRedirectPath(redirectTo);
  const token = inviteTokenFromPath(target);
  if (!token) return null;

  const [invite] = await db
    .select({
      token: invites.token,
      email: invites.email,
      status: invites.status,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(and(eq(invites.token, token), eq(invites.status, "pending")));

  if (!invite || new Date(invite.expiresAt) < new Date()) return null;
  if (
    submittedEmail &&
    submittedEmail.trim().toLowerCase() !== invite.email.toLowerCase()
  ) {
    return null;
  }

  return { token: invite.token, email: invite.email, target };
}
