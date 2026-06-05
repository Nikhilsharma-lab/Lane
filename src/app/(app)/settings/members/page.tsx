import { redirect } from "next/navigation";
import Link from "next/link";
import { getWorkspace } from "@/lib/ensure-workspace";
import { db, workspaceMembers, profiles, invites } from "@/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { InviteForm } from "./invite-form";

export default async function MembersPage() {
  const result = await getWorkspace();
  if (!result) redirect("/login");
  if (result.needsOnboarding) redirect("/onboarding");

  const context = { userId: result.userId, orgId: result.orgId };

  // Fetch members with profile info
  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      fullName: profiles.fullName,
      email: profiles.email,
      profileRole: profiles.role,
    })
    .from(workspaceMembers)
    .leftJoin(profiles, eq(workspaceMembers.userId, profiles.id))
    .where(eq(workspaceMembers.workspaceId, context.orgId));

  // Fetch pending invites
  const pendingInvites = await db
    .select({
      id: invites.id,
      email: invites.email,
      role: invites.role,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(
      and(eq(invites.orgId, context.orgId), isNull(invites.acceptedAt))
    )
    .orderBy(desc(invites.createdAt));

  // Check if current user is owner/admin
  const currentMembership = members.find((m) => m.userId === context.userId);
  const canInvite = currentMembership?.role === "owner" || currentMembership?.role === "admin";

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-lg font-semibold tracking-tight">Members</h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        {/* Invite form */}
        {canInvite && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium">Invite a teammate</h2>
            <InviteForm context={context} />
          </div>
        )}

        {/* Current members */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            Members ({members.length})
          </h2>
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium">
                    {m.fullName ?? "Unknown"}
                    {m.userId === context.userId && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.profileRole && (
                    <Badge variant="outline" className="capitalize">
                      {m.profileRole}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Pending invites ({pendingInvites.length})
            </h2>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-dashed p-4"
                >
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant="outline">Pending</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
