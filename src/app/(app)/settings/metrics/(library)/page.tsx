import { redirect } from "next/navigation";
import { timePage, timed } from "@/lib/request-timings";
import { canChangeThings } from "@/lib/role-rules";
import { membersPanel } from "../../members/members-panel";
import { MetricDefinitionList } from "@/components/metrics/metric-definition-list";
import { SettingsBlock, SettingsGroup } from "@/components/settings/settings-group";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { SettingsEarlySearch } from "@/components/settings/settings-early-search";
import { billingEnforced } from "@/lib/feature-switches";
import { getWorkspace, sendAwayMemberless } from "@/lib/ensure-workspace";
import { listMetricDefinitions } from "@/lib/metrics-library";
import { ProfileForm } from "../../profile/profile-form";
import { ThemePreference } from "../../profile/theme-preference";
import { sharedPanels } from "../../profile/shared-panels";
import { AddHowCountedDialog, AddMetricDialog, MetricLibraryFilter } from "../metric-controls";
import styles from "../metrics.module.css";
import { settingsMetadata } from "../../settings-metadata";

export const metadata = settingsMetadata;

/**
 * Settings → Metrics (#196): the workspace's Metrics library. Members and Admins only. Members and
 * Admins add definitions here (#197); archived ones sit behind the Archived filter (`?show=archived`).
 */
export default async function MetricsPage({ searchParams }: { searchParams: Promise<{ section?: string; show?: string }> }) {
  void timePage("Settings: Metrics");
  const workspace = await getWorkspace();
  if (!workspace) return sendAwayMemberless();
  if (workspace.role === "guest") redirect("/");

  const { section, show } = await searchParams;
  const view = show === "archived" ? "archived" : "active";
  const [all, panels] = await Promise.all([timed("data", () => listMetricDefinitions(workspace, { includeArchived: view === "archived" })), sharedPanels(workspace)]);
  const definitions = view === "archived" ? all.filter(definition => definition.archivedAt && !definition.mergedIntoId) : all;
  // #210: a Viewer reads the library and adds or edits nothing.
  const canEdit = canChangeThings(workspace.role);
  return <><SettingsCommandAdapter billingEnforced={billingEnforced()} page="metrics" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section ?? "metrics"}
    metrics={<SettingsGroup label="Metric definitions" labelId="metric-definitions" description="Pass/fail checks are chosen on each Request and aren’t part of the library.">
      <SettingsBlock className={styles.library}>
        <div className={styles.toolbar}><MetricLibraryFilter show={view} />{canEdit && <AddMetricDialog orgId={workspace.orgId} />}</div>
        <MetricDefinitionList definitions={definitions} view={view}
          addDefinition={canEdit ? ({ id, name, unit, link, howCounted }) => <AddHowCountedDialog orgId={workspace.orgId} definition={{ id, name, unit, link, howCounted }} /> : undefined} />
      </SettingsBlock>
    </SettingsGroup>}
    members={membersPanel(workspace)}
    role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    {...panels} />
    <SettingsEarlySearch /></>;
}
