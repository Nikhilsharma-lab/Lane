import { redirect } from "next/navigation"
import { getMember, getWorkspace } from "@/lib/ensure-workspace"
import { loadRequestDetail, loadRequestList } from "@/lib/data/requests"
import { requestListHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { RequestDetailView, RequestUnavailable, type RequestDetail, type RequestComment, type RequestAttachment } from "@/components/requests/detail-view"
import { CommentForm } from "./requests/[id]/comment-form"
import { AttachmentDownload } from "./requests/[id]/attachment-download"
import { LifecycleButtons } from "./requests/[id]/lifecycle-buttons"
import { DesignReview } from "./requests/[id]/design-review-lazy"
import { RequestWorkspaceKeyboard } from "./request-workspace-keyboard"
import { RequestsWelcome } from "./requests-welcome"
import { RequestsOverview } from "./requests-overview"

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

export async function RequestsWorkspace({ selectedRequestId }: { selectedRequestId?: string }) {
  const member = await getMember()
  if (!member) redirect("/login")

  // Plan item 1.8: the list and detail reads start from Clerk claims and run
  // in parallel with the profile/workspace join, so the page waits for one
  // round trip. Plan items 1.7 and 1.10: the server no longer reads the status
  // view or the Project filter. The list loads every active Request (capped)
  // plus the latest Done, and the browser filters it; a Request page loads
  // only that Request, its comments and its files. Both loaders keep the
  // workspace and guest guards (src/lib/data/requests.ts).
  const [workspace, list, selected] = await Promise.all([
    getWorkspace(),
    selectedRequestId ? null : loadRequestList(member),
    selectedRequestId ? loadRequestDetail(member, selectedRequestId) : null,
  ])
  if (!workspace) redirect("/login")
  if (workspace.needsOnboarding) redirect("/onboarding")

  const isGuest = member.role === "guest"

  if (list) {
    // The welcome is about the workspace, never about the current filter.
    if (list.rows.length === 0) return <RequestsWelcome role={member.role} />
    return <RequestsOverview
      requests={list.rows.map(request => ({ ...request, createdAt: request.createdAt.toISOString() }))}
      activeCapped={list.activeCapped}
      hasOlderDone={list.hasOlderDone}
      isGuest={isGuest}
      context={{ orgId: member.orgId }}
    />
  }

  // Canonical /requests/[id]: the list context lives in the layout's list view
  // state, so returning to "/" restores the status view and Project filter.
  const returnHref = requestListHref("all")

  return (
    <div
      data-slot="requests-workspace"
      className="flex min-h-0 flex-1 bg-background sm:h-full sm:overflow-hidden"
    >
      <RequestWorkspaceKeyboard
        selectedRequestId={selectedRequestId}
        returnHref={returnHref}
      />
      {selected ? (
        <RequestDetailPane
          request={selected.request}
          comments={selected.comments}
          attachments={selected.attachments}
          filter="all"
          projectFilter="all"
          orgId={member.orgId}
          currentUserId={member.userId}
          isAdmin={member.role === "admin"}
          isGuest={isGuest}
        />
      ) : <RequestUnavailable returnHref={returnHref} />}
    </div>
  )
}
