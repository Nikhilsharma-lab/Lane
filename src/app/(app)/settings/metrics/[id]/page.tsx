import Link from "@/components/link";
import { notFound, redirect } from "next/navigation";
import { timePage, timed } from "@/lib/request-timings";
import { ArrowLeft } from "lucide-react";
import { MetricDefinitionFacts } from "@/components/metrics/metric-definition-list";
import { canChangeThings } from "@/lib/role-rules";
import { membersPanel } from "../../members/members-panel";
import { DefinitionUsesList } from "@/components/metrics/definition-uses";
import { MetricDefinitionHistory } from "@/components/metrics/metric-definition-history";
import { SettingsBlock, SettingsGroup, SettingsRow } from "@/components/settings/settings-group";
import { SettingsCommandAdapter } from "@/components/settings/settings-command-adapter";
import { SettingsEarlySearch } from "@/components/settings/settings-early-search";
import { billingEnforced } from "@/lib/feature-switches";
import { loadDefinitionUses } from "@/lib/data/impact";
import { readMetricPage } from "@/lib/data/metric-page";
import { getWorkspace, sendAwayMemberless } from "@/lib/ensure-workspace";
import { metricUnitName } from "@/lib/metric-definition-rules";
import { listMetricDefinitions, metricDefinitionUnitLocked, readMetricDefinition, readMetricDefinitionHistory } from "@/lib/metrics-library";
import { ProfileForm } from "../../profile/profile-form";
import { ThemePreference } from "../../profile/theme-preference";
import { sharedPanels } from "../../profile/shared-panels";
import { AddHowCountedDialog, ArchiveMetricControl, EditMetricForm, MergeMetricControl } from "../metric-controls";
import styles from "../metrics.module.css";
import { settingsMetadata } from "../../settings-metadata";

export const metadata = settingsMetadata;

/**
 * One Metric definition under Settings → Metrics (#197): edit it, archive, restore or merge it (Admins, #202),
 * and read its history. Members and Admins only.
 */
export default async function MetricDefinitionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ section?: string }> }) {
  void timePage("Settings: a Metric");
  const workspace = await getWorkspace();
  if (!workspace) return sendAwayMemberless();
  if (workspace.needsOnboarding) redirect("/onboarding");
  if (workspace.role === "guest") redirect("/");

  const [{ id }, { section }] = await Promise.all([params, searchParams]);
  const library = workspace;
  // #265: the shared Settings sections are read alongside the definition, not after it.
  const panelsRead = sharedPanels(workspace);
  const [definition, history, unitLocked] = await Promise.all([readMetricPage(library, id), timed("data", () => readMetricDefinitionHistory(library, id)), timed("data", () => metricDefinitionUnitLocked(library, id))]);
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
    <SettingsGroup label={definition.name} labelId="metric-definition"
      description={merged ? undefined : archived ? "Archived. It isn’t offered for new goals, and stays on the Requests that already use it." : undefined}>
      <SettingsBlock className={styles.library} data-metric-definition="">
        {merged && <p className={styles.note}>
          Merged into {keptDefinition ? <Link href={`/settings/metrics/${keptDefinition.id}`} className={styles.keptLink}>{keptDefinition.name}</Link> : "another metric"}. Requests that used it now count under that one.
        </p>}
        {!merged && !canEdit && <MetricDefinitionFacts definition={definition} canEdit={false} />}
        {!merged && canEdit && <AddHowCountedDialog orgId={workspace.orgId} definition={{ id: definition.id, name: definition.name, unit: definition.unit, link: definition.link, howCounted: definition.howCounted }} />}
        {/* Keyed by the definition, so the form shows it read-only as soon as it's added. */}
        {!merged && canEdit && <EditMetricForm key={definition.howCounted ?? ""} orgId={workspace.orgId} definition={{ id: definition.id, name: definition.name, unit: definition.unit, link: definition.link ?? "", howCounted: definition.howCounted ?? "" }} unitLocked={unitLocked} />}
      </SettingsBlock>
    </SettingsGroup>
    {/* #288 (D29): a Member, who edits but doesn't archive or merge, is told why those aren't here. */}
    {workspace.role === "member" && !merged && <p className={styles.note}>Only Admins can archive or merge metrics.</p>}
    {isAdmin && !merged && <SettingsGroup>
      <SettingsRow label={archived ? "Restore" : "Archive"}
        hint={archived ? "Restoring offers it for new goals again." : "Archiving stops it being offered for new goals. Requests that already use it keep it, and their results still add up."}
        control={<ArchiveMetricControl orgId={workspace.orgId} id={definition.id} name={definition.name} archived={archived} />} />
    </SettingsGroup>}
    {isAdmin && !merged && <SettingsGroup label="Merge" labelId="metric-merge"
      description="If another metric counts the same thing in the same unit, merge the two so their results add up together. Merging can’t be undone.">
      <SettingsBlock className={styles.library}>
        {candidates.length
          ? <MergeMetricControl orgId={workspace.orgId} current={{ id: definition.id, name: definition.name }} candidates={candidates} />
          : <p className={styles.note}>No other metric is counted in {metricUnitName(definition.unit).toLowerCase()}, so there’s nothing to merge it with.</p>}
      </SettingsBlock>
    </SettingsGroup>}
    {uses && <SettingsGroup label="Requests that used it" labelId="metric-uses"
      description="Grouped by Project, with each goal beside what happened. Uses as the main metric and as a guardrail are listed apart.">
      <SettingsBlock className={styles.library}><DefinitionUsesList uses={uses} /></SettingsBlock>
    </SettingsGroup>}
    <SettingsGroup label="History" labelId="metric-history">
      <SettingsBlock className={styles.library}>
        <MetricDefinitionHistory entries={history.map(entry => ({ ...entry, createdAt: entry.createdAt.toISOString() }))} />
      </SettingsBlock>
    </SettingsGroup>
  </>;

  return <><SettingsCommandAdapter billingEnforced={billingEnforced()} page="metrics" membership={workspace.role} workspaceName={workspace.workspaceName} workspaceId={workspace.orgId} initialSection={section ?? "metrics"}
    metrics={panel}
    members={membersPanel(workspace)}
    role={<ProfileForm initialRole={workspace.profileRole} orgId={workspace.orgId} />} appearance={<ThemePreference compact />}
    {...panels} />
    <SettingsEarlySearch /></>;
}
