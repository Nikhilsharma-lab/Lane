import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { ProfileForm } from "../profile/profile-form";
import { ThemePreference } from "../profile/theme-preference";
import { InboxDelivery } from "../profile/inbox-delivery";
import { redirect } from "next/navigation";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ClerkMembersProfile, ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";

export default async function MembersPage() {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  return <SettingsCommandAdapter page="members" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection="members" members={<ClerkMembersProfile />} workspaceManagement={<ClerkWorkspaceProfile />}
    account={<AccountProfile fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
    security={<AccountSecurity />} role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    delivery={<InboxDelivery workspace={workspace} />} />;
}
