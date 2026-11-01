import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { timePage, timed } from "@/lib/request-timings";
import { ArrowLeft } from "lucide-react";
import { AccountProfile, AccountSecurity } from "@/components/settings/account-profile";
import { ClerkWorkspaceProfile } from "@/components/auth/clerk-members-profile";
import { MetricDefinitionFacts } from "@/components/metrics/metric-definition-list";
import { canChangeThings } from "@/lib/role-rules";
import { membersPanel } from "../../members/members-panel";
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
import { sharedPanels } from "../../profile/shared-panels";
import { ArchiveMetricControl, MergeMetricControl } from "../metric-controls";
import { EditMetricForm } from "../edit-metric-form";
import styles from "../metrics.module.css";

/**
 * One Metric definition under Settings → Metrics (#197): edit it, archive, restore or merge it (Admins, #202),
 * and read its history. Members and Admins only.
 */
export default async function MetricDefinitionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  void timePage("Settings: a Metric");
  const workspace = await getWorkspace();
  if (!workspace) redirect("/login");
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  const [{ id }, { section }] = await Promise.all([params, searchParams]);
  const library = workspace;
  // #265: the shared Settings sections are read alongside the definition, not after it.
  const panelsRead = sharedPanels(workspace);
  const [definition, history, unitLocked] = await Promise.all([timed("data", () => readMetricDefinition(library, id)), timed("data", () => readMetricDefinitionHistory(library, id)), timed("data", () => metricDefinitionUnitLocked(library, id))]);
  if (!definition) notFound();
  const archived = !!definition.archivedAt;
  const merged = !!definition.mergedIntoId;
  const isAdmin = workspace.role === "admin";
  // #210: a Viewer reads the definition and changes nothing.
  const canEdit = canChangeThings(workspace.role);
  // A merge needs another definition in the same unit that hasn't itself been merged away; archived ones count.
  // #203: a merged definition's Requests count under the one it was merged into, so they are listed there, not here.
  const [keptDefinition, everyDefinition, uses, panels] = await Promise.all([
    definition.mergedIntoId ? timed("data", () => readMetricDefinition(library, definition.mergedIntoId!)) : null,
    isAdmin && !merged ? timed("data", () => listMetricDefinitions(library, { includeArchived: true })) : [],
    merged ? null : timed("data", () => loadDefinitionUses({ userId: workspace.userId, orgId: workspace.orgId, role: workspace.role }, definition.id, { now: new Date() })),
    panelsRead,
  ]);
  const candidates = everyDefinition.filter(other => other.id !== definition.id && !other.mergedIntoId && other.unit === definition.unit)
    .map(other => ({ id: other.id, name: other.name, archived: !!other.archivedAt }));

  const panel = <>
    <Link href="/settings/metrics" className={styles.backLink}><ArrowLeft data-icon-size="sm" aria-hidden="true" />All metrics</Link>
    <SettingsCard title={definition.name}
      description={merged ? undefined : archived ? "Archived. It isn't offered for new goals, and stays on the Requests that already use it." : undefined}>
      {merged && <p className={styles.note}>
        Merged into {keptDefinition ? <Link href={`/settings/metrics/${keptDefinition.id}`} className={styles.keptLink}>{keptDefinition.name}</Link> : "another metric"}. Requests that used it now count under that one.
      </p>}
      {!merged && !canEdit && <MetricDefinitionFacts definition={definition} canEdit={false} />}
      {!merged && canEdit && <EditMetricForm orgId={workspace.orgId} definition={{ id: definition.id, name: definition.name, unit: definition.unit, link: definition.link ?? "", howCounted: definition.howCounted ?? "" }} unitLocked={unitLocked} />}
    </SettingsCard>
    {isAdmin && !merged && <SettingsCard title={archived ? "Restore" : "Archive"}
      description={archived ? "Restoring offers it for new goals again." : "Archiving stops it being offered for new goals. Requests that already use it keep it, and their results still add up."}
      action={<ArchiveMetricControl orgId={workspace.orgId} id={definition.id} archived={archived} />} />}
    {isAdmin && !merged && <SettingsCard title="Merge"
      description="If another metric counts the same thing in the same unit, merge the two so their results add up together. Merging can't be undone.">
      {candidates.length
        ? <MergeMetricControl orgId={workspace.orgId} current={{ id: definition.id, name: definition.name }} candidates={candidates} />
        : <p className={styles.note}>No other metric is counted in {metricUnitName(definition.unit).toLowerCase()}, so there&apos;s nothing to merge it with.</p>}
    </SettingsCard>}
    {uses && <SettingsCard title="Requests that used it"
      description="Grouped by Project, with each goal beside what happened. Uses as the main metric and as a guardrail are listed apart.">
      <DefinitionUsesList uses={uses} />
    </SettingsCard>}
    <SettingsCard title="History">
      <MetricDefinitionHistory entries={history.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString() }))} />
    </SettingsCard>
  </>;

  return <SettingsCommandAdapter page="metrics" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section ?? "metrics"}
    metrics={panel}
    members={membersPanel(workspace)} workspaceManagement={<ClerkWorkspaceProfile />}
    account={<AccountProfile orgId={workspace.orgId} fallbackName={workspace.fullName} fallbackEmail={workspace.email} />}
    security={<AccountSecurity />} role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    {...panels} />;
}
