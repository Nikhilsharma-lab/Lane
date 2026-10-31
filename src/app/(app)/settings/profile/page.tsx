import { ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { membersPanel } from "../members/members-panel";
import { redirect } from "next/navigation";
import { timePage, timed } from "@/lib/request-timings";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { getWorkspace } from "@/lib/ensure-workspace";
import { ProfileForm } from "./profile-form";
import { ThemePreference } from "./theme-preference";
import { inboxDeliveryPanel } from "./inbox-delivery";
import { slackPanel } from "./slack-panel";
import { billingPanel } from "./billing-panel";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ section?: string; slack?: string; checkout?: string }> }) {
  void timePage("Settings: Profile");
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");

  // Plan item 1.9: the profile role arrived with the shell join. The page's one
  // reads of its own are the Inbox delivery choice (#206; none for a Guest) and,
  // for an Admin, the Slack connection (#207; `?slack=` is how Slack’s install flow ended) and Billing
  // (#213/#214; `?checkout=` is how the payment provider’s checkout page ended).
  const { section, slack, checkout } = await searchParams;
  return (
      <SettingsCommandAdapter membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section}
        members={membersPanel(workspace)}
        workspaceManagement={workspace.role !== "guest" ? <ClerkWorkspaceProfile /> : undefined}
        account={<AccountProfile orgId={workspace.orgId} fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
        security={<AccountSecurity />}
        role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />}
        appearance={<ThemePreference compact />}
        delivery={await timed("data", () => inboxDeliveryPanel(workspace))}
        slack={await timed("data", () => slackPanel(workspace, slack))}
        billing={await timed("data", () => billingPanel(workspace, checkout))}
      />
  );
}
