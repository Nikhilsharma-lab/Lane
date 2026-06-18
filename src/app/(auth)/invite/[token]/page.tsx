import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db, invites, workspaces, profiles, workspaceMembers } from "@/db";
import { eq, and } from "drizzle-orm";
import { AcceptInviteButton } from "./accept-button";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invite] = await db
    .select({
      id: invites.id,
      orgId: invites.orgId,
      email: invites.email,
      role: invites.role,
      status: invites.status,
      expiresAt: invites.expiresAt,
      acceptedAt: invites.acceptedAt,
      invitedBy: invites.invitedBy,
      orgName: workspaces.name,
    })
    .from(invites)
    .innerJoin(workspaces, eq(invites.orgId, workspaces.id))
    .where(eq(invites.token, token));

  if (!invite) {
    return <InviteMessage title="Invalid invite" message="This invite link is no longer valid." />;
  }

  let inviterName: string | null = null;
  if (invite.invitedBy) {
    const [inviter] = await db
      .select({ fullName: profiles.fullName })
      .from(profiles)
      .where(eq(profiles.id, invite.invitedBy));
    inviterName = inviter?.fullName ?? null;
  }

  if (invite.status === "revoked") {
    return <InviteMessage title="Invite revoked" message="This invite is no longer valid." />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (invite.status === "accepted") {
    if (user) {
      const [membership] = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, invite.orgId),
            eq(workspaceMembers.userId, user.id),
            eq(workspaceMembers.isActive, true)
          )
        );
      if (membership) redirect("/");
    }
    return <InviteMessage title="Already accepted" message="This invite has already been used." />;
  }

  if (invite.status === "expired" || new Date(invite.expiresAt) < new Date()) {
    return (
      <InviteMessage
        title="Invite expired"
        message={
          inviterName
            ? `This invite has expired. Ask ${inviterName} for a new one.`
            : "This invite has expired. Ask your team lead for a new one."
        }
      />
    );
  }

  if (!user) {
    redirect(
      `/signup?next=${encodeURIComponent(`/invite/${token}`)}&email=${encodeURIComponent(invite.email)}`
    );
  }

  const userEmail = (user.email || "").toLowerCase();
  if (userEmail !== invite.email.toLowerCase()) {
    return (
      <InviteMessage
        title="Email mismatch"
        message={`This invite is for ${invite.email}. You're signed in as ${userEmail} — log out and use the invited email.`}
      />
    );
  }

  const [activeMembership] = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.userId, user.id), eq(workspaceMembers.isActive, true))
    );

  if (activeMembership) {
    if (activeMembership.workspaceId === invite.orgId) redirect("/");
    return (
      <InviteMessage
        title="Already in a workspace"
        message="You're already in a workspace. Joining a second is coming soon."
        linkHref="/"
        linkText="Go to your workspace"
      />
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Join {invite.orgName}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {inviterName ? `${inviterName} invited you` : "You’ve been invited"}{" "}
          to join this workspace on Lane.
        </p>
        <div className="mt-6">
          <AcceptInviteButton token={token} />
        </div>
      </div>
    </div>
  );
}

function InviteMessage({
  title,
  message,
  linkHref,
  linkText,
}: {
  title: string;
  message: string;
  linkHref?: string;
  linkText?: string;
}) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        {linkHref && linkText && (
          <a
            href={linkHref}
            className="mt-4 inline-block text-sm font-medium underline underline-offset-4"
          >
            {linkText}
          </a>
        )}
      </div>
    </div>
  );
}
