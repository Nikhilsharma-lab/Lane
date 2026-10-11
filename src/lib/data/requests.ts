import "server-only"

import { and, asc, desc, eq, isNotNull, ne, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db, comments, profiles, projects, requestAttachments, requests } from "@/db"
import type { MemberAuth } from "@/lib/auth-guard"
import { accessibleProjectsWhere } from "@/lib/project-access"
import type { RequestProjectFilter } from "@/lib/request-workspace"
import type { RequestAttachment, RequestComment, RequestDetail } from "@/components/requests/detail-view"

// Plan item 1.9: the Requests workspace reads moved here from
// src/app/(app)/requests-workspace.tsx without changing the SQL or the
// workspace and guest guards. Every statement is scoped by auth.orgId, and a
// guest (org:guest) only ever reads Requests they created.

/**
 * Plan item 1.7: the list loads every Open and In Progress Request under a hard
 * cap, plus the latest DONE_PAGE_SIZE Done Requests (decision 8.18 default).
 * Status, Project, group, sort and the in-list filter then run in the browser
 * with no network request. "Show older Done" pages further back through
 * loadOlderDoneRequests.
 */
export const MAX_REQUESTS_QUERY = 200
export const DONE_PAGE_SIZE = 50
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RequestProjectScope = { unavailable: boolean; name?: string }

/** One row of the list query, as the select below infers it. */
export type RequestListRow = Awaited<ReturnType<ReturnType<typeof listRows>["execute"]>>[number]

export type RequestList = {
  rows: RequestListRow[]
  /** More Open and In Progress Requests exist than MAX_REQUESTS_QUERY. */
  activeCapped: boolean
  /** Done Requests older than the loaded ones exist. */
  hasOlderDone: boolean
}

export type RequestDetailData = {
  request: RequestDetail
  comments: RequestComment[]
  attachments: RequestAttachment[]
}

/**
 * Resolves the Project filter of a list URL. "all" and "none" need no lookup;
 * a malformed id is unavailable without a query; a well-formed id must name a
 * Project the member may see (accessibleProjectsWhere carries the guest rule).
 */
export async function loadProjectScope(auth: MemberAuth, projectFilter: RequestProjectFilter): Promise<RequestProjectScope> {
  if (projectFilter === "all" || projectFilter === "none") return { unavailable: false }
  if (!UUID_RE.test(projectFilter)) return { unavailable: true }
  const [project] = await db.select({ id: projects.id, name: projects.name }).from(projects)
    .where(and(accessibleProjectsWhere(auth), eq(projects.id, projectFilter)))
    .limit(1)
  return { unavailable: !project, name: project?.name }
}

/** The list select, scoped to the workspace and (for a guest) to Requests they created. */
function listRows(auth: MemberAuth, statusWhere: SQL, limit: number) {
  const assignee = alias(profiles, "request_list_assignee")
  return db
    .select({
      id: requests.id,
      requestNumber: requests.requestNumber,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      status: requests.status,
      createdAt: requests.createdAt,
      creatorName: profiles.fullName,
      assigneeName: assignee.fullName,
      assigneeAvatarUrl: assignee.avatarUrl,
      assignedTo: requests.assignedTo,
      projectId: requests.projectId,
      projectName: projects.name,
      requestType: requests.requestType,
      priority: requests.priority,
    })
    .from(requests)
    .leftJoin(profiles, eq(requests.createdBy, profiles.id))
    .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
    .leftJoin(projects, and(eq(requests.projectId, projects.id), eq(projects.orgId, auth.orgId)))
    .where(
      and(
        eq(requests.orgId, auth.orgId),
        auth.role === "guest" ? eq(requests.createdBy, auth.userId) : undefined,
        statusWhere,
      )
    )
    .orderBy(desc(requests.createdAt), desc(requests.id))
    .limit(limit)
}

/**
 * The list a member sees: one statement (UNION ALL of two capped selects).
 * Each half reads one row past its cap, so the caller learns whether the cap
 * note or "Show older Done" applies without a count query.
 */
export async function loadRequestList(auth: MemberAuth): Promise<RequestList> {
  const rows = await listRows(auth, ne(requests.status, "done"), MAX_REQUESTS_QUERY + 1)
    .unionAll(listRows(auth, eq(requests.status, "done"), DONE_PAGE_SIZE + 1))
  const active = rows.filter(row => row.status !== "done")
  const done = rows.filter(row => row.status === "done")
  return {
    rows: [...active.slice(0, MAX_REQUESTS_QUERY), ...done.slice(0, DONE_PAGE_SIZE)],
    activeCapped: active.length > MAX_REQUESTS_QUERY,
    hasOlderDone: done.length > DONE_PAGE_SIZE,
  }
}

