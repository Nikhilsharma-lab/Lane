import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SettingsSidebar } from "@/components/settings/settings-sidebar";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, user.id));
  if (!profile) redirect("/login");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <div className="shrink-0 border-r border-border p-6 pt-8">
          <SettingsSidebar isAdmin={profile.role === "admin"} />
        </div>
        <main className="flex-1 min-w-0 overflow-y-auto flex justify-center">
          <div className="w-full max-w-2xl px-10 py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
