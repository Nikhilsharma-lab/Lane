import "server-only";

import { and, asc, count, desc, eq, or, sql, type SQLWrapper } from "drizzle-orm";
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
});
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
  const requestWhere = and(
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
  const projectWhere = and(
    accessibleProjectsWhere(auth),
    or(containsText(projects.name, query), containsText(projects.description, query)),
  );

  // Search the authorized database set, independently of the Requests list's
  // latest-200 boundary. Totals use the identical access and search predicates.
  const [requestRows, requestCounts, projectRows, projectCounts] = await Promise.all([
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
    }).from(requests)
      .leftJoin(projects, and(eq(projects.id, requests.projectId), eq(projects.orgId, auth.orgId)))
      .where(requestWhere).orderBy(desc(requests.createdAt), desc(requests.id))
      .limit(WORKSPACE_SEARCH_PAGE_SIZE).offset(requestsPage * WORKSPACE_SEARCH_PAGE_SIZE),
    db.select({ total: count() }).from(requests).where(requestWhere),
    db.select({ id: projects.id, name: projects.name, description: projects.description })
      .from(projects).where(projectWhere).orderBy(asc(sql`lower(${projects.name})`), asc(projects.id))
      .limit(WORKSPACE_SEARCH_PAGE_SIZE).offset(projectsPage * WORKSPACE_SEARCH_PAGE_SIZE),
    db.select({ total: count() }).from(projects).where(projectWhere),
  ]);
  return {
    success: true,
    query,
    requests: resultPage(requestRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })), requestCounts[0]?.total ?? 0, requestsPage),
    projects: resultPage(projectRows, projectCounts[0]?.total ?? 0, projectsPage),
  };
}