/**
 * The next page of Done Requests older than `beforeId` (the oldest Done row the
 * client shows), newest first, in one statement. The cursor row is read back
 * inside the same workspace, so its database timestamp is compared at full
 * precision and an id from another workspace yields no rows.
 */
export async function loadOlderDoneRequests(auth: MemberAuth, beforeId: string): Promise<{ rows: RequestListRow[]; hasOlderDone: boolean }> {
  if (!UUID_RE.test(beforeId)) return { rows: [], hasOlderDone: false }
  const cursor = alias(requests, "older_done_cursor")
  const rows = await listRows(
    auth,
    and(
      eq(requests.status, "done"),
      sql`(${requests.createdAt}, ${requests.id}) < (${db.select({ createdAt: cursor.createdAt, id: cursor.id }).from(cursor).where(and(eq(cursor.id, beforeId), eq(cursor.orgId, auth.orgId)))})`,
    )!,
    DONE_PAGE_SIZE + 1,
  )
  return { rows: rows.slice(0, DONE_PAGE_SIZE), hasOlderDone: rows.length > DONE_PAGE_SIZE }
}

/**
 * One Request with its comments and uploaded attachments (plan item 1.10).
 * The three statements run together in one round trip. Comments and
 * attachments join back to `requests` with the same workspace and (for a
 * guest) creator check as the Request itself, so nothing is read for a
 * Request the member may not see. Returns null for a malformed id or a
 * Request the member may not see.
 */
export async function loadRequestDetail(auth: MemberAuth, requestId: string): Promise<RequestDetailData | null> {
  if (!UUID_RE.test(requestId)) return null
  const creator = alias(profiles, "request_detail_creator")
  const selectedAssignee = alias(profiles, "request_detail_assignee")
  const visible = and(
    eq(requests.id, requestId),
    eq(requests.orgId, auth.orgId),
    auth.role === "guest" ? eq(requests.createdBy, auth.userId) : undefined,
  )
  const [[request], requestComments, attachments] = await Promise.all([
    db
      .select({
        id: requests.id,
        title: requests.title,
        description: requests.description,
        affectedPeople: requests.affectedPeople,
        desiredChange: requests.desiredChange,
        observedEvidence: requests.observedEvidence,
        uncertainty: requests.uncertainty,
        usefulLink: requests.usefulLink,
        expectedImpact: requests.expectedImpact,
        designReviews: requests.designReviews,
        designReviewVersion: requests.designReviewVersion,
        reframedProblem: requests.reframedProblem,
        extractedSolution: requests.extractedSolution,
        classification: requests.classification,
        status: requests.status,
        assignedTo: requests.assignedTo,
        createdBy: requests.createdBy,
        createdAt: requests.createdAt,
        creatorName: creator.fullName,
        assigneeName: selectedAssignee.fullName,
        projectId: requests.projectId,
        projectName: projects.name,
        requestType: requests.requestType,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(
        selectedAssignee,
        eq(requests.assignedTo, selectedAssignee.id)
      )
      .leftJoin(projects, and(eq(requests.projectId, projects.id), eq(projects.orgId, auth.orgId)))
      .where(visible),
    db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        authorName: profiles.fullName,
      })
      .from(comments)
      .innerJoin(requests, eq(comments.requestId, requests.id))
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .where(and(eq(comments.requestId, requestId), visible))
      .orderBy(asc(comments.createdAt)),
    db
      .select({
        id: requestAttachments.id,
        fileName: requestAttachments.fileName,
        mimeType: requestAttachments.mimeType,
        sizeBytes: requestAttachments.sizeBytes,
        uploadedAt: requestAttachments.uploadedAt,
      })
      .from(requestAttachments)
      .innerJoin(requests, eq(requestAttachments.requestId, requests.id))
      .where(
        and(
          eq(requestAttachments.requestId, requestId),
          eq(requestAttachments.orgId, auth.orgId),
          isNotNull(requestAttachments.uploadedAt),
          visible,
        )
      )
      .orderBy(asc(requestAttachments.createdAt)),
  ])

  if (!request) return null
  return { request, comments: requestComments, attachments }
}
