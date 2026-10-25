import { ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { membersPanel } from "../members/members-panel";
import { redirect } from "next/navigation";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ProfileForm } from "./profile-form";
import { ThemePreference } from "./theme-preference";
import { inboxDeliveryPanel } from "./inbox-delivery";
import { slackPanel } from "./slack-panel";
import { billingPanel } from "./billing-panel";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ section?: string; slack?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  // Plan item 1.9: the profile role arrived with the shell join. The page's one
  // reads of its own are the Inbox delivery choice (#206; none for a Guest) and,
  // for an Admin, the Slack connection (#207; `?slack=` is how Slack's install flow ended).
  const { section, slack } = await searchParams;
  return (
      <SettingsCommandAdapter membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section}
        members={membersPanel(workspace)}
        workspaceManagement={workspace.role !== "guest" ? <ClerkWorkspaceProfile /> : undefined}
        account={<AccountProfile fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
        security={<AccountSecurity />}
        role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />}
        appearance={<ThemePreference compact />}
        delivery={await inboxDeliveryPanel(workspace)}
        slack={await slackPanel(workspace, slack)}
        billing={await billingPanel(workspace)}
      />
  );
}
