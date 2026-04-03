import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, invites } from "@/db/schema";
import { eq } from "drizzle-orm";
import { MembersList } from "@/components/settings/members-list";
import { PendingInvites } from "@/components/settings/pending-invites";

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  const members = await db.select().from(profiles).where(eq(profiles.orgId, profile.orgId));
  const allInvites = await db.select().from(invites).where(eq(invites.orgId, profile.orgId));

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Members</h1>
        <p className="text-sm text-[var(--text-secondary)]">Manage your team members and pending invites.</p>
      </div>
      <MembersList
        members={members.map((m) => ({ id: m.id, fullName: m.fullName, email: m.email, role: m.role }))}
        currentUserId={user.id}
        isAdmin={profile.role === "admin"}
      />
      <PendingInvites
        invites={allInvites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, acceptedAt: i.acceptedAt }))}
        isAdmin={profile.role === "admin"}
      />
    </div>
  );
}
