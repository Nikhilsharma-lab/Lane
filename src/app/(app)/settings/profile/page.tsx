import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Typography } from "@/components/ui/typography";
import { db, profiles } from "@/db";
import { getWorkspace } from "@/lib/ensure-workspace";
import { SettingsNav } from "../settings-nav";
import { ProfileForm } from "./profile-form";
import { ThemePreference } from "./theme-preference";

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
      <header className="border-b px-4 py-4 sm:px-6">
        <Typography as="h1" role="pageTitle">Settings</Typography>
      </header>
      <SettingsNav isGuest={workspace.role === "guest"} />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 sm:space-y-6 sm:px-6 sm:py-8">
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

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>
              Choose how Lane looks on this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemePreference />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
