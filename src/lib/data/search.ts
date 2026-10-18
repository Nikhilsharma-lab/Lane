import "server-only";

import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";

import { db, projects, requests } from "@/db";
import type { MemberAuth } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import { parseRequestCode } from "@/lib/request-code";
import { MEASUREMENT_METRIC_OPTIONS, measurementMetricLabel } from "@/lib/request-measurement";
import {
  WORKSPACE_SEARCH_PAGE_SIZE,
  WORKSPACE_SEARCH_QUERY_MAX,
  type WorkspaceSearchPage,
  type WorkspaceSearchResponse,
} from "@/lib/workspace-search";

const pageSchema = z.number().int().min(0)
  .max(Math.floor(Number.MAX_SAFE_INTEGER / WORKSPACE_SEARCH_PAGE_SIZE) - 1).default(0);
export const workspaceSearchInputSchema = z.object({
  query: z.string().trim().max(WORKSPACE_SEARCH_QUERY_MAX).refine((value) => !value.includes("\0")),
  requestsPage: pageSchema,
  projectsPage: pageSchema,
  statuses: z.array(z.enum(["open", "in_progress", "done"])).max(3).optional(),
  types: z.array(z.enum(["bug", "improvement", "new_feature", "none"])).max(4).optional(),
  sort: z.enum(["relevance", "newest", "title"]).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
}).refine(value => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo, { message: "Start date must not follow end date" });
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

// Persisted keys use the versioned metric catalog's display names. Custom
// names remain searchable as plain text, including quotes and punctuation.
function measurementMetricText(metric: SQLWrapper) {
  const presets = MEASUREMENT_METRIC_OPTIONS.filter(({ value }) => value !== "custom" && value !== "check");
  return sql`case ${metric} ->> 'key'
    when 'custom' then ${metric} ->> 'name'
    when 'check' then case ${metric} ->> 'check'
      when 'keyboard' then 'Keyboard navigation'
      when 'required' then 'Required-field validation'
      when 'recovery' then 'Network error recovery'
      else '' end
    ${sql.join(presets.map(({ value, label }) => sql`when ${value} then case
      when ${metric} ->> 'unit' = 'count' then ${measurementMetricLabel({ key: value, name: "", unit: "count" })}
      else ${label} end`), sql` `)}
    else '' end`;
}

function measurementMatches(query: string) {
  const primary = sql`(${requests.expectedImpact} -> 'primary')`;
  return sql`(${requests.expectedImpact} ->> 'kind' = 'measurement' and (
    ${containsText(measurementMetricText(primary), query)}
    or exists (select 1 from jsonb_array_elements(case
      when jsonb_typeof(${requests.expectedImpact} -> 'guardrails') = 'array'
      then ${requests.expectedImpact} -> 'guardrails' else '[]'::jsonb end) as measurement_guardrail(value)
      where ${containsText(measurementMetricText(sql`measurement_guardrail.value`), query)})
  ))`;
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
    eq(requests.orgId, auth.orgId),
    auth.role === "guest" ? eq(requests.createdBy, auth.userId) : undefined,
    or(requestNumber === null ? undefined : eq(requests.requestNumber, requestNumber), measurementMatches(query), ...[
      requests.title, requests.description, requests.reframedProblem,
      requests.extractedSolution, requests.affectedPeople, requests.desiredChange,
      requests.observedEvidence, requests.uncertainty, requests.usefulLink,
      sql`${requests.expectedImpact} ->> 'metric'`,
      sql`${requests.expectedImpact} ->> 'unit'`,
      sql`${requests.expectedImpact} ->> 'source'`,
      sql`${requests.expectedImpact} ->> 'result'`,
    ].map((field) => containsText(field, query))),
  );
  const from = input.createdFrom ? new Date(`${input.createdFrom}T00:00:00.000Z`) : undefined;
  const until = input.createdTo ? new Date(new Date(`${input.createdTo}T00:00:00.000Z`).getTime() + 86400000) : undefined;
  const dates = (field: typeof requests.createdAt | typeof projects.createdAt) => and(from ? gte(field, from) : undefined, until ? lt(field, until) : undefined);
  const statusFilter = input.statuses?.length ? inArray(requests.status, input.statuses) : undefined;
  const typed = input.types?.filter(type => type !== "none") ?? [];
  const typeFilter = input.types?.length ? or(typed.length ? inArray(requests.requestType, typed) : undefined, input.types.includes("none") ? isNull(requests.requestType) : undefined) : undefined;
  const requestWhere = and(requestBase, dates(requests.createdAt), statusFilter, typeFilter);
  const projectWhere = and(
    accessibleProjectsWhere(auth),
    or(containsText(projects.name, query), containsText(projects.description, query)),
    dates(projects.createdAt),
    statusFilter || typeFilter ? sql`false` : undefined,
  );
  const requestOrder = input.sort === "title" ? [asc(sql`lower(${requests.title})`), asc(requests.id)]
    : input.sort === "relevance" ? [desc(sql`case when lower(${requests.title}) = lower(${query}) then 2 when ${containsText(requests.title, query)} then 1 else 0 end`), desc(requests.createdAt), desc(requests.id)]
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
      status: requests.status,
      projectId: requests.projectId,
      projectName: projects.name,
      requestType: requests.requestType,
      createdAt: requests.createdAt,
      description: requests.description,
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
    db.select({ value: requests.status, total: count() }).from(requests)
      .where(and(requestBase, dates(requests.createdAt), typeFilter)).groupBy(requests.status),
    db.select({ value: requests.requestType, total: count() }).from(requests)
      .where(and(requestBase, dates(requests.createdAt), statusFilter)).groupBy(requests.requestType),
  ]);
  return {
    success: true,
    query,
    requests: resultPage(requestRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), requestCounts[0]?.total ?? 0, requestsPage),
    projects: resultPage(projectRows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), projectCounts[0]?.total ?? 0, projectsPage),
    facets: {
      statuses: Object.fromEntries(statusCounts.map(row => [row.value, row.total])),
      types: Object.fromEntries(typeCounts.map(row => [row.value ?? "none", row.total])),
    },
  };
}
