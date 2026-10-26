import "server-only";
import { seeable } from "@/lib/request-access";

import { and, asc, count, desc, eq, gte, lt, or, sql, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";

import { db, projects, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import { parseRequestCode } from "@/lib/request-code";
import { savedMetricNameMatches } from "@/lib/metrics-library";
import { closedWithoutResultCondition, journeyStatusColumn, journeyStatusCondition } from "@/lib/request-journey-sql";
import {
  WORKSPACE_SEARCH_PAGE_SIZE,
  WORKSPACE_SEARCH_QUERY_MAX,
  type WorkspaceSearchPage,
  type WorkspaceSearchResponse,
} from "@/lib/workspace-search";

const pageSchema = z.number().int().min(0)
  .max(Math.floor(Number.MAX_SAFE_INTEGER / WORKSPACE_SEARCH_PAGE_SIZE) - 1).default(0);
// An instant Postgres can bind: a year-0000 or post-9999 value (after its offset) would fail in the
// database as a 500 instead of a 400. Any range inside these bounds is only a filter, so none is too wide.
const CREATED_MIN = Date.UTC(1970, 0, 1);
const CREATED_MAX = Date.UTC(10000, 0, 1);
const createdInstant = z.iso.datetime({ offset: true })
  .refine(value => { const at = Date.parse(value); return at >= CREATED_MIN && at < CREATED_MAX; }, { message: "Choose a date from 1970 on" });
export const workspaceSearchInputSchema = z.object({
  query: z.string().trim().max(WORKSPACE_SEARCH_QUERY_MAX).refine((value) => !value.includes("\0")),
  requestsPage: pageSchema,
  projectsPage: pageSchema,
  // #133: the five journey statuses, filtered and counted with the journey module's conditions.
  statuses: z.array(z.enum(["open", "in_progress", "done", "measuring", "closed"])).max(5).optional(),
  types: z.array(z.union([z.enum(["bug", "improvement", "new_feature", "none"]), z.uuid()])).max(21).optional(),
  sort: z.enum(["relevance", "newest", "title"]).optional(),
  // Plan item 2.8: the viewer's local days, as the instants they start and end (inclusive, exclusive).
  createdSince: createdInstant.optional(),
  createdBefore: createdInstant.optional(),
}).refine(value => !value.createdSince || !value.createdBefore || Date.parse(value.createdSince) < Date.parse(value.createdBefore), { message: "The range must start before it ends" });
export type WorkspaceSearchQuery = z.infer<typeof workspaceSearchInputSchema>;
export type WorkspaceSearchResult = Extract<WorkspaceSearchResponse, { success: true }>;

// strpos treats %, _ and backslashes literally; the query remains a bound
// parameter. Do not turn this into raw SQL or pattern matching.
function containsText(field: SQLWrapper, query: string) {
  return sql`strpos(lower(coalesce(${field}, '')), lower(${query})) > 0`;
}

function resultPage<T>(items: T[], total: number, page: number): WorkspaceSearchPage<T> {
  return { items, total, page, hasMore: (page + 1) * WORKSPACE_SEARCH_PAGE_SIZE < total };
}

// The saved text of a measurement metric that isn't a Metric definition's name: the typed name of an older custom
// metric (as plain text, including quotes and punctuation) and a Pass/fail check's label. Metrics with a definition
// (v5 references and built-in keys) match on the definition's current name instead (#201, savedMetricNameMatches).
function measurementMetricText(metric: SQLWrapper) {
  return sql`case ${metric} ->> 'key'
    when 'custom' then ${metric} ->> 'name'
    when 'check' then case ${metric} ->> 'check'
      when 'keyboard' then 'Keyboard navigation'
      when 'required' then 'Required-field validation'
      when 'recovery' then 'Network error recovery'
      else '' end
    else '' end`;
}

function measurementMatches(auth: MemberAuth, query: string) {
  const primary = sql`(${requests.expectedImpact} -> 'primary')`;
  return sql`(${savedMetricNameMatches({ orgId: auth.orgId }, query, requests.expectedImpact)}
  or (${requests.expectedImpact} ->> 'kind' = 'measurement' and (
    ${containsText(measurementMetricText(primary), query)}
    or exists (select 1 from jsonb_array_elements(case
      when jsonb_typeof(${requests.expectedImpact} -> 'guardrails') = 'array'
      then ${requests.expectedImpact} -> 'guardrails' else '[]'::jsonb end) as measurement_guardrail(value)
      where ${containsText(measurementMetricText(sql`measurement_guardrail.value`), query)})
  )))`;
}

/**
 * The workspace search query for GET /api/search. The caller has
 * already checked membership and validated the input; database errors are
 * thrown and must not be logged, because they may include the bound search text.
 */
export async function loadWorkspaceSearch(auth: MemberAuth, input: WorkspaceSearchQuery): Promise<WorkspaceSearchResult> {
  const { query, requestsPage, projectsPage } = input;
  if (!query) return { success: true, query, requests: resultPage([], 0, 0), projects: resultPage([], 0, 0) };

  const requestNumber = parseRequestCode(query);
  const requestBase = and(
    seeable(auth),
    or(requestNumber === null ? undefined : eq(requests.requestNumber, requestNumber), measurementMatches(auth, query), ...[
      requests.title, requests.description, requests.reframedProblem,
      requests.extractedSolution, requests.affectedPeople, requests.desiredChange,
      requests.observedEvidence, requests.uncertainty, requests.usefulLink,
      sql`${requests.expectedImpact} ->> 'metric'`,
      sql`${requests.expectedImpact} ->> 'unit'`,
      sql`${requests.expectedImpact} ->> 'source'`,
      sql`${requests.expectedImpact} ->> 'result'`,
    ].map((field) => containsText(field, query))),
  );
  const from = input.createdSince ? new Date(input.createdSince) : undefined;
  const until = input.createdBefore ? new Date(input.createdBefore) : undefined;
  const dates = (field: typeof requests.createdAt | typeof projects.createdAt) => and(from ? gte(field, from) : undefined, until ? lt(field, until) : undefined);
  const statusFilter = input.statuses?.length ? or(...input.statuses.map(journeyStatusCondition)) : undefined;
  const typed = input.types?.filter(type => type !== "none") ?? [];
  const typeFilter = input.types?.length ? or(typed.length ? sql`${requests.labelKeys} && ARRAY[${sql.join(typed.map(key => sql`${key}`), sql`, `)}]::text[]` : undefined, input.types.includes("none") ? sql`cardinality(${requests.labelKeys}) = 0` : undefined) : undefined;
  const requestWhere = and(requestBase, dates(requests.createdAt), statusFilter, typeFilter);
  const projectWhere = and(
    accessibleProjectsWhere(auth),
    or(containsText(projects.name, query), containsText(projects.description, query)),
    dates(projects.createdAt),
    statusFilter || typeFilter ? sql`false` : undefined,
  );
  const requestOrder = input.sort === "title" ? [asc(sql`lower(${requests.title})`), asc(requests.id)]
    // Plan item 2.8: an exact saved code ranks first, then an exact title, then title words.
    : input.sort === "relevance" ? [desc(sql`case ${requestNumber === null ? sql`` : sql`when ${requests.requestNumber} = ${requestNumber} then 3 `}when lower(${requests.title}) = lower(${query}) then 2 when ${containsText(requests.title, query)} then 1 else 0 end`), desc(requests.createdAt), desc(requests.id)]
    : [desc(requests.createdAt), desc(requests.id)];
  const projectOrder = input.sort === "newest" ? [desc(projects.createdAt), desc(projects.id)]
    : input.sort === "relevance" ? [desc(sql`case when lower(${projects.name}) = lower(${query}) then 2 when ${containsText(projects.name, query)} then 1 else 0 end`), asc(sql`lower(${projects.name})`), asc(projects.id)]
    : [asc(sql`lower(${projects.name})`), asc(projects.id)];

  // Search the authorized database set, independently of the Requests list's
  // latest-200 boundary. Totals use the identical access and search predicates.
  const [requestRows, requestCounts, projectRows, projectCounts, statusCounts, typeCounts] = await Promise.all([
    db.select({
      id: requests.id,
      requestNumber: requests.requestNumber,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      status: journeyStatusColumn,
      projectId: requests.projectId,
      projectName: projects.name,
      requestType: requests.requestType,
      labelKeys: requests.labelKeys,
      createdAt: requests.createdAt,
      description: requests.description,
      withoutResult: sql<boolean>`${closedWithoutResultCondition}`,
    }).from(requests)
      .leftJoin(projects, and(eq(projects.id, requests.projectId), eq(projects.orgId, auth.orgId)))
      .where(requestWhere).orderBy(...requestOrder)
      .limit(WORKSPACE_SEARCH_PAGE_SIZE).offset(requestsPage * WORKSPACE_SEARCH_PAGE_SIZE),
    db.select({ total: count() }).from(requests).where(requestWhere),
    db.select({ id: projects.id, name: projects.name, description: projects.description, createdAt: projects.createdAt })
      .from(projects).where(projectWhere).orderBy(...projectOrder)
      .limit(WORKSPACE_SEARCH_PAGE_SIZE).offset(projectsPage * WORKSPACE_SEARCH_PAGE_SIZE),
    db.select({ total: count() }).from(projects).where(projectWhere),
    // Disjunctive facet counts: omit only this group's filter, never tenant or guest guards.
    db.select({ value: journeyStatusColumn, total: count() }).from(requests)
      .where(and(requestBase, dates(requests.createdAt), typeFilter)).groupBy(sql`1`),
    db.select({ value: sql<string>`unnest(case when cardinality(${requests.labelKeys}) = 0 then array['none']::text[] else ${requests.labelKeys} end)`, total: count() }).from(requests)
      .where(and(requestBase, dates(requests.createdAt), statusFilter)).groupBy(sql`1`),
  ]);
  return {
    success: true,
    query,
    requests: resultPage(requestRows.map(({ withoutResult, ...row }) => ({ ...row, ...(withoutResult ? { withoutResult } : {}), createdAt: row.createdAt.toISOString() })), requestCounts[0]?.total ?? 0, requestsPage),
    projects: resultPage(projectRows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), projectCounts[0]?.total ?? 0, projectsPage),
    facets: {
      statuses: Object.fromEntries(statusCounts.map(row => [row.value, row.total])),
      types: Object.fromEntries(typeCounts.map(row => [row.value ?? "none", row.total])),
    },
  };
}
