import "server-only";

import { and, asc, eq, isNull, max, ne, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { db, metricDefinitionAliases, metricDefinitionHistory, metricDefinitions, profiles, requestExpectedImpactRevisions, requests, type MetricDefinitionHistoryKind } from "@/db";
import { metricUnitName, STARTER_METRIC_KEYS, type MetricChoice, type MetricDefinitionInput, type MetricUnit, type StarterMetricKey } from "@/lib/metric-definition-rules";
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
  /** The author's profile name; null for a starter metric's creation (or a profile without a name). */
  authorName: string | null;
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
  return (await resolveWith(workspace, impacts)).resolved;
}

type DefinitionRow = Awaited<ReturnType<typeof allDefinitions>>[number];

/** resolveSavedMetrics, also handing back the workspace's definitions it read (filled with the starters). */
async function resolveWith(workspace: MetricsWorkspace, impacts: readonly unknown[], rowsRead?: Promise<DefinitionRow[]>): Promise<{ resolved: ResolvedSavedMetric[][]; rows: DefinitionRow[] }> {
  const found = impacts.map(savedMetricsOf);
  const refs = found.flat().map((metric) => metric.ref);
  if (!refs.length) return { resolved: found.map(() => []), rows: rowsRead ? await rowsRead : [] };
  const lookups = refs.map((ref, index) => ({ i: index, builtin_key: ref.kind === "builtin" ? ref.key : null, typed_name: ref.kind === "typed" ? ref.name : null, unit: ref.unit }));
  const [rows, aliases] = await Promise.all([
    rowsRead ?? workspaceDefinitions(workspace.orgId),
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
  const resolved = found.map((metrics) => metrics.map((metric) => {
    const ref = metric.ref;
    // A v5 reference (#198) names its definition; only this workspace's resolve.
    if (ref.kind === "definition") { index++; return { ...metric, definition: current(ref.id) }; }
    const starter = ref.kind === "builtin" && ref.unit === STARTER_METRICS[ref.key].unit ? rows.find((row) => row.starterKey === ref.key)?.id : undefined;
    return { ...metric, definition: current(mapped.get(index++) ?? starter) };
  }));
  return { resolved, rows };
}

const isActive = (row: Pick<DefinitionRow, "archivedAt" | "mergedIntoId">) => !row.archivedAt && !row.mergedIntoId;
const choiceOf = (row: Pick<DefinitionRow, "id" | "name" | "unit" | "link" | "howCounted" | "archivedAt" | "mergedIntoId">): MetricChoice =>
  ({ id: row.id, name: row.name, unit: row.unit, link: row.link, howCounted: row.howCounted, archived: !isActive(row) });

/** The v5 definition references in a saved prediction, with their positions (0 the main metric, then guardrails). */
function definitionRefs(impact: unknown) {
  return savedMetricsOf(impact).flatMap((metric) => metric.ref.kind === "definition" ? [{ ...metric, id: metric.ref.id, unit: metric.ref.unit }] : []);
}

const idArray = (ids: string[]) => sql`array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]`;

/**
 * What the prediction picker offers (#198): the workspace's active definitions, by name, plus any definition the
 * given saved prediction (the Request being edited, or a recovered draft) already names, even if archived or merged
 * since (marked `archived`). `saved` is, by position (0 the main metric, then guardrails), the definition each of its
 * metrics resolves to now, so an older plan can move onto v5 when it is edited.
 */
export async function predictionMetricChoices(workspace: MetricsWorkspace, impact: unknown): Promise<{ metrics: MetricChoice[]; saved: (MetricChoice | null)[] }> {
  const { resolved: [metrics], rows } = await resolveWith(workspace, [impact], workspaceDefinitions(workspace.orgId));
  const named = new Set(definitionRefs(impact).map((ref) => ref.id));
  const saved: (MetricChoice | null)[] = [];
  for (const metric of metrics) saved[metric.position] = metric.definition ? choiceOf(metric.definition) : null;
  return {
    metrics: rows.filter((row) => isActive(row) || named.has(row.id) || metrics.some((metric) => metric.definition?.id === row.id)).map(choiceOf),
    saved: Array.from({ length: saved.length }, (_, position) => saved[position] ?? null),
  };
}

/**
 * The current name of every definition the saved predictions name (v5), after any merge, keyed by the reference
 * saved on the Request. Request pages show these; Request history keeps the copy saved with the prediction.
 * One statement, and none when nothing is named.
 */
export async function currentMetricNames(workspace: MetricsWorkspace, impacts: readonly unknown[]): Promise<Record<string, string>> {
  const ids = [...new Set(impacts.flatMap((impact) => definitionRefs(impact).map((ref) => ref.id)))].filter((id) => UUID.test(id));
  if (!ids.length) return {};
  const rows = await db.execute<{ id: string; name: string }>(sql`
    with recursive chain(id, at, hops) as (
      select d.id, d.id, 0 from ${metricDefinitions} d where d.org_id = ${workspace.orgId} and d.id = any(${idArray(ids)})
      union all
      select c.id, d.merged_into_id, c.hops + 1 from chain c join ${metricDefinitions} d on d.org_id = ${workspace.orgId} and d.id = c.at
      where d.merged_into_id is not null and c.hops < 100
    )
    select distinct on (c.id) c.id, d.name from chain c join ${metricDefinitions} d on d.org_id = ${workspace.orgId} and d.id = c.at
    order by c.id, c.hops desc`);
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

/**
 * A search condition (#201): true when a saved Expected impact (`impact`, a jsonb column or expression) names a metric
 * whose definition's current name contains `query` (case-insensitive, taken literally). The metric resolves as
 * `resolveSavedMetrics` resolves it, in SQL: a v5 reference by id, an older built-in key or typed name and unit through
 * the mapping 0038 recorded, a built-in key in its starter unit to the starter metric; a merged definition counts under
 * the one it was merged into, and archived definitions match. Pass/fail checks are never definitions. No statement of
 * its own: the caller embeds it in its query.
 */
export function savedMetricNameMatches(workspace: MetricsWorkspace, query: string, impact: SQLWrapper): SQL {
  const org = workspace.orgId;
  const starterUnit = sql`case s.key ${sql.join(STARTER_METRIC_KEYS.map((key) => sql`when ${key} then ${STARTER_METRICS[key].unit}`), sql` `)} end`;
  const array = (value: SQL) => sql`case when jsonb_typeof(${value}) = 'array' then ${value} else '[]'::jsonb end`;
  return sql`exists (
    with recursive matched(id) as (
      select d.id from ${metricDefinitions} d
      where d.org_id = ${org} and d.merged_into_id is null and strpos(lower(d.name), lower(${query})) > 0
      union
      select d.id from ${metricDefinitions} d join matched m on d.merged_into_id = m.id where d.org_id = ${org}
    ), saved(key, name, unit, definition_id) as (
      select e ->> 'key', e ->> 'name', e ->> 'unit', e ->> 'definitionId'
      from jsonb_array_elements(case when ${impact} ->> 'kind' = 'measurement'
        then jsonb_build_array(${impact} -> 'primary') || ${array(sql`${impact} -> 'guardrails'`)} else '[]'::jsonb end) e
      union all
      select 'custom', e ->> 'metric', e ->> 'unit', null
      from jsonb_array_elements(case when ${impact} ->> 'kind' in ('metric', 'verification')
        then (case when ${impact} ->> 'kind' = 'metric' then jsonb_build_array(${impact}) else '[]'::jsonb end)
          || (case when jsonb_typeof(${impact} -> 'guardrail') = 'object' then jsonb_build_array(${impact} -> 'guardrail') else '[]'::jsonb end)
          || ${array(sql`${impact} -> 'additionalGuardrails'`)}
        else '[]'::jsonb end) e
    )
    select 1 from saved s join ${metricDefinitions} d on d.org_id = ${org} and d.id in (select id from matched)
    where coalesce(btrim(s.unit), '') <> '' and (
      (s.key = 'definition' and s.definition_id = d.id::text)
      or exists (select 1 from ${metricDefinitionAliases} a where a.org_id = ${org} and a.definition_id = d.id
        and a.unit = public.metric_alias_unit(s.unit)
        and (a.builtin_key = s.key or (s.key = 'custom' and a.typed_name = public.metric_alias_name(s.name))))
      or (d.starter_key = s.key and s.unit = ${starterUnit} and not exists (select 1 from ${metricDefinitionAliases} a
        where a.org_id = ${org} and a.builtin_key = s.key and a.unit = public.metric_alias_unit(s.unit)))
    )
  )`;
}

/** A prediction the library refuses to save, with the sentence to show; or the prediction to save. */
export type PredictionCheck = { impact: unknown } | MetricsLibraryRefusal;

const NOT_PICKABLE = "A metric on this prediction isn't in this workspace's Metrics library. Pick it again.";

/**
 * Checks the metrics of a prediction about to be saved (#198). Every definition it names must be one of the workspace's,
 * in the unit the prediction was entered in, and active, unless `stored` (the Request's saved prediction, when editing)
 * already names it. Typed metrics are refused unless the Request already saved that exact one. Returns the prediction
 * with each definition's name copied as it is now, or as the Request saved it before, so the copy is the library's.
 */
export async function checkPredictionMetrics(workspace: MetricsWorkspace, impact: unknown, stored: unknown = null): Promise<PredictionCheck> {
  const typedBefore = new Set(savedMetricsOf(stored).flatMap(({ ref }) => ref.kind === "typed" ? [JSON.stringify([ref.name, ref.unit])] : []));
  const typedNow = savedMetricsOf(impact).flatMap(({ ref }) => ref.kind === "typed" && !typedBefore.has(JSON.stringify([ref.name, ref.unit])) ? [ref] : []);
  if (typedNow.length) {
    // The older Metric and Verified result formats save the name of a metric picked from the library, not a reference.
    const legacy = typeof impact === "object" && impact !== null && ["metric", "verification"].includes(String((impact as { kind?: unknown }).kind));
    const active = legacy ? (await workspaceDefinitions(workspace.orgId)).filter(isActive) : [];
    const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
    const unitKey = (unit: string) => unit.trim() === "%" ? "percent" : unit.trim().toLowerCase();
    if (!typedNow.every((ref) => active.some((row) => sameName(row.name, ref.name) && row.unit === unitKey(ref.unit))))
      return { error: "Pick each metric from the Metrics library." };
  }
  const refs = definitionRefs(impact);
  if (!refs.length) return { impact };
  if (refs.some((ref) => !UUID.test(ref.id))) return { error: NOT_PICKABLE };
  const rows = await db.select(definitionColumns).from(metricDefinitions)
    .where(and(eq(metricDefinitions.orgId, workspace.orgId), sql`${metricDefinitions.id} = any(${idArray(refs.map((ref) => ref.id))})`));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const savedNames = new Map(definitionRefs(stored).map((ref) => [ref.id, ref.savedName]));
  for (const ref of refs) {
    const row = byId.get(ref.id);
    if (!row) return { error: NOT_PICKABLE };
    if (!isActive(row) && !savedNames.has(row.id)) return { error: row.mergedIntoId
      ? `“${row.name}” was merged into another metric, so it can't be picked for a new prediction. Pick that one instead.`
      : `“${row.name}” is archived, so it can't be picked for a new prediction. Pick another metric.` };
    if (row.unit !== ref.unit) return { error: `“${row.name}” is counted in ${metricUnitName(row.unit).toLowerCase()} now. Pick it again and enter the numbers in that unit.` };
  }
  const copy = (metric: unknown) => {
    if (!metric || typeof metric !== "object" || (metric as { key?: unknown }).key !== "definition") return metric;
    const id = String((metric as { definitionId?: unknown }).definitionId);
    return { ...metric, name: savedNames.get(id) || byId.get(id)!.name };
  };
  const plan = impact as { primary: unknown; guardrails: unknown[] };
  return { impact: { ...plan, primary: copy(plan.primary), guardrails: plan.guardrails.map(copy) } };
}

/**
 * Whether any Request uses the definition (or one merged into it): a prediction or older revision naming it, a closed
 * result's prediction, a metric the move into the library (0038) mapped to it, or, for a starter metric, an older plan
 * saving its built-in key in its unit. Once one does, the unit is locked.
 */
async function definitionInUse(executor: Pick<typeof db, "execute">, orgId: string, id: string): Promise<boolean> {
  const [row] = await executor.execute<{ used: boolean }>(sql`
    with recursive family(id) as (
      select ${id}::uuid
      union select d.id from ${metricDefinitions} d join family f on d.merged_into_id = f.id where d.org_id = ${orgId}
    ), ids as (select array_agg(id::text) as ids from family)
    select exists (select 1 from ${metricDefinitionAliases} a where a.org_id = ${orgId} and a.definition_id in (select id from family))
      or exists (select 1 from ${requests} r, ids where r.org_id = ${orgId}
        and (public.prediction_definition_ids(r.expected_impact) && ids.ids or public.prediction_definition_ids(r.outcome_closure -> 'expected') && ids.ids))
      or exists (select 1 from ${requestExpectedImpactRevisions} h, ids where h.org_id = ${orgId} and public.prediction_definition_ids(h.expected_impact) && ids.ids)
      or exists (select 1 from ${metricDefinitions} s join ${requests} r on r.org_id = s.org_id
        where s.org_id = ${orgId} and s.id in (select id from family) and s.starter_key is not null
          and r.expected_impact ->> 'kind' = 'measurement' and r.expected_impact ->> 'version' in ('2', '3', '4')
          and jsonb_path_exists(r.expected_impact, '$.** ? (@.key == $k && @.unit == $u)', jsonb_build_object('k', s.starter_key, 'u', s.unit)))
      as used`);
  return Boolean(row?.used);
}

/** Whether a definition's unit is locked because a Request uses it (#198). The Metrics page says so beside the unit. */
export async function metricDefinitionUnitLocked(workspace: MetricsWorkspace, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return definitionInUse(db, workspace.orgId, id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One of the workspace's definitions, archived and merged ones included; null for any other id. */
export async function readMetricDefinition(workspace: MetricsWorkspace, definitionId: string): Promise<MetricDefinition | null> {
  if (!UUID.test(definitionId)) return null;
  const [row] = await db.select(definitionColumns).from(metricDefinitions)
    .where(and(eq(metricDefinitions.orgId, workspace.orgId), eq(metricDefinitions.id, definitionId)));
  return row ? definitionOf(row) : null;
}

/** A definition's history, oldest first, with each author's profile name. Empty for an id that isn't one of this workspace's definitions. */
export async function readMetricDefinitionHistory(workspace: MetricsWorkspace, definitionId: string): Promise<MetricDefinitionHistoryEntry[]> {
  if (!UUID.test(definitionId)) return [];
  return db.select({
    revision: metricDefinitionHistory.revision,
    kind: metricDefinitionHistory.kind,
    before: metricDefinitionHistory.before,
    after: metricDefinitionHistory.after,
    authorId: metricDefinitionHistory.authorId,
    authorName: profiles.fullName,
    createdAt: metricDefinitionHistory.createdAt,
  }).from(metricDefinitionHistory)
    .leftJoin(profiles, eq(profiles.id, metricDefinitionHistory.authorId))
    .where(and(eq(metricDefinitionHistory.orgId, workspace.orgId), eq(metricDefinitionHistory.definitionId, definitionId)))
    .orderBy(asc(metricDefinitionHistory.revision));
}

type LibraryTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Snapshot = ReturnType<typeof snapshotOf>;
/** What both sides of a merge record beside their snapshot (#202): which was kept and which merged away, by name at the time. */
export type MetricMergeRecord = { keptId: string; keptName: string; mergedId: string; mergedName: string };

/**
 * Keeps one change in a definition's history: the next revision for that definition, in the caller's
 * transaction, so the change and its record are saved together or not at all.
 */
async function recordHistory(tx: LibraryTx, entry: {
  orgId: string; definitionId: string; kind: MetricDefinitionHistoryKind; before: Snapshot | null; after: Snapshot & { merge?: MetricMergeRecord }; authorId: string;
}) {
  const [latest] = await tx.select({ revision: max(metricDefinitionHistory.revision) }).from(metricDefinitionHistory)
    .where(and(eq(metricDefinitionHistory.orgId, entry.orgId), eq(metricDefinitionHistory.definitionId, entry.definitionId)));
  await tx.insert(metricDefinitionHistory).values({ ...entry, revision: Number(latest?.revision ?? 0) + 1 });
}

/** A change the library refuses, with the sentence to show the person. Nothing was saved. */
export type MetricsLibraryRefusal = { error: string; /** The field the refusal is about, when there is one. */ field?: "name" | "unit" };

class Refused extends Error {
  constructor(message: string, readonly field?: "name" | "unit") { super(message); }
}

const nameTaken = (name: string) => new Refused(`A metric called “${name}” already exists. Use that one, or choose another name.`, "name");

/** An active definition (not archived, not merged away) with this name, ignoring case; optionally not `except`. */
async function activeNamed(tx: LibraryTx, orgId: string, name: string, except?: string) {
  const [row] = await tx.select({ id: metricDefinitions.id, name: metricDefinitions.name }).from(metricDefinitions).where(and(
    eq(metricDefinitions.orgId, orgId), isNull(metricDefinitions.archivedAt), isNull(metricDefinitions.mergedIntoId),
    sql`lower(${metricDefinitions.name}) = lower(${name})`, except ? ne(metricDefinitions.id, except) : undefined,
  )).limit(1);
  return row;
}

/** Postgres refused a second active definition with the same name (two saves at once). */
function isActiveNameClash(error: unknown) {
  for (let cause = error; cause && typeof cause === "object"; cause = (cause as { cause?: unknown }).cause) {
    if ((cause as { constraint_name?: string }).constraint_name === "metric_definitions_active_name_unique") return true;
  }
  return false;
}

/** Runs one library change in a transaction; a refusal anywhere in it saves nothing and comes back as `{ error }`. */
async function change<T>(name: string | null, work: (tx: LibraryTx) => Promise<T>): Promise<T | MetricsLibraryRefusal> {
  try {
    return await db.transaction(work);
  } catch (error) {
    const refused = error instanceof Refused ? error : name && isActiveNameClash(error) ? nameTaken(name) : null;
    if (refused) return refused.field ? { error: refused.message, field: refused.field } : { error: refused.message };
    throw error;
  }
}

/** Adds a definition to the workspace's library, recorded as created by `authorId`. */
export async function addMetricDefinition(workspace: MetricsWorkspace, authorId: string, input: MetricDefinitionInput): Promise<{ id: string } | MetricsLibraryRefusal> {
  return change(input.name, async (tx) => {
    const taken = await activeNamed(tx, workspace.orgId, input.name);
    if (taken) throw nameTaken(taken.name);
    const [added] = await tx.insert(metricDefinitions).values({ orgId: workspace.orgId, createdBy: authorId, ...input }).returning(definitionColumns);
    await recordHistory(tx, { orgId: workspace.orgId, definitionId: added.id, kind: "created", before: null, after: snapshotOf(added), authorId });
    return { id: added.id };
  });
}

/**
 * The active definition with this name, ignoring case and extra spaces, as the picker offers it. Reads through the
 * workspace's definitions, so a starter metric the library hasn't been filled with yet still counts.
 */
async function activeChoiceNamed(orgId: string, name: string): Promise<MetricChoice | null> {
  const plain = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase();
  const row = (await workspaceDefinitions(orgId)).find((definition) => isActive(definition) && plain(definition.name) === plain(name));
  return row ? choiceOf(row) : null;
}

/**
 * Adds a definition from the prediction form (#199): a name and a unit only, recorded in history like any other
 * add. If an active definition already has that name (ignoring case and extra spaces), nothing is added and that
 * one comes back as `existing`, to be offered instead.
 */
export async function addOrOfferMetricDefinition(workspace: MetricsWorkspace, authorId: string, input: { name: string; unit: MetricUnit }): Promise<{ metric: MetricChoice; existing: boolean }> {
  const name = input.name.trim().replace(/\s+/g, " ");
  const offered = await activeChoiceNamed(workspace.orgId, name);
  if (offered) return { metric: offered, existing: true };
  const added = await addMetricDefinition(workspace, authorId, { name, unit: input.unit, link: null, howCounted: null });
  if ("id" in added) return { metric: { id: added.id, name, unit: input.unit, link: null, howCounted: null, archived: false }, existing: false };
  // Someone added the same name a moment ago.
  const raced = await activeChoiceNamed(workspace.orgId, name);
  if (raced) return { metric: raced, existing: true };
  throw new Error(added.error);
}

const NOT_HERE = "That metric isn't in this workspace.";
/** Why a definition's unit can't change (#198). */
export const UNIT_LOCKED = "The unit can't change because a Request uses this metric. A metric in another unit needs a new definition.";
const MERGED = "This metric was merged into another one, so it can't be changed.";

/** The definition, locked for the rest of the transaction; refuses an id that isn't one of this workspace's. */
async function lockedDefinition(tx: LibraryTx, orgId: string, id: string) {
  if (!UUID.test(id)) throw new Refused(NOT_HERE);
  const [row] = await tx.select(definitionColumns).from(metricDefinitions)
    .where(and(eq(metricDefinitions.orgId, orgId), eq(metricDefinitions.id, id))).for("update");
  if (!row) throw new Refused(NOT_HERE);
  return row;
}

const sameSnapshot = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Changes a definition's name, unit, link and how-it's-counted line, recorded with the before and after.
 * A change that changes nothing records nothing. The unit is locked once any Request uses the definition (#198).
 */
export async function editMetricDefinition(workspace: MetricsWorkspace, authorId: string, id: string, input: MetricDefinitionInput): Promise<{ changed: boolean } | MetricsLibraryRefusal> {
  return change(input.name, async (tx) => {
    const current = await lockedDefinition(tx, workspace.orgId, id);
    if (current.mergedIntoId) throw new Refused(MERGED);
    const before = snapshotOf(current);
    if (sameSnapshot(before, snapshotOf({ ...current, ...input }))) return { changed: false };
    if (input.unit !== current.unit && await definitionInUse(tx, workspace.orgId, id)) throw new Refused(UNIT_LOCKED, "unit");
    if (!current.archivedAt) {
      const taken = await activeNamed(tx, workspace.orgId, input.name, id);
      if (taken) throw nameTaken(taken.name);
    }
    const [edited] = await tx.update(metricDefinitions).set(input)
      .where(and(eq(metricDefinitions.orgId, workspace.orgId), eq(metricDefinitions.id, id))).returning(definitionColumns);
    await recordHistory(tx, { orgId: workspace.orgId, definitionId: id, kind: "edited", before, after: snapshotOf(edited), authorId });
    return { changed: true };
  });
}

/**
 * Archives a definition: it stops being offered for new predictions, and stays on every Request that
 * already uses it (and still adds up there). Archiving an archived definition changes nothing.
 */
export async function archiveMetricDefinition(workspace: MetricsWorkspace, authorId: string, id: string): Promise<{ changed: boolean } | MetricsLibraryRefusal> {
  return change(null, async (tx) => {
    const current = await lockedDefinition(tx, workspace.orgId, id);
    if (current.mergedIntoId) throw new Refused(MERGED);
    if (current.archivedAt) return { changed: false };
    const [archived] = await tx.update(metricDefinitions).set({ archivedAt: sql`now()` })
      .where(and(eq(metricDefinitions.orgId, workspace.orgId), eq(metricDefinitions.id, id))).returning(definitionColumns);
    await recordHistory(tx, { orgId: workspace.orgId, definitionId: id, kind: "archived", before: snapshotOf(current), after: snapshotOf(archived), authorId });
    return { changed: true };
  });
}

/**
 * Merges one definition into another with the same unit (#202), for cleaning up duplicates. The kept definition is
 * unchanged; the merged one is marked "merged into" it, so it leaves the picker and the main list, and every Request
 * that used it counts under the kept one from now on (resolving a saved metric follows the link; no Request is
 * rewritten). Both histories record the merge. There is no unmerge: a merged-away definition can't be merged again
 * or kept. An archived definition can be merged away, or kept.
 */
export async function mergeMetricDefinitions(workspace: MetricsWorkspace, authorId: string, ids: { keptId: string; mergedId: string }): Promise<{ changed: true } | MetricsLibraryRefusal> {
  return change(null, async (tx) => {
    if (!UUID.test(ids.keptId) || !UUID.test(ids.mergedId)) throw new Refused(NOT_HERE);
    if (ids.keptId.toLowerCase() === ids.mergedId.toLowerCase()) throw new Refused("Choose two different metrics to merge.");
    // Lock both in a fixed order, so two merges of the same pair at once can't deadlock.
    const locked = new Map<string, DefinitionRow>();
    for (const id of [ids.keptId, ids.mergedId].sort()) locked.set(id, await lockedDefinition(tx, workspace.orgId, id));
    const kept = locked.get(ids.keptId)!, merged = locked.get(ids.mergedId)!;
    for (const row of [merged, kept]) if (row.mergedIntoId) throw new Refused(`“${row.name}” was already merged into another metric. Merges can't be undone.`);
    if (kept.unit !== merged.unit) {
      const unit = (row: DefinitionRow) => metricUnitName(row.unit).toLowerCase();
      throw new Refused(`“${merged.name}” is counted in ${unit(merged)} and “${kept.name}” in ${unit(kept)}. Only metrics with the same unit can be merged.`);
    }
    const merge: MetricMergeRecord = { keptId: kept.id, keptName: kept.name, mergedId: merged.id, mergedName: merged.name };
    const [away] = await tx.update(metricDefinitions).set({ mergedIntoId: kept.id })
      .where(and(eq(metricDefinitions.orgId, workspace.orgId), eq(metricDefinitions.id, merged.id))).returning(definitionColumns);
    await recordHistory(tx, { orgId: workspace.orgId, definitionId: merged.id, kind: "merged_away", before: snapshotOf(merged), after: { ...snapshotOf(away), merge }, authorId });
    await recordHistory(tx, { orgId: workspace.orgId, definitionId: kept.id, kind: "merged_into", before: snapshotOf(kept), after: { ...snapshotOf(kept), merge }, authorId });
    return { changed: true as const };
  });
}

/** Restores an archived definition, unless an active definition has taken its name since. */
export async function restoreMetricDefinition(workspace: MetricsWorkspace, authorId: string, id: string): Promise<{ changed: boolean } | MetricsLibraryRefusal> {
  return change(null, async (tx) => {
    const current = await lockedDefinition(tx, workspace.orgId, id);
    if (current.mergedIntoId) throw new Refused(MERGED);
    if (!current.archivedAt) return { changed: false };
    const clash = (name: string) => new Refused(`An active metric is already called “${name}”. Rename this one or that one first.`);
    const taken = await activeNamed(tx, workspace.orgId, current.name, id);
    if (taken) throw clash(taken.name);
    try {
      const [restored] = await tx.update(metricDefinitions).set({ archivedAt: null })
        .where(and(eq(metricDefinitions.orgId, workspace.orgId), eq(metricDefinitions.id, id))).returning(definitionColumns);
      await recordHistory(tx, { orgId: workspace.orgId, definitionId: id, kind: "restored", before: snapshotOf(current), after: snapshotOf(restored), authorId });
    } catch (error) {
      if (isActiveNameClash(error)) throw clash(current.name);
      throw error;
    }
    return { changed: true };
  });
}

