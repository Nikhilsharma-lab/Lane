import "server-only"

import { changeableColumn, seeable } from "@/lib/request-access"
import { and, asc, desc, eq, isNotNull, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db, comments, profiles, projects, requestAgreements, requestAttachments, requests } from "@/db"
import type { MemberAuth } from "@/lib/auth-guard"
import type { Reviewer, ReviewerOutline, ReviewState } from "@/lib/request-reviewer-rules"
import { reviewStatesOf } from "@/lib/request-reviewers"
import { measurementReadiness } from "@/lib/request-measurement"
import { currentMetricNames } from "@/lib/metrics-library"
import { FORMER_MEMBER, journeyActions, journeyStatus } from "@/lib/request-journey"
import { agreedAudience } from "@/lib/request-release-facts"
import type { OutcomeClosure, OutcomeException } from "@/lib/request-outcome"
import { journeyOutline } from "@/components/requests/request-timeline-model"
import { dueSoonOrOverdueCondition, journeyStatusCondition } from "@/lib/request-journey-sql"
import type { FinishedView } from "@/lib/request-workspace"
import { guestPickupRefusal, type GuestSubmissionState } from "@/lib/guest-submission"
import type { RequestAttachment, RequestComment, RequestDetail } from "@/components/requests/detail-view"

// Plan item 1.9: the Requests workspace reads moved here from
// src/app/(app)/requests-workspace.tsx without changing the SQL or the
// workspace and guest guards. Every statement is scoped by auth.orgId, and a
// guest (org:guest) only ever reads Requests they created.

/**
 * Plan item 1.7: the list loads every Open and In progress Request under a hard
 * cap, plus the latest DONE_PAGE_SIZE finished ones: Done, Measuring and Closed
 * (decision 8.18 default; #133). Project, group, sort and the in-list filter then
 * run in the browser with no network request. A finished status view (Done,
 * Measuring, Closed, Due soon or overdue) pages further back through
 * loadOlderFinishedRequests with the journey module's database condition, so it is
 * never limited to the newest page.
 */
export const MAX_REQUESTS_QUERY = 200
export const DONE_PAGE_SIZE = 50
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export { FINISHED_VIEWS, type FinishedView } from "@/lib/request-workspace"

const active = or(journeyStatusCondition("open"), journeyStatusCondition("in_progress"))!
const finished = or(journeyStatusCondition("done"), journeyStatusCondition("measuring"), journeyStatusCondition("closed"))!
function finishedView(view: FinishedView, now: Date): SQL {
  return view === "all" ? finished : view === "due" ? dueSoonOrOverdueCondition(now) : journeyStatusCondition(view)
}
const isActive = (row: Parameters<typeof journeyStatus>[0]) => ["open", "in_progress"].includes(journeyStatus(row).status)

/** One row of the list query, as the select below infers it. */
type ListRowRecord = Awaited<ReturnType<ReturnType<typeof listRows>["execute"]>>[number]
/** A list row carries why it can't be picked up yet and what its reviews leave
 * outstanding, never its measurement plan or its reviewers. */
export type RequestListRow = Omit<ListRowRecord, "expectedImpact" | "reviewers" | "noMeasurableImpactReason"> & { pickupBlockedReason: string | null; reviewState: ReviewState | null }

/** Each saved reviewer's shape, at any status, so the Request page holds their rows while they load (#295): whether
 * they were asked with a note, raised a concern (each a line under the row) and are the reader (who answers on the row). */
const reviewerOutline = (userId: string) => sql<ReviewerOutline[]>`coalesce((select jsonb_agg(jsonb_build_object(
  'note', coalesce(r->>'note', '') <> '', 'concern', coalesce(r->'decision'->>'kind' = 'concern', false), 'mine', r->'nominee'->>'userId' = ${userId}) order by o)
  from ${requestAgreements}, jsonb_array_elements(${requestAgreements.reviewers}) with ordinality as e(r, o)
  where ${requestAgreements.requestId} = ${requests.id} and ${requestAgreements.orgId} = ${requests.orgId}), '[]'::jsonb)`

/** An Open Request's saved reviewers; after pickup nothing is outstanding. */
const openReviewers = sql<Reviewer[] | null>`case when ${requests.status} = 'open' then (select ${requestAgreements.reviewers} from ${requestAgreements} where ${requestAgreements.requestId} = ${requests.id} and ${requestAgreements.orgId} = ${requests.orgId}) end`

/** #212: a Guest submission still waiting to be taken on, one a Member took on, or not a Guest submission (null). */
const guestSubmissionState = sql<GuestSubmissionState | null>`case when ${requests.guestSubmission} then case when ${requests.takenOnBy} is null then 'waiting' else 'taken_on' end end`

