import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { ProfileForm } from "../profile/profile-form";
import { ThemePreference } from "../profile/theme-preference";
import { inboxDeliveryPanel } from "../profile/inbox-delivery";
import { slackPanel } from "../profile/slack-panel";
import { billingPanel } from "../profile/billing-panel";
import { redirect } from "next/navigation";
import { timePage, timed } from "@/lib/request-timings";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { membersPanel } from "./members-panel";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";

export default async function MembersPage() {
  void timePage("Settings: Members");
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");
  // #210: a Viewer reads everything a Member reads except Members management.
  if (workspace.role === "viewer") redirect("/settings/profile");

  return <SettingsCommandAdapter page="members" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection="members" members={membersPanel(workspace)} workspaceManagement={<ClerkWorkspaceProfile />}
    account={<AccountProfile orgId={workspace.orgId} fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
    security={<AccountSecurity />} role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    delivery={await timed("data", () => inboxDeliveryPanel(workspace))} slack={await timed("data", () => slackPanel(workspace))} billing={await timed("data", () => billingPanel(workspace))} />;
}
