import { ProfileForm } from "../profile/profile-form";
import { ThemePreference } from "../profile/theme-preference";
import { sharedPanels } from "../profile/shared-panels";
import { redirect } from "next/navigation";
import { timePage } from "@/lib/request-timings";
import { getWorkspace, sendAwayMemberless } from "@/lib/ensure-workspace";
import { membersPanel } from "./members-panel";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { SettingsEarlySearch } from "@/components/settings/settings-early-search";
import { billingEnforced } from "@/lib/feature-switches";
import { settingsMetadata } from "../settings-metadata";

export const metadata = settingsMetadata;

export default async function MembersPage() {
  void timePage("Settings: Members");
  const workspace = await getWorkspace();
  if (!workspace) return sendAwayMemberless();
  if (workspace.role === "guest") redirect("/");
  // #210: a Viewer reads everything a Member reads except Members management. #288 (D30): Settings says so.
  if (workspace.role === "viewer") redirect("/settings/profile?section=members");

  const panels = await sharedPanels(workspace);
  return <><SettingsCommandAdapter billingEnforced={billingEnforced()} page="members" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection="members" members={membersPanel(workspace)}
    role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    {...panels} />
    <SettingsEarlySearch /></>;
}
