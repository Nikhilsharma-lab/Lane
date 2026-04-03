import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { WorkspaceForm } from "@/components/settings/workspace-form";

export default async function WorkspacePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");
  const [org] = await db.select().from(organizations).where(eq(organizations.id, profile.orgId));
  if (!org) redirect("/login");

  return (
    <div className="max-w-lg space-y-10">
      <div>
        <h1 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Workspace</h1>
        <p className="text-sm text-[var(--text-secondary)]">Your organization name, slug, and plan.</p>
      </div>
      <WorkspaceForm org={{ name: org.name, slug: org.slug, plan: org.plan }} isAdmin={profile.role === "admin"} />
    </div>
  );
}
