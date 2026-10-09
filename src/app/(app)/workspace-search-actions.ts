"use server";

import { and, asc, count, desc, eq, or, sql, type SQLWrapper } from "drizzle-orm";
import { z } from "zod";
import { db, projects, requests } from "@/db";
import { requireActiveMember } from "@/lib/auth-guard";
import { accessibleProjectsWhere } from "@/lib/project-access";
import { parseRequestCode } from "@/lib/request-code";
import {
  WORKSPACE_SEARCH_PAGE_SIZE,
  WORKSPACE_SEARCH_QUERY_MAX,
  type WorkspaceSearchInput,
  type WorkspaceSearchPage,
  type WorkspaceSearchResponse,
} from "@/lib/workspace-search";

const pageSchema = z.number().int().min(0)
  .max(Math.floor(Number.MAX_SAFE_INTEGER / WORKSPACE_SEARCH_PAGE_SIZE) - 1).default(0);
const searchInputSchema = z.object({
  query: z.string().trim().max(WORKSPACE_SEARCH_QUERY_MAX).refine((value) => !value.includes("\0")),
  requestsPage: pageSchema,
  projectsPage: pageSchema,
});

// strpos treats %, _ and backslashes literally; the query remains a bound
// parameter. Do not turn this into raw SQL or pattern matching.
function containsText(field: SQLWrapper, query: string) {
  return sql`strpos(lower(coalesce(${field}, '')), lower(${query})) > 0`;
}

function resultPage<T>(items: T[], total: number, page: number): WorkspaceSearchPage<T> {
  return { items, total, page, hasMore: (page + 1) * WORKSPACE_SEARCH_PAGE_SIZE < total };
}

export async function searchWorkspace(
  input: WorkspaceSearchInput,
  context: { orgId: string },
): Promise<WorkspaceSearchResponse> {
  const auth = typeof context?.orgId === "string" ? await requireActiveMember(context.orgId) : null;
  if (!auth) return { success: false, error: { code: "session_expired", message: "Your workspace session changed. Refresh the page to search again." } };

  const parsed = searchInputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: { code: "validation", message: "Use a search of 200 characters or fewer and a valid results page." } };
  const { query, requestsPage, projectsPage } = parsed.data;
  if (!query) return { success: true, query, requests: resultPage([], 0, 0), projects: resultPage([], 0, 0) };

  const requestNumber = parseRequestCode(query);
  const requestWhere = and(
    eq(requests.orgId, auth.orgId),
    auth.role === "guest" ? eq(requests.createdBy, auth.userId) : undefined,
    or(requestNumber === null ? undefined : eq(requests.requestNumber, requestNumber), ...[
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

  try {
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
  } catch {
    // Database errors may include bound search text; do not log them or return
    // partial results as if both categories loaded successfully.
    return { success: false, error: { code: "search_failed", message: "Search could not be completed. Try again." } };
  }
}
