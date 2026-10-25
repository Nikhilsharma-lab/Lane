import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { ClerkMembersProfile, ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { DefinitionUsesList } from "@/components/metrics/definition-uses";
import { MetricDefinitionHistory } from "@/components/metrics/metric-definition-history";
import { SettingsCard } from "@/components/settings/settings-card";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { loadDefinitionUses } from "@/lib/data/impact";
import { getWorkspace } from "@/lib/ensure-workspace";
import { metricUnitName } from "@/lib/metric-definition-rules";
import { listMetricDefinitions, metricDefinitionUnitLocked, readMetricDefinition, readMetricDefinitionHistory } from "@/lib/metrics-library";
import { ProfileForm } from "../../profile/profile-form";
import { ThemePreference } from "../../profile/theme-preference";
import { inboxDeliveryPanel } from "../../profile/inbox-delivery";
import { slackPanel } from "../../profile/slack-panel";
import { ArchiveMetricControl, EditMetricForm, MergeMetricControl } from "../metric-controls";
import styles from "../metrics.module.css";

/**
 * One Metric definition under Settings → Metrics (#197): edit it, archive, restore or merge it (Admins, #202),
 * and read its history. Members and Admins only.
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
  const isAdmin = workspace.role === "admin";
  // A merge needs another definition in the same unit that hasn't itself been merged away; archived ones count.
  // #203: a merged definition's Requests count under the one it was merged into, so they are listed there, not here.
  const [keptDefinition, everyDefinition, uses] = await Promise.all([
    definition.mergedIntoId ? readMetricDefinition(library, definition.mergedIntoId) : null,
    isAdmin && !merged ? listMetricDefinitions(library, { includeArchived: true }) : [],
    merged ? null : loadDefinitionUses({ userId: workspace.userId, orgId: workspace.orgId, role: workspace.role }, definition.id),
  ]);
  const candidates = everyDefinition.filter(other => other.id !== definition.id && !other.mergedIntoId && other.unit === definition.unit)
    .map(other => ({ id: other.id, name: other.name, archived: !!other.archivedAt }));

  const panel = <>
    <Link href="/settings/metrics" className={styles.backLink}><ArrowLeft data-icon-size="sm" aria-hidden="true" />All metrics</Link>
    <SettingsCard title={definition.name}
      description={merged ? undefined : archived ? "Archived. It isn't offered for new predictions, and stays on the Requests that already use it." : undefined}>
      {merged && <p className={styles.note}>
        Merged into {keptDefinition ? <Link href={`/settings/metrics/${keptDefinition.id}`} className={styles.keptLink}>{keptDefinition.name}</Link> : "another metric"}. Requests that used it now count under that one.
      </p>}
      {!merged && <EditMetricForm orgId={workspace.orgId} definition={{ id: definition.id, name: definition.name, unit: definition.unit, link: definition.link ?? "", howCounted: definition.howCounted ?? "" }} unitLocked={unitLocked} />}
    </SettingsCard>
    {isAdmin && !merged && <SettingsCard title={archived ? "Restore" : "Archive"}
      description={archived ? "Restoring offers it for new predictions again." : "Archiving stops it being offered for new predictions. Requests that already use it keep it, and their results still add up."}
      action={<ArchiveMetricControl orgId={workspace.orgId} id={definition.id} archived={archived} />} />}
    {isAdmin && !merged && <SettingsCard title="Merge"
      description="If another metric counts the same thing in the same unit, merge the two so their results add up together. Merging can't be undone.">
      {candidates.length
        ? <MergeMetricControl orgId={workspace.orgId} current={{ id: definition.id, name: definition.name }} candidates={candidates} />
        : <p className={styles.note}>No other metric is counted in {metricUnitName(definition.unit).toLowerCase()}, so there&apos;s nothing to merge it with.</p>}
    </SettingsCard>}
    {uses && <SettingsCard title="Requests that used it"
      description="Grouped by Project, with what each predicted beside what happened. Uses as the main metric and as a guardrail are listed apart.">
      <DefinitionUsesList uses={uses} />
    </SettingsCard>}
    <SettingsCard title="History">
      <MetricDefinitionHistory entries={history.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString() }))} />
    </SettingsCard>
  </>;

  return <SettingsCommandAdapter page="metrics" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section ?? "metrics"}
    metrics={panel}
    members={<ClerkMembersProfile />} workspaceManagement={<ClerkWorkspaceProfile />}
    account={<AccountProfile fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
    security={<AccountSecurity />} role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    delivery={await inboxDeliveryPanel(workspace)} slack={await slackPanel(workspace)} />;
}
