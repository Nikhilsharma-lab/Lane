import { membersPanel } from "../members/members-panel";
import { redirect } from "next/navigation";
import { timePage } from "@/lib/request-timings";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { SettingsEarlySearch } from "@/components/settings/settings-early-search";
import { billingEnforced } from "@/lib/feature-switches";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { getWorkspace, sendAwayMemberless } from "@/lib/ensure-workspace";
import { ProfileForm } from "./profile-form";
import { ThemePreference } from "./theme-preference";
import { sharedPanels } from "./shared-panels";
import { settingsMetadata } from "../settings-metadata";

export const metadata = settingsMetadata;

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ section?: string; slack?: string; checkout?: string }> }) {
  void timePage("Settings: Profile");
  const workspace = await getWorkspace();
  if (!workspace) return sendAwayMemberless();
  if (workspace.needsOnboarding) redirect("/onboarding");

  // Plan item 1.9: the profile role arrived with the shell join. The page's one
  // reads of its own are the Inbox delivery choice (#206; none for a Guest) and,
  // for an Admin, the Slack connection (#207; `?slack=` is how Slack’s install flow ended) and Billing
  // (#213/#214; `?checkout=` is how the payment provider’s checkout page ended).
  const { section, slack, checkout } = await searchParams;
  const panels = await sharedPanels(workspace, { slack, checkout });
  return <>
      <SettingsCommandAdapter billingEnforced={billingEnforced()} membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section}
        members={membersPanel(workspace)}
        account={<AccountProfile orgId={workspace.orgId} fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
        security={<AccountSecurity />}
        role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />}
        appearance={<ThemePreference compact />}
        {...panels}
      />
      <SettingsEarlySearch />
    </>;
}
