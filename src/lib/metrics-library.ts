import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db, metricDefinitionAliases, metricDefinitionHistory, metricDefinitions, type MetricDefinitionHistoryKind } from "@/db";
import { STARTER_METRIC_KEYS, type MetricUnit, type StarterMetricKey } from "@/lib/metric-definition-rules";
import { savedMetricsOf, type SavedMetric } from "@/lib/saved-metrics";

/**
 * The Metrics library (#195 item 1, #196). The only module that reads or writes Metric definitions and
 * their history: the Metrics page, the prediction picker, the Impact read model and search all go
 * through it (src/lib/metrics-library-boundary.test.ts holds every other file to that).
 *
 * Access is the caller's job: pages and actions check the person's role through the shared guards first
 * and pass only the workspace they were rendered for.
 */

export type MetricDefinition = {
  id: string;
  name: string;
  unit: MetricUnit;
  link: string | null;
  howCounted: string | null;
  archivedAt: Date | null;
  mergedIntoId: string | null;
  /** Null for a starter metric, which Lane added. */
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MetricDefinitionHistoryEntry = {
  revision: number;
  kind: MetricDefinitionHistoryKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  /** Null only for a creation Lane made: a starter metric, or a metric moved in from saved Requests (0038). */
  authorId: string | null;
  createdAt: Date;
};

export type MetricsWorkspace = { orgId: string };

const STARTER_METRICS: Record<StarterMetricKey, { name: string; unit: MetricUnit; howCounted: string }> = {
  conversion: { name: "Conversion rate", unit: "percent", howCounted: "Share of people who start the step and finish it, within the measurement window." },
  adoption: { name: "Feature adoption rate", unit: "percent", howCounted: "Share of active users who use the feature at least once within the measurement window." },
  error: { name: "User error rate", unit: "percent", howCounted: "Share of people who hit an error while doing the task, within the measurement window." },
  support: { name: "Support contact rate", unit: "percent", howCounted: "Share of users who contact support about this area, within the measurement window." },
  csat: { name: "Customer satisfaction", unit: "percent", howCounted: "Share of survey responses that rate their experience as satisfied." },
  duration: { name: "Median time to convert", unit: "seconds", howCounted: "Median time from starting the step to finishing it." },
  events: { name: "Action count", unit: "count", howCounted: "Number of times people take the action within the measurement window." },
};

const definitionColumns = {
  id: metricDefinitions.id,
  name: metricDefinitions.name,
  unit: metricDefinitions.unit,
  link: metricDefinitions.link,
  howCounted: metricDefinitions.howCounted,
  archivedAt: metricDefinitions.archivedAt,
  mergedIntoId: metricDefinitions.mergedIntoId,
  starterKey: metricDefinitions.starterKey,
  createdBy: metricDefinitions.createdBy,
  createdAt: metricDefinitions.createdAt,
  updatedAt: metricDefinitions.updatedAt,
};

/** What history keeps of a definition, before and after a change. */
function snapshotOf(definition: Pick<MetricDefinition, "name" | "unit" | "link" | "howCounted" | "archivedAt" | "mergedIntoId">) {
  return {
    name: definition.name, unit: definition.unit, link: definition.link, howCounted: definition.howCounted,
    archivedAt: definition.archivedAt?.toISOString() ?? null, mergedIntoId: definition.mergedIntoId,
  };
}

function allDefinitions(orgId: string) {
  return db.select(definitionColumns).from(metricDefinitions)
    .where(eq(metricDefinitions.orgId, orgId))
    .orderBy(asc(sql`lower(${metricDefinitions.name})`), asc(metricDefinitions.id));
}

/**
 * Adds whichever starter metrics the workspace has never had. Safe to run more than once and at once:
 * the database keeps one row per starter per workspace, and a renamed or archived starter still counts.
 */
async function fillStarterMetrics(orgId: string, missing: StarterMetricKey[]) {
  await db.transaction(async (tx) => {
    const added = await tx.insert(metricDefinitions)
      .values(missing.map((key) => ({ orgId, starterKey: key, createdBy: null, ...STARTER_METRICS[key] })))
      .onConflictDoNothing()
      .returning(definitionColumns);
    if (!added.length) return;
    await tx.insert(metricDefinitionHistory).values(added.map((definition) => ({
      orgId, definitionId: definition.id, revision: 1, kind: "created" as const, before: null, after: snapshotOf(definition), authorId: null,
    })));
  });
}

/**
 * A workspace's Metric definitions, by name. Active ones only (not archived, not merged away), unless
 * `includeArchived` asks for every definition. Fills the starter metrics the first time it is read.
 */
export async function listMetricDefinitions(workspace: MetricsWorkspace, options: { includeArchived?: boolean } = {}): Promise<MetricDefinition[]> {
  const rows = await workspaceDefinitions(workspace.orgId);
  return rows
    .filter((row) => options.includeArchived || (!row.archivedAt && !row.mergedIntoId))
    .map(definitionOf);
}

/** Every definition of the workspace, merged and archived ones included, after filling any missing starter metrics. */
async function workspaceDefinitions(orgId: string) {
  const rows = await allDefinitions(orgId);
  const present = new Set(rows.map((row) => row.starterKey).filter(Boolean));
  const missing = STARTER_METRIC_KEYS.filter((key) => !present.has(key));
  if (!missing.length) return rows;
  await fillStarterMetrics(orgId, missing);
  return allDefinitions(orgId);
}

function definitionOf(row: Awaited<ReturnType<typeof allDefinitions>>[number]): MetricDefinition {
  return {
    id: row.id, name: row.name, unit: row.unit, link: row.link, howCounted: row.howCounted, archivedAt: row.archivedAt,
    mergedIntoId: row.mergedIntoId, createdBy: row.createdBy, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

export type ResolvedSavedMetric = SavedMetric & {
  /** The definition the saved metric counts under now (after any merge), or null if the library has none for it. */
  definition: MetricDefinition | null;
};

/**
 * Resolves the metrics saved on Requests to the workspace's current definitions, without rewriting anything (#200).
 * `impacts` are saved Expected impacts of any version: a Request's current one, its measurement draft, an older
 * Expected impact revision, or a closed result's `expected`. Returns, in the same order, each one's metrics
 * (`savedMetricsOf`) with their definition. A built-in or typed metric resolves through the mapping migration 0038
 * recorded; a built-in metric in its starter unit always resolves to the starter metric. A merged definition
 * resolves to the one it was merged into; an archived one still resolves. A typed metric the migration never saw
 * (only in a browser draft) resolves to null.
 */
export async function resolveSavedMetrics(workspace: MetricsWorkspace, impacts: readonly unknown[]): Promise<ResolvedSavedMetric[][]> {
  const found = impacts.map(savedMetricsOf);
  const refs = found.flat().map((metric) => metric.ref);
  if (!refs.length) return found.map(() => []);
  const lookups = refs.map((ref, index) => ({ i: index, builtin_key: ref.kind === "builtin" ? ref.key : null, typed_name: ref.kind === "typed" ? ref.name : null, unit: ref.unit }));
  const [rows, aliases] = await Promise.all([
    workspaceDefinitions(workspace.orgId),
    db.execute<{ i: number; definition_id: string }>(sql`
      select r.i, a.definition_id from jsonb_to_recordset(${JSON.stringify(lookups)}::jsonb) as r(i int, builtin_key text, typed_name text, unit text)
      join ${metricDefinitionAliases} a on a.org_id = ${workspace.orgId} and a.unit = public.metric_alias_unit(r.unit)
       and (a.builtin_key = r.builtin_key or a.typed_name = public.metric_alias_name(r.typed_name))`),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const mapped = new Map(aliases.map((alias) => [Number(alias.i), alias.definition_id]));
  const current = (id: string | undefined) => {
    let row = id ? byId.get(id) : undefined;
    for (let hops = 0; row?.mergedIntoId && hops < byId.size; hops++) row = byId.get(row.mergedIntoId);
    return row ? definitionOf(row) : null;
  };
  let index = 0;
  return found.map((metrics) => metrics.map((metric) => {
    const ref = metric.ref;
    const starter = ref.kind === "builtin" && ref.unit === STARTER_METRICS[ref.key].unit ? rows.find((row) => row.starterKey === ref.key)?.id : undefined;
    return { ...metric, definition: current(mapped.get(index++) ?? starter) };
  }));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A definition's history, oldest first. Empty for an id that isn't one of this workspace's definitions. */
export async function readMetricDefinitionHistory(workspace: MetricsWorkspace, definitionId: string): Promise<MetricDefinitionHistoryEntry[]> {
  if (!UUID.test(definitionId)) return [];
  return db.select({
    revision: metricDefinitionHistory.revision,
    kind: metricDefinitionHistory.kind,
    before: metricDefinitionHistory.before,
    after: metricDefinitionHistory.after,
    authorId: metricDefinitionHistory.authorId,
    createdAt: metricDefinitionHistory.createdAt,
  }).from(metricDefinitionHistory)
    .where(and(eq(metricDefinitionHistory.orgId, workspace.orgId), eq(metricDefinitionHistory.definitionId, definitionId)))
    .orderBy(asc(metricDefinitionHistory.revision));
}