/** The pickup readiness every surface shows and the server enforces (request-lifecycle.ts), a Guest submission's first (#212). */
function pickupBlockedReason(request: { status: string; expectedImpact: unknown; requestType: string | null; guestSubmission: GuestSubmissionState | null; noMeasurableImpactReason: string | null }) {
  return request.status === "open" ? guestPickupRefusal(request) ?? measurementReadiness(request.expectedImpact, request.requestType) : null
}

/** The saved reviewers stay on the server; screens get the review state. */
function withoutReviewers<T extends { reviewers: unknown }>({ reviewers, ...rest }: T): Omit<T, "reviewers"> {
  void reviewers
  return rest
}

/**
 * #295: the journey as the saved Request and its reader draw it, for the Request page to show until the journey's
 * reads arrive. The roster isn't read here (it asks Clerk), so the reader counts as active and the Requester's name is
 * the saved creator's; both only size what is held.
 */
function outlineFor(auth: MemberAuth, request: Parameters<typeof journeyActions>[0] & {
  outcomeClosure: OutcomeClosure | null; exceptionClosure: OutcomeException | null
  creatorName: string | null; createdAt: Date; assigneeName: string | null; affectedPeople: string | null; expectedImpact: unknown
}) {
  const requesterName = request.creatorName || FORMER_MEMBER
  return journeyOutline({
    journey: journeyStatus(request), workStatus: request.status, isGuest: auth.role === "guest", readOnly: auth.role === "viewer",
    requestedBy: requesterName, requestedAt: request.createdAt.toISOString(), assigneeName: request.assigneeName, audience: agreedAudience(request),
    hasAgreedResult: Boolean(request.expectedImpact), releaseState: request.releaseState, closure: request.outcomeClosure ?? request.exceptionClosure,
    actions: journeyActions(request, { id: auth.userId, role: auth.role, active: true }, { requesterName, requesterActive: true }, new Date()),
  })
}

/** Rows as the list shows them. Review state counts only reviewers still in
 * the workspace (reviewStatesOf), the same rule as the reviewers panel. */
async function toListRows(auth: MemberAuth, rows: ListRowRecord[]): Promise<RequestListRow[]> {
  const states = await reviewStatesOf(auth.orgId, rows)
  return rows.map(({ expectedImpact, noMeasurableImpactReason, ...row }) => ({ ...withoutReviewers(row), pickupBlockedReason: pickupBlockedReason({ ...row, expectedImpact, noMeasurableImpactReason }), reviewState: states.get(row.id) ?? null }))
}

export type RequestList = {
  rows: RequestListRow[]
  /** More Open and In progress Requests exist than MAX_REQUESTS_QUERY. */
  activeCapped: boolean
  /** Finished Requests (Done, Measuring, Closed) older than the loaded ones exist. */
  hasOlderFinished: boolean
}

export type RequestDetailData = {
  request: RequestDetail
  comments: RequestComment[]
  attachments: RequestAttachment[]
}

