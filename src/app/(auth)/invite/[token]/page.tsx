import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db, profiles } from "@/db";
import { eq } from "drizzle-orm";
import { AcceptInviteButton } from "./accept-button";

export default async function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Not signed in — redirect to signup with return URL
  if (!user) {
    redirect(`/signup?next=/invite/${token}`);
  }

  // Check if user already has a profile (already in a workspace)
  const [existingProfile] = await db
    .select({ orgId: profiles.orgId })
    .from(profiles)
    .where(eq(profiles.id, user.id));

  if (existingProfile) {
    // Already in a workspace — can't join a second one (multi-workspace is deferred)
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold">Already in a workspace</h1>
          <p className="mt-2 text-muted-foreground">
            You&apos;re already a member of a workspace. Multi-workspace support
            is coming later. For now, you can only be in one workspace at a time.
          </p>
          <a href="/" className="mt-4 inline-block text-sm font-medium underline underline-offset-4">
            Go to your workspace
          </a>
        </div>
      </div>
    );
  }

  // Get invite context from the RPC
  const { data: inviteContext, error: contextError } = await supabase.rpc(
    "get_invite_context",
    { invite_token: token }
  );

  const invite = inviteContext?.[0];

  if (contextError || !invite) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Invalid invite</h1>
          <p className="mt-2 text-muted-foreground">
            This invite link is invalid or has expired.
          </p>
        </div>
      </div>
    );
  }

  if (invite.accepted_at) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Already accepted</h1>
          <p className="mt-2 text-muted-foreground">
            This invite has already been used.
          </p>
        </div>
      </div>
    );
  }

  if (new Date(invite.expires_at) < new Date()) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Invite expired</h1>
          <p className="mt-2 text-muted-foreground">
            This invite has expired. Ask your team lead to send a new one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Join {invite.org_name}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {invite.invited_by_name
            ? `${invite.invited_by_name} invited you`
            : "You've been invited"}{" "}
          to join this workspace on Lane.
        </p>
        <div className="mt-6">
          <AcceptInviteButton
            token={token}
            userId={user.id}
            fullName={
              user.user_metadata?.full_name ||
              user.email?.split("@")[0] ||
              "User"
            }
            email={user.email || ""}
          />
        </div>
      </div>
    </div>
  );
}
