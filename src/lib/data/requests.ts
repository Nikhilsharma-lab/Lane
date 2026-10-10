import "server-only"

import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db, comments, profiles, projects, requestAttachments, requests } from "@/db"
import type { MemberAuth } from "@/lib/auth-guard"
import { accessibleProjectsWhere } from "@/lib/project-access"
import type { RequestProjectFilter, RequestStatusFilter } from "@/lib/request-workspace"
import type { RequestAttachment, RequestComment, RequestDetail } from "@/components/requests/detail-view"

// Plan item 1.9: the Requests workspace reads moved here from
// src/app/(app)/requests-workspace.tsx without changing the SQL or the
// workspace and guest guards. Every statement is scoped by auth.orgId, and a
// guest (org:guest) only ever reads Requests they created.

export const MAX_REQUESTS_QUERY = 200
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RequestProjectScope = { unavailable: boolean; name?: string }

/** One row of the list query, as the select below infers it. */
export type RequestListRow = Awaited<ReturnType<typeof loadRequestList>>[number]

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

/** The list a member sees for a status and Project filter: one statement, capped at MAX_REQUESTS_QUERY rows. */
export async function loadRequestList(auth: MemberAuth, { filter, projectFilter }: { filter: RequestStatusFilter; projectFilter: RequestProjectFilter }) {
  const isGuest = auth.role === "guest"
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
        isGuest ? eq(requests.createdBy, auth.userId) : undefined,
        filter !== "all" ? eq(requests.status, filter) : undefined,
        projectFilter === "none" ? isNull(requests.projectId) : projectFilter !== "all" ? eq(requests.projectId, projectFilter) : undefined,
      )
    )
    .orderBy(desc(requests.createdAt))
    .limit(MAX_REQUESTS_QUERY)
}

/**
 * One Request with its comments and uploaded attachments. The Request is read
 * first, inside the workspace and (for a guest) the creator check; comments and
 * attachments then load in parallel, so this is at most three statements over
 * two round trips. Returns null for a malformed id or a Request the member may
 * not see.
 */
export async function loadRequestDetail(auth: MemberAuth, requestId: string): Promise<RequestDetailData | null> {
  if (!UUID_RE.test(requestId)) return null
  const isGuest = auth.role === "guest"
  const creator = alias(profiles, "request_detail_creator")
  const selectedAssignee = alias(profiles, "request_detail_assignee")
  const [request] = await db
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
    .where(
      isGuest
        ? and(
            eq(requests.id, requestId),
            eq(requests.orgId, auth.orgId),
            eq(requests.createdBy, auth.userId)
          )
        : and(
            eq(requests.id, requestId),
            eq(requests.orgId, auth.orgId)
          )
    )

  if (!request) return null

  const [requestComments, attachments] = await Promise.all([
    db
      .select({
        id: comments.id,
        body: comments.body,
        createdAt: comments.createdAt,
        authorName: profiles.fullName,
      })
      .from(comments)
      .leftJoin(profiles, eq(comments.authorId, profiles.id))
      .where(eq(comments.requestId, request.id))
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
      .where(
        and(
          eq(requestAttachments.requestId, request.id),
          eq(requestAttachments.orgId, auth.orgId),
          isNotNull(requestAttachments.uploadedAt)
        )
      )
      .orderBy(asc(requestAttachments.createdAt)),
  ])

  return { request, comments: requestComments, attachments }
}
