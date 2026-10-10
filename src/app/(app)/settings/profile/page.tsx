import { redirect } from "next/navigation";
import { ProfileLayout, ProfileSections } from "@/components/settings/profile-sections";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ProfileForm } from "./profile-form";
import { ThemePreference } from "./theme-preference";

export default async function ProfilePage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  // Plan item 1.9: the profile role arrived with the shell join, so this page
  // makes no read of its own.
  return (
    <ProfileLayout>
      <ProfileSections
        profileForm={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />}
        appearance={<ThemePreference />}
      />
    </ProfileLayout>
  );
}
