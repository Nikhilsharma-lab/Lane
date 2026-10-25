import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { ClerkMembersProfile, ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { MetricDefinitionHistory } from "@/components/metrics/metric-definition-history";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { getWorkspace } from "@/lib/ensure-workspace";
import { metricDefinitionUnitLocked, readMetricDefinition, readMetricDefinitionHistory } from "@/lib/metrics-library";
import { ProfileForm } from "../../profile/profile-form";
import { ThemePreference } from "../../profile/theme-preference";
import { ArchiveMetricControl, EditMetricForm } from "../metric-controls";
import styles from "../metrics.module.css";

/**
 * One Metric definition under Settings → Metrics (#197): edit it, archive or restore it (Admins), and
 * read its history. Members and Admins only.
 */
export default async function MetricDefinitionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  const [{ id }, { section }] = await Promise.all([params, searchParams]);
  const library = { orgId: workspace.orgId };
  const [definition, history, unitLocked] = await Promise.all([readMetricDefinition(library, id), readMetricDefinitionHistory(library, id), metricDefinitionUnitLocked(library, id)]);
  if (!definition) notFound();
  const archived = !!definition.archivedAt;
  const merged = !!definition.mergedIntoId;

  const panel = <>
    <Link href="/settings/metrics" className={styles.backLink}><ArrowLeft data-icon-size="sm" aria-hidden="true" />All metrics</Link>
    <SettingsCard title={definition.name}
      description={merged ? "Merged into another metric. Requests that used it now count under that one." : archived ? "Archived. It isn't offered for new predictions, and stays on the Requests that already use it." : undefined}>
      {!merged && <EditMetricForm orgId={workspace.orgId} definition={{ id: definition.id, name: definition.name, unit: definition.unit, link: definition.link ?? "", howCounted: definition.howCounted ?? "" }} unitLocked={unitLocked} />}
    </SettingsCard>
    {workspace.role === "admin" && !merged && <SettingsCard title={archived ? "Restore" : "Archive"}
      description={archived ? "Restoring offers it for new predictions again." : "Archiving stops it being offered for new predictions. Requests that already use it keep it, and their results still add up."}
      action={<ArchiveMetricControl orgId={workspace.orgId} id={definition.id} archived={archived} />} />}
    <SettingsCard title="History">
      <MetricDefinitionHistory entries={history.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString() }))} />
    </SettingsCard>
  </>;

  return <SettingsCommandAdapter page="metrics" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section ?? "metrics"}
    metrics={panel}
    members={<ClerkMembersProfile />} workspaceManagement={<ClerkWorkspaceProfile />}
    account={<AccountProfile fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
    security={<AccountSecurity />} role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />} />;
}
