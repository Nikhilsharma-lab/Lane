import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DangerZone } from "@/components/settings/danger-zone";

export default async function DangerPage() {
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
        <h1 className="text-lg font-semibold text-foreground mb-1">Danger Zone</h1>
        <p className="text-sm text-muted-foreground">Irreversible actions. Take care.</p>
      </div>
      <DangerZone isAdmin={profile.role === "admin"} orgSlug={org.slug} />
    </div>
  );
}
