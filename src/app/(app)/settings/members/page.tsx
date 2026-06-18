import { redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspace } from "@/lib/ensure-workspace";
import { db, workspaceMembers, profiles, invites } from "@/db";
import { eq, and, desc } from "drizzle-orm";
import { Separator } from "@/components/ui/separator";
import { InviteForm } from "./invite-form";
import { InviteRow } from "./invite-row";
import { MemberRow } from "./member-row";

export default async function MembersPage() {
  const result = await getWorkspace();
  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

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
    );

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
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          &larr; Back
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-lg font-semibold tracking-tight">Members</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {canInvite && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium">Invite a teammate</h2>
            <InviteForm context={context} />
          </div>
        )}

        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Members ({members.length})
          </h2>
          <div className="space-y-2">
            {members.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                context={context}
                callerRole={currentMembership?.role ?? "member"}
                isCurrentUser={m.userId === context.userId}
              />
            ))}
          </div>
        </div>

        {pendingInvites.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Pending invites ({pendingInvites.length})
            </h2>
            <div className="space-y-2">
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
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
