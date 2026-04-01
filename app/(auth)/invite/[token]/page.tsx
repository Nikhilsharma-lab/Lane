import { notFound } from "next/navigation";
import { db } from "@/db";
import { invites, profiles, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { InviteSignupForm } from "@/components/team/invite-signup-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invite] = await db.select().from(invites).where(eq(invites.token, token));
  if (!invite) notFound();

  const [org] = await db.select().from(organizations).where(eq(organizations.id, invite.orgId));
  if (!org) notFound();

  const inviter = invite.invitedBy
    ? (await db.select().from(profiles).where(eq(profiles.id, invite.invitedBy)))[0]
    : null;

  const isExpired = new Date() > invite.expiresAt;
  const isAccepted = !!invite.acceptedAt;

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-xs text-zinc-600 uppercase tracking-wide mb-3">You&apos;re invited</p>
          <h1 className="text-xl font-semibold text-white">{org.name}</h1>
          {inviter && (
            <p className="text-sm text-zinc-500 mt-1">
              {inviter.fullName} invited you as{" "}
              <span className="capitalize text-zinc-400">{invite.role}</span>
            </p>
          )}
        </div>

        {isAccepted ? (
          <div className="border border-zinc-800 rounded-xl p-6 text-center">
            <p className="text-sm text-zinc-400">This invite has already been used.</p>
            <a href="/login" className="mt-4 block text-sm text-zinc-300 hover:text-white transition-colors">
              Sign in instead →
            </a>
          </div>
        ) : isExpired ? (
          <div className="border border-zinc-800 rounded-xl p-6 text-center">
            <p className="text-sm text-zinc-400">This invite has expired.</p>
            <p className="text-xs text-zinc-600 mt-1">Ask your team lead to send a new invite.</p>
          </div>
        ) : (
          <InviteSignupForm token={token} defaultEmail={invite.email} orgName={org.name} />
        )}
      </div>
    </div>
  );
}
