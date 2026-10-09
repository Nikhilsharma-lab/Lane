import { redirect } from "next/navigation"
import Link from "next/link"
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db, comments, profiles, projects, requestAttachments, requests } from "@/db"
import { getWorkspace } from "@/lib/ensure-workspace"
import { requestDetailHref, requestListHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { accessibleProjectsWhere } from "@/lib/project-access"
import { RequestDetailView, RequestListPane, RequestUnavailable, type RequestDetail, type RequestComment, type RequestAttachment } from "@/components/requests/detail-view"
import { Alert } from "@/components/arc/alert/alert"
import { CommentForm } from "./requests/[id]/comment-form"
import { AttachmentDownload } from "./requests/[id]/attachment-download"
import { LifecycleButtons } from "./requests/[id]/lifecycle-buttons"
import { RequestWorkspaceKeyboard } from "./request-workspace-keyboard"
import { RequestsWelcome } from "./requests-welcome"
import { ProjectUnavailable, RequestsOverview } from "./requests-overview"

const MAX_REQUESTS_QUERY = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function RequestDetailPane({ orgId, ...props }: {
  request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[];
  filter: RequestStatusFilter; projectFilter: RequestProjectFilter; orgId: string; isGuest: boolean;
}) {
  return <RequestDetailView {...props}
    lifecycleActions={<LifecycleButtons requestId={props.request.id} status={props.request.status} context={{ orgId }} filter={props.filter} projectFilter={props.projectFilter} />}
    mobileLifecycleActions={<LifecycleButtons requestId={props.request.id} status={props.request.status} context={{ orgId }} filter={props.filter} projectFilter={props.projectFilter} fullWidth />}
    commentForm={<CommentForm requestId={props.request.id} context={{ orgId }} />}
    attachmentAction={attachment => <AttachmentDownload attachmentId={attachment.id} context={{ orgId }} />}
  />
}

export async function RequestsWorkspace({
  selectedRequestId,
  filter,
  projectFilter = "all",
}: {
  selectedRequestId?: string
  filter: RequestStatusFilter
  projectFilter?: RequestProjectFilter
}) {
  const workspace = await getWorkspace()
  if (!workspace) redirect("/login")
  if (workspace.needsOnboarding) redirect("/onboarding")

  const isGuest = workspace.role === "guest"
  const assignee = alias(profiles, "request_list_assignee")

  let projectName: string | undefined
  let projectUnavailable = false
  if (projectFilter !== "all" && projectFilter !== "none") {
    if (!UUID_RE.test(projectFilter)) projectUnavailable = true
    else {
      const [project] = await db.select({ id: projects.id, name: projects.name }).from(projects)
        .where(and(accessibleProjectsWhere(workspace), eq(projects.id, projectFilter)))
        .limit(1)
      projectUnavailable = !project
      projectName = project?.name
    }
  }
  if (projectUnavailable && !selectedRequestId) return <ProjectUnavailable />

  // A stale list context never expands to all Requests. Direct detail access
  // is checked independently below against the workspace and session user.
  const allRequests = projectUnavailable ? [] : await db
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
    })
    .from(requests)
    .leftJoin(profiles, eq(requests.createdBy, profiles.id))
    .leftJoin(assignee, eq(requests.assignedTo, assignee.id))
    .leftJoin(projects, and(eq(requests.projectId, projects.id), eq(projects.orgId, workspace.orgId)))
    .where(
      and(
        eq(requests.orgId, workspace.orgId),
        isGuest ? eq(requests.createdBy, workspace.userId) : undefined,
        filter !== "all" ? eq(requests.status, filter) : undefined,
        projectFilter === "none" ? isNull(requests.projectId) : projectFilter !== "all" ? eq(requests.projectId, projectFilter) : undefined,
      )
    )
    .orderBy(desc(requests.createdAt))
    .limit(MAX_REQUESTS_QUERY)

  let selectedRequest: RequestDetail | undefined
  let requestComments: RequestComment[] = []
  let selectedAttachments: RequestAttachment[] = []

  if (selectedRequestId && UUID_RE.test(selectedRequestId)) {
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
      .leftJoin(projects, and(eq(requests.projectId, projects.id), eq(projects.orgId, workspace.orgId)))
      .where(
        isGuest
          ? and(
              eq(requests.id, selectedRequestId),
              eq(requests.orgId, workspace.orgId),
              eq(requests.createdBy, workspace.userId)
            )
          : and(
              eq(requests.id, selectedRequestId),
              eq(requests.orgId, workspace.orgId)
            )
      )

    selectedRequest = request

    if (selectedRequest) {
      ;[requestComments, selectedAttachments] = await Promise.all([
        db
          .select({
            id: comments.id,
            body: comments.body,
            createdAt: comments.createdAt,
            authorName: profiles.fullName,
          })
          .from(comments)
          .leftJoin(profiles, eq(comments.authorId, profiles.id))
          .where(eq(comments.requestId, selectedRequest.id))
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
              eq(requestAttachments.requestId, selectedRequest.id),
              eq(requestAttachments.orgId, workspace.orgId),
              isNotNull(requestAttachments.uploadedAt)
            )
          )
          .orderBy(asc(requestAttachments.createdAt)),
      ])
    }
  }

  const returnHref = requestListHref(filter, projectFilter)

  if (allRequests.length === 0 && !selectedRequestId && filter === "all" && projectFilter === "all") {
    return <RequestsWelcome role={workspace.role} />
  }

  if (!selectedRequestId) {
    return <RequestsOverview requests={allRequests.map(request => ({ ...request, createdAt: request.createdAt.toISOString() }))} filter={filter} projectFilter={projectFilter} projectName={projectName} isGuest={isGuest} context={{ orgId: workspace.orgId }} />
  }

  const detail = selectedRequest ? (
    <RequestDetailPane
      request={selectedRequest}
      comments={requestComments}
      attachments={selectedAttachments}
      filter={filter}
      projectFilter={projectFilter}
      orgId={workspace.orgId}
      isGuest={isGuest}
    />
  ) : <RequestUnavailable returnHref={returnHref} />

  if (projectUnavailable) {
    return <div data-slot="requests-workspace" className="flex min-h-0 flex-1 flex-col bg-background sm:h-full sm:overflow-hidden">
      <RequestWorkspaceKeyboard selectedRequestId={selectedRequestId} returnHref={returnHref} />
      <div className="p-4"><Alert tone="warning" title="Project unavailable">
        The Project filter in this link is unavailable. <Link className="underline underline-offset-4" href={requestDetailHref(selectedRequestId, filter)}>Clear Project filter</Link>
      </Alert></div>
      {detail}
    </div>
  }

  return (
    <div
      data-slot="requests-workspace"
      className="flex min-h-0 flex-1 bg-background sm:h-full sm:overflow-hidden"
    >
      <RequestWorkspaceKeyboard
        selectedRequestId={selectedRequestId}
        returnHref={returnHref}
      />
      <RequestListPane
        requests={allRequests}
        selectedRequestId={selectedRequestId}
        filter={filter}
        projectFilter={projectFilter}
        projectName={projectName}
        isGuest={isGuest}
      />
      {detail}
    </div>
  )
}