/** The list select, scoped to the workspace and (for a guest) to Requests they created. */
function listRows(auth: MemberAuth, statusWhere: SQL, limit: number) {
  const assignee = alias(profiles, "request_list_assignee")
  return db
    .select({
      id: requests.id,
      agreementBlocked: sql<boolean>`public.request_agreement_blocked(${requests.id})`,
      reviewers: openReviewers,
      exceptionClosure: requests.exceptionClosure,
      outcomeClosure: requests.outcomeClosure,
      releaseState: requests.releaseState,
      agreementRevision: requests.agreementRevision,
      requestNumber: requests.requestNumber,
      title: requests.title,
      reframedProblem: requests.reframedProblem,
      status: requests.status,
      createdAt: requests.createdAt,
      creatorName: profiles.fullName,
      canEdit: sql<boolean>`${requests.status} = 'open' and ${changeableColumn(auth)}`,
      assigneeName: assignee.fullName,
      assigneeAvatarUrl: assignee.avatarUrl,
      assignedTo: requests.assignedTo,
      projectId: requests.projectId,
      projectName: projects.name,
      requestType: requests.requestType,
      labelKeys: requests.labelKeys,
      priority: requests.priority,
      expectedImpact: requests.expectedImpact,
      noMeasurableImpactReason: requests.noMeasurableImpactReason,
      guestSubmission: guestSubmissionState,
    })
    .from(requests)
    .leftJoin(profiles, eq(requests.createdBy, profiles.id))
    .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
    .leftJoin(projects, and(eq(requests.projectId, projects.id), eq(projects.orgId, auth.orgId)))
    .where(
      and(seeable(auth), statusWhere)
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
  const rows = await toListRows(auth, await listRows(auth, active, MAX_REQUESTS_QUERY + 1)
    .unionAll(listRows(auth, finished, DONE_PAGE_SIZE + 1)))
  const working = rows.filter(isActive)
  const done = rows.filter(row => !isActive(row))
  return {
    rows: [...working.slice(0, MAX_REQUESTS_QUERY), ...done.slice(0, DONE_PAGE_SIZE)],
    activeCapped: working.length > MAX_REQUESTS_QUERY,
    hasOlderFinished: done.length > DONE_PAGE_SIZE,
  }
}

/**
 * The next page of finished Requests in `view` older than `beforeId`, newest
 * first, in one statement. The view's condition is the journey module's own
 * (request-journey-sql.ts); "due" is read on `now`'s UTC date. The cursor row is read back
 * under the same workspace and guest visibility rules, so its database
 * timestamp is compared at full precision and an invisible id yields no rows.
 */
export async function loadOlderFinishedRequests(auth: MemberAuth, beforeId: string, view: FinishedView = "all", now: Date = new Date()): Promise<{ rows: RequestListRow[]; hasOlderFinished: boolean }> {
  if (!UUID_RE.test(beforeId)) return { rows: [], hasOlderFinished: false }
  const cursor = alias(requests, "older_finished_cursor")
  const rows = await toListRows(auth, await listRows(
    auth,
    and(
      finishedView(view, now),
      sql`(${requests.createdAt}, ${requests.id}) < (${db.select({ createdAt: cursor.createdAt, id: cursor.id }).from(cursor).where(and(
        eq(cursor.id, beforeId),
        seeable(auth, cursor),
      ))})`,
    )!,
    DONE_PAGE_SIZE + 1,
  ))
  return { rows: rows.slice(0, DONE_PAGE_SIZE), hasOlderFinished: rows.length > DONE_PAGE_SIZE }
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
  const taker = alias(profiles, "request_detail_taker")
  const visible = and(eq(requests.id, requestId), seeable(auth))
  const [[request], requestComments, attachments] = await Promise.all([
    db
      .select({
        id: requests.id,
      agreementBlocked: sql<boolean>`public.request_agreement_blocked(${requests.id})`,
      reviewers: openReviewers,
      reviewerOutline: reviewerOutline(auth.userId),
      followUpOf: requests.followUpOf,
      exceptionClosure: requests.exceptionClosure,
      outcomeClosure: requests.outcomeClosure,
      releaseState: requests.releaseState,
      agreementRevision: requests.agreementRevision,
        // Plan item 2.5: the strip's LAN-n, the panel's priority and the
        // Assignee avatar. Same statement and joins, so no extra round trip.
        // The overlay needs priority to see a confirmed priority patch land.
        requestNumber: requests.requestNumber,
        priority: requests.priority,
        title: requests.title,
        description: requests.description,
        affectedPeople: requests.affectedPeople,
        desiredChange: requests.desiredChange,
        observedEvidence: requests.observedEvidence,
        uncertainty: requests.uncertainty,
        usefulLink: requests.usefulLink,
        expectedImpact: requests.expectedImpact,
        measurementDraft: requests.measurementDraft,
        noMeasurableImpactReason: requests.noMeasurableImpactReason,
        designReviews: requests.designReviews,
        reframedProblem: requests.reframedProblem,
        extractedSolution: requests.extractedSolution,
        classification: requests.classification,
        status: requests.status,
        assignedTo: requests.assignedTo,
        createdBy: requests.createdBy,
        createdAt: requests.createdAt,
        creatorName: creator.fullName,
        guestSubmissionState,
        takenOnBy: requests.takenOnBy,
        takenOnByName: taker.fullName,
        assigneeName: selectedAssignee.fullName,
        assigneeAvatarUrl: selectedAssignee.avatarUrl,
        projectId: requests.projectId,
        projectName: projects.name,
        requestType: requests.requestType,
      labelKeys: requests.labelKeys,
      })
      .from(requests)
      .leftJoin(creator, eq(requests.createdBy, creator.id))
      .leftJoin(taker, eq(requests.takenOnBy, taker.id))
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
  const [states, metricNames] = await Promise.all([
    reviewStatesOf(auth.orgId, [request]),
    // The definitions' current names (#198); no statement unless the prediction names one.
    currentMetricNames({ orgId: auth.orgId }, [request.expectedImpact]),
  ])
  const reviewState = states.get(request.id) ?? null
  const { guestSubmissionState: state, takenOnByName, ...saved } = withoutReviewers(request)
  // #212: who filed it and who took it on, for the Request's Guest submission notice.
  const guestSubmission = state ? { state, submitterName: request.creatorName, takenOnBy: request.takenOnBy, takenOnByName } : null
  return { request: { ...saved, guestSubmission, reviewState, metricNames, journeyOutline: outlineFor(auth, request), pickupBlockedReason: pickupBlockedReason({ ...request, guestSubmission: state }) }, comments: requestComments, attachments }
}
