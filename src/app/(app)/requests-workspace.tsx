import { redirect } from "next/navigation"
import Link from "next/link"
import { getMember, getWorkspace } from "@/lib/ensure-workspace"
import { loadProjectScope, loadRequestDetail, loadRequestList } from "@/lib/data/requests"
import { requestDetailHref, requestListHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { RequestDetailView, RequestListPane, RequestUnavailable, type RequestDetail, type RequestComment, type RequestAttachment } from "@/components/requests/detail-view"
import { Alert } from "@/components/arc/alert/alert"
import { CommentForm } from "./requests/[id]/comment-form"
import { AttachmentDownload } from "./requests/[id]/attachment-download"
import { LifecycleButtons } from "./requests/[id]/lifecycle-buttons"
import { DesignReview } from "./requests/[id]/design-review"
import { RequestWorkspaceKeyboard } from "./request-workspace-keyboard"
import { RequestsWelcome } from "./requests-welcome"
import { ProjectUnavailable, RequestsOverview } from "./requests-overview"

function RequestDetailPane({ orgId, currentUserId, isAdmin, ...props }: {
  request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[];
  filter: RequestStatusFilter; projectFilter: RequestProjectFilter; orgId: string; isGuest: boolean; currentUserId: string; isAdmin: boolean;
}) {
  return <RequestDetailView {...props}
    lifecycleActions={<LifecycleButtons requestId={props.request.id} status={props.request.status} context={{ orgId }} filter={props.filter} projectFilter={props.projectFilter} />}
    mobileLifecycleActions={<LifecycleButtons requestId={props.request.id} status={props.request.status} context={{ orgId }} filter={props.filter} projectFilter={props.projectFilter} fullWidth />}
    commentForm={<CommentForm requestId={props.request.id} context={{ orgId }} />}
    attachmentAction={attachment => <AttachmentDownload attachmentId={attachment.id} context={{ orgId }} />}
    designReview={<DesignReview requestId={props.request.id} initialState={{ version: props.request.designReviewVersion ?? 0, reviews: props.request.designReviews ?? [] }} currentUserId={currentUserId} canRequest={!props.isGuest} canManage={!props.isGuest && (isAdmin || props.request.createdBy === currentUserId)} context={{ orgId }} />}
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
  const member = await getMember()
  if (!member) redirect("/login")

  // Plan item 1.8: the list and detail reads start from Clerk claims and run
  // in parallel with the profile/workspace join, so the page waits for one
  // round trip. A stale list context never expands to all Requests, and
  // direct detail access is checked independently against the workspace and
  // the session user (src/lib/data/requests.ts keeps both guards).
  const scope = loadProjectScope(member, projectFilter)
  const [workspace, { unavailable: projectUnavailable, name: projectName }, allRequests, selected] = await Promise.all([
    getWorkspace(),
    scope,
    // "all" and "none" need no Project lookup, so the list starts at once. A
    // Project id must first resolve to a Project the member may see.
    projectFilter === "all" || projectFilter === "none"
      ? loadRequestList(member, { filter, projectFilter })
      : scope.then(result => result.unavailable ? [] : loadRequestList(member, { filter, projectFilter })),
    selectedRequestId ? loadRequestDetail(member, selectedRequestId) : null,
  ])
  if (!workspace) redirect("/login")
  if (workspace.needsOnboarding) redirect("/onboarding")

  const isGuest = member.role === "guest"
  if (projectUnavailable && !selectedRequestId) return <ProjectUnavailable />

  const selectedRequest: RequestDetail | undefined = selected?.request
  const requestComments: RequestComment[] = selected?.comments ?? []
  const selectedAttachments: RequestAttachment[] = selected?.attachments ?? []

  const returnHref = requestListHref(filter, projectFilter)

  if (allRequests.length === 0 && !selectedRequestId && filter === "all" && projectFilter === "all") {
    return <RequestsWelcome role={member.role} />
  }

  if (!selectedRequestId) {
    return <RequestsOverview requests={allRequests.map(request => ({ ...request, createdAt: request.createdAt.toISOString() }))} filter={filter} projectFilter={projectFilter} projectName={projectName} isGuest={isGuest} context={{ orgId: member.orgId }} />
  }

  const detail = selectedRequest ? (
    <RequestDetailPane
      request={selectedRequest}
      comments={requestComments}
      attachments={selectedAttachments}
      filter={filter}
      projectFilter={projectFilter}
      orgId={member.orgId}
      currentUserId={member.userId}
      isAdmin={member.role === "admin"}
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
