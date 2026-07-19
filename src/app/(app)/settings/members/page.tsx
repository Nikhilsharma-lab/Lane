import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { db, workspaceMembers, profiles, invites } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { InviteForm } from "./invite-form";
import { InviteRow } from "./invite-row";
import { MemberRow } from "./member-row";
import { RowGroup } from "@/components/ui/row";
import { Typography } from "@/components/ui/typography";
import { SettingsNav } from "../settings-nav";

export default async function MembersPage() {
  const result = await getWorkspace();
  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");
  if (result.role === "guest") redirect("/");

  const context = { userId: result.userId, orgId: result.orgId };

  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      fullName: profiles.fullName,
      email: profiles.email,
      profileRole: profiles.role,
    })
    .from(workspaceMembers)
    .leftJoin(profiles, eq(workspaceMembers.userId, profiles.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, context.orgId),
        eq(workspaceMembers.isActive, true)
      )
    )
    .orderBy(profiles.fullName);

  const pendingInvites = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      token: invites.token,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(
      and(eq(invites.orgId, context.orgId), eq(invites.status, "pending"))
    )
    .orderBy(desc(invites.createdAt));

  const currentMembership = members.find((m) => m.userId === context.userId);
  const canInvite =
    currentMembership?.role === "owner" || currentMembership?.role === "admin";

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-4 py-4 sm:px-6">
        <Typography as="h1" role="pageTitle">Settings</Typography>
      </header>
      <SettingsNav isGuest={false} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {canInvite && (
          <div className="mb-8">
            <Typography as="h2" role="sectionTitle" className="mb-3">Invite a teammate</Typography>
            <InviteForm context={context} />
          </div>
        )}

        <div className="mb-8">
          <Typography as="h2" role="sectionTitle" className="mb-3 text-muted-foreground">
            Members ({members.length})
          </Typography>
          <RowGroup aria-label="Workspace members">
            {members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                context={context}
                callerRole={currentMembership?.role ?? "member"}
                isCurrentUser={m.userId === context.userId}
              />
            ))}
          </RowGroup>
        </div>

        {pendingInvites.length > 0 && (
          <div>
            <Typography as="h2" role="sectionTitle" className="mb-3 text-muted-foreground">
              Pending invites ({pendingInvites.length})
            </Typography>
            <RowGroup aria-label="Pending invitations">
              {pendingInvites.map((inv) => (
                <InviteRow
                  key={inv.id}
                  invite={{
                    id: inv.id,
                    email: inv.email,
                    role: inv.role,
                    inviteUrl: `${appUrl}/invite/${inv.token}`,
                    expiresAt: inv.expiresAt,
                  }}
                  context={context}
                  canManage={canInvite}
                />
              ))}
            </RowGroup>
          </div>
        )}
      </main>
    </div>
  );
}
