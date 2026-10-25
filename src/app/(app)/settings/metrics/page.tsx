import { redirect } from "next/navigation";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { ClerkMembersProfile, ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { MetricDefinitionList } from "@/components/metrics/metric-definition-list";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { getWorkspace } from "@/lib/ensure-workspace";
import { listMetricDefinitions } from "@/lib/metrics-library";
import { ProfileForm } from "../profile/profile-form";
import { ThemePreference } from "../profile/theme-preference";
import { inboxDeliveryPanel } from "../profile/inbox-delivery";
import { slackPanel } from "../profile/slack-panel";
import { AddMetricDialog, MetricLibraryFilter } from "./metric-controls";
import styles from "./metrics.module.css";

/**
 * Settings → Metrics (#196): the workspace's Metrics library. Members and Admins only. Members and
 * Admins add definitions here (#197); archived ones sit behind the Archived filter (`?show=archived`).
 */
export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ section?: string; show?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  const { section, show } = await searchParams;
  const view = show === "archived" ? "archived" : "active";
  const all = await listMetricDefinitions({ orgId: workspace.orgId }, { includeArchived: view === "archived" });
  const definitions = view === "archived" ? all.filter(definition => definition.archivedAt && !definition.mergedIntoId) : all;
  return <SettingsCommandAdapter page="metrics" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section ?? "metrics"}
    metrics={<SettingsCard title="Metric definitions" footer="Pass/fail checks are chosen on each Request and aren't part of the library.">
      <div className={styles.toolbar}><MetricLibraryFilter show={view} /><AddMetricDialog orgId={workspace.orgId} /></div>
      <MetricDefinitionList definitions={definitions} view={view} />
    </SettingsCard>}
    members={<ClerkMembersProfile />} workspaceManagement={<ClerkWorkspaceProfile />}
    account={<AccountProfile fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
    security={<AccountSecurity />} role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    delivery={await inboxDeliveryPanel(workspace)} slack={await slackPanel(workspace)} />;
}
