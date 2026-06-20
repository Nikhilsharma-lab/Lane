import { db, invites, workspaces } from "@/db";
import { eq, and, gt } from "drizzle-orm";

export async function getPendingInvites(email: string) {
  return db
    .select({
      token: invites.token,
      role: invites.role,
      workspaceName: workspaces.name,
    })
    .from(invites)
    .innerJoin(workspaces, eq(invites.orgId, workspaces.id))
    .where(
      and(
        eq(invites.email, email.toLowerCase()),
        eq(invites.status, "pending"),
        gt(invites.expiresAt, new Date())
      )
    );
}

export type PendingInvite = Awaited<
  ReturnType<typeof getPendingInvites>
>[number];
