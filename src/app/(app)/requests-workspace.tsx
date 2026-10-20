import { redirect } from "next/navigation"
import { getMember, getWorkspace } from "@/lib/ensure-workspace"
import { loadRequestDetail, loadRequestList } from "@/lib/data/requests"
import { requestListHref } from "@/lib/request-workspace"
import { ListAnnouncerProvider } from "@/components/requests/list-announcer"
import { RequestDetailView, RequestUnavailable, type RequestDetail, type RequestComment, type RequestAttachment } from "@/components/requests/detail-view"
import { CommentForm } from "./requests/[id]/comment-form"
import { AttachmentDownload } from "./requests/[id]/attachment-download"
import { LifecycleButtons } from "./requests/[id]/lifecycle-buttons"
import { RequestWorkspaceKeyboard } from "./request-workspace-keyboard"
import { RequestsOverview } from "./requests-overview"
import { EditRequest } from "./requests/[id]/edit-request"
import { measurementReadiness } from "@/lib/request-measurement"

function RequestDetailPane({ orgId, currentUserId, viewerName, isAdmin, ...props }: {
  request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[];
  returnHref: string; orgId: string; isGuest: boolean; currentUserId: string; viewerName: string; isAdmin: boolean;
}) {
  const { request, isGuest } = props
  const impact = request.expectedImpact
  const pickupBlockedReason = measurementReadiness(impact, request.requestType)
  const pickupRequester = request.createdBy === currentUserId ? null : request.creatorName || "the requester"
  return <RequestDetailView {...props} orgId={orgId} viewer={{ id: currentUserId, name: viewerName, isAdmin }}
    lifecycleActions={<LifecycleButtons requestId={request.id} status={request.status} context={{ orgId }} isGuest={isGuest} pickupBlockedReason={pickupBlockedReason} pickupRequester={pickupRequester} />}
    editRequest={request.status === "open" && (request.createdBy === currentUserId || isAdmin) ? <EditRequest request={request} orgId={orgId} draftOwnerId={currentUserId} /> : undefined}
    commentForm={<CommentForm requestId={request.id} context={{ orgId }} />}
    attachmentAction={attachment => <AttachmentDownload attachmentId={attachment.id} context={{ orgId }} />}
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
    // Plan item 2.1: an empty workspace renders the same list, whose records
    // region shows the welcome, so the first Request lands in place.
    return <RequestsOverview
      requests={list.rows.map(request => ({ ...request, createdAt: request.createdAt.toISOString() }))}
      activeCapped={list.activeCapped}
      hasOlderDone={list.hasOlderDone}
      isGuest={isGuest}
      // The welcome is about the workspace, never about the current filter.
      canInvite={member.role === "admin"}
      context={{ orgId: member.orgId }}
    />
  }

  // Canonical /requests/[id]: the list context lives in the layout's list view
  // state, so returning to "/" restores the status view and Project filter.
  const returnHref = requestListHref("all")

  return (
    <div
      data-slot="requests-workspace"
      className="flex min-h-0 flex-1 sm:h-full sm:overflow-hidden"
    >
      <RequestWorkspaceKeyboard
        selectedRequestId={selectedRequestId}
        returnHref={returnHref}
      />
      {selected ? (
        // Plan item 2.5: keyed by Request, so previous and next mount a fresh
        // detail (scrolled to the top, no comment draft carried across). Copy,
        // pick up and priority speak in one polite region, as on the list.
        <ListAnnouncerProvider key={selected.request.id}>
          <RequestDetailPane
            request={selected.request}
            comments={selected.comments}
            attachments={selected.attachments}
            returnHref={returnHref}
            orgId={member.orgId}
            currentUserId={member.userId}
            viewerName={workspace.fullName}
            isAdmin={member.role === "admin"}
            isGuest={isGuest}
          />
        </ListAnnouncerProvider>
      ) : <RequestUnavailable returnHref={returnHref} />}
    </div>
  )
}
