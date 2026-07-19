import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2Icon,
  CheckCircle2Icon,
  Clock3Icon,
  LockKeyholeIcon,
  MailIcon,
  UserPlusIcon,
  UserRoundIcon,
  UserRoundXIcon,
  XCircleIcon,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { db, invites, workspaces, profiles, workspaceMembers } from "@/db";
import { eq, and } from "drizzle-orm";
import { AcceptInviteButton } from "./accept-button";
import { logoutAndRedirect } from "@/app/(auth)/actions";
import { AuthAction } from "@/components/auth/auth-action";
import {
  AuthHeading,
  AuthKicker,
  AuthShell,
} from "@/components/auth/auth-shell";

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
    return (
      <InviteMessage
        icon={XCircleIcon}
        title="This invite is not valid"
        message="The link may be incomplete or may no longer exist. Ask the person who invited you to send a new one."
      />
    );
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
    return (
      <InviteMessage
        icon={XCircleIcon}
        title="This invite was withdrawn"
        message={
          inviterName
            ? `Ask ${inviterName} if you still need access to ${invite.orgName}.`
            : `Ask the team at ${invite.orgName} if you still need access.`
        }
      />
    );
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
    return (
      <InviteMessage
        icon={CheckCircle2Icon}
        title="This invite was already accepted"
        message={`Sign in with ${invite.email} to open ${invite.orgName}.`}
        linkHref={`/login?email=${encodeURIComponent(invite.email)}`}
        linkText="Sign in to Lane"
      />
    );
  }

  if (invite.status === "expired" || new Date(invite.expiresAt) < new Date()) {
    return (
      <InviteMessage
        icon={Clock3Icon}
        title="This invite has expired"
        message={
          inviterName
            ? `Ask ${inviterName} to send a fresh invite to ${invite.email}.`
            : `Ask the team at ${invite.orgName} to send a fresh invite to ${invite.email}.`
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
        icon={UserRoundXIcon}
        title="Use the invited account"
        message={`This invite is for ${invite.email}, but you’re signed in as ${userEmail}. Sign out, then continue with the invited email.`}
        feedback={`Invited to ${invite.orgName} as ${invite.email}`}
        logoutRedirectTo={`/invite/${token}`}
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
        icon={Building2Icon}
        title="You already have a workspace"
        message={`Your account cannot join ${invite.orgName} while it belongs to another workspace.`}
        linkHref="/"
        linkText="Return to your workspace"
      />
    );
  }

  return (
    <AuthShell
      headerAction={
        <form action={logoutAndRedirect.bind(null, `/invite/${token}`)}>
          <div className="flex items-center gap-2 text-type-label">
            <span className="text-muted-foreground">Not your account?</span>
            <button
              type="submit"
              className="rounded-sm font-medium text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Switch
            </button>
          </div>
        </form>
      }
    >
      <div className="space-y-8">
        <AuthHeading
          title={`Join ${invite.orgName}`}
          description="Review the details, then join when you’re ready."
          kicker={<AuthKicker icon={UserPlusIcon}>WORKSPACE INVITE</AuthKicker>}
        />

        <div className="divide-y divide-border border-y">
          {inviterName && (
            <InviteDetail icon={UserRoundIcon} label="Invited by" value={inviterName} />
          )}
          <InviteDetail icon={MailIcon} label="Your account" value={invite.email} />
          <InviteDetail
            icon={Building2Icon}
            label="Access"
            value={
              invite.role === "guest"
                ? "Invited guest · Own Requests"
                : "Member · Shared Requests board"
            }
          />
        </div>

        <div className="space-y-3">
          <AcceptInviteButton token={token} workspaceName={invite.orgName} />
          <form
            action={logoutAndRedirect.bind(null, `/invite/${token}`)}
            className="sm:hidden"
          >
            <AuthAction
              type="submit"
              kind="tertiary"
            >
              Use another account
            </AuthAction>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}

function InviteMessage({
  icon,
  title,
  message,
  feedback,
  linkHref,
  linkText,
  logoutRedirectTo,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
  feedback?: string;
  linkHref?: string;
  linkText?: string;
  logoutRedirectTo?: string;
}) {
  return (
    <AuthShell>
      <div className="space-y-8">
        <AuthHeading
          title={title}
          description={message}
          kicker={<AuthKicker icon={icon}>WORKSPACE INVITE</AuthKicker>}
        />
        {feedback && (
          <div className="border-y py-3.5 text-type-support text-muted-foreground">
            {feedback}
          </div>
        )}
        {linkHref && linkText && (
          <AuthAction
            nativeButton={false}
            render={<Link href={linkHref} />}
          >
            {linkText}
          </AuthAction>
        )}
        {logoutRedirectTo && (
          <form action={logoutAndRedirect.bind(null, logoutRedirectTo)}>
            <AuthAction type="submit">
              Sign out and continue
            </AuthAction>
          </form>
        )}
        {!linkHref && !logoutRedirectTo && (
          <AuthAction
            nativeButton={false}
            render={<Link href="/login" />}
            kind="secondary"
          >
            Back to sign in
          </AuthAction>
        )}
      </div>
    </AuthShell>
  );
}

function InviteDetail({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-row-identity-touch items-center gap-3 py-3 sm:min-h-row-identity">
      <span className="flex w-5 shrink-0 items-center justify-center">
        <Icon aria-hidden="true" className="size-4 text-muted-foreground" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-type-meta font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-type-control text-foreground">{value}</p>
      </div>
      {label.toLowerCase().includes("account") && (
        <LockKeyholeIcon
          aria-hidden="true"
          className="ml-auto size-3.5 shrink-0 text-muted-foreground"
        />
      )}
    </div>
  );
}
