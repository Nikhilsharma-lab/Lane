import { ClerkMembersProfile, ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { redirect } from "next/navigation";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ProfileForm } from "./profile-form";
import { ThemePreference } from "./theme-preference";
import { InboxDelivery } from "./inbox-delivery";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  // Plan item 1.9: the profile role arrived with the shell join, so this page
  // makes no read of its own.
  const { section } = await searchParams;
  return (
      <SettingsCommandAdapter membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section}
        members={workspace.role !== "guest" ? <ClerkMembersProfile /> : undefined}
        workspaceManagement={workspace.role !== "guest" ? <ClerkWorkspaceProfile /> : undefined}
        account={<AccountProfile fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
        security={<AccountSecurity />}
        role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />}
        appearance={<ThemePreference compact />}
        delivery={workspace.role !== "guest" ? <InboxDelivery workspace={workspace} /> : undefined}
      />
  );
}
