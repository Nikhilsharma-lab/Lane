import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ProfileLayout, ProfileSections } from "@/components/settings/profile-sections";
import { db, profiles } from "@/db";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ProfileForm } from "./profile-form";
import { ThemePreference } from "./theme-preference";

export default async function ProfilePage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  const [profile] = await db
    .select({ role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, workspace.userId));
  if (!profile) redirect("/onboarding");

  return (
    <ProfileLayout>
      <ProfileSections
        profileForm={<ProfileForm initialRole={profile.role} orgId={workspace.orgId} />}
        appearance={<ThemePreference />}
      />
    </ProfileLayout>
  );
}
