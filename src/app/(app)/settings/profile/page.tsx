import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db, profiles } from "@/db";
import { getWorkspace } from "@/lib/ensure-workspace";
import { SettingsNav } from "../settings-nav";
import { ProfileForm } from "./profile-form";

export default async function ProfilePage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(
      and(
        eq(profiles.id, workspace.userId),
        eq(profiles.orgId, workspace.orgId)
      )
    );
  if (!profile) redirect("/onboarding");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      </header>
      <SettingsNav isGuest={workspace.role === "guest"} />

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Keep your role label current for teammates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm initialRole={profile.role} orgId={workspace.orgId} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
