import type { ReactNode } from "react"
import { canChange } from "@/lib/request-access-rules"
import { CommentForm } from "@/app/(app)/requests/[id]/comment-form"
import { AttachmentDownload } from "@/app/(app)/requests/[id]/attachment-download"
import { LifecycleButtons } from "@/app/(app)/requests/[id]/lifecycle-buttons"
import { EditRequest } from "@/app/(app)/requests/[id]/edit-request"
import { DeleteRequest } from "@/app/(app)/requests/[id]/delete-request"
import { closureLabel } from "@/lib/request-outcome"
import { RequestReviewersPanel } from "./request-reviewers-panel"
import { RequestReleasePanel } from "./request-release-panel"
import { RequestOutcomePanel } from "./request-outcome-panel"
import { RequestDetailView, type RequestAttachment, type RequestComment, type RequestDetail } from "./detail-view"

/**
 * Plan items 2.5 and 2.12: one Request's detail with its islands, shared by
 * the Request page (a server render) and the list's peek (a client render,
 * loaded on demand). Both apply the same rules: pickup readiness, Edit and
 * Delete only for an Open Request's creator or an admin, no lifecycle action
 * for a guest, and the reviewer, release and outcome panels, so the peek
 * shows exactly what the page shows. Reviews never block pickup.
 */
export function RequestDetailPane({ orgId, currentUserId, viewerName, isAdmin, peekStrip, ...props }: {
  request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[];
  returnHref: string; orgId: string; isGuest: boolean; currentUserId: string; viewerName: string; isAdmin: boolean;
  /** The peek's strip, in place of the page's (plan item 2.12). */
  peekStrip?: (slots: { action?: ReactNode; editAction?: ReactNode }) => ReactNode;
}) {
  const { request, isGuest } = props
  const pickupBlockedReason = request.pickupBlockedReason ?? null
  // Whoever can edit the plan is told what to fix; anyone else is told who can (as in the list).
  const changes = canChange({ userId: currentUserId, role: isAdmin ? "admin" : "member" }, request)
  const pickupRequester = changes ? null : request.creatorName || "the requester"
  const closure = closureLabel(request)
  return <RequestDetailView {...props} orgId={orgId} viewer={{ id: currentUserId, name: viewerName, isAdmin }} peekStrip={peekStrip}
    requestPanels={<><RequestReviewersPanel revision={request.agreementRevision} requestId={request.id} orgId={orgId} isAdmin={isAdmin} isGuest={isGuest} /><RequestReleasePanel key={request.id} requestId={request.id} orgId={orgId} revision={request.agreementRevision ?? 0} /><RequestOutcomePanel key={`outcome-${request.id}`} requestId={request.id} orgId={orgId} revision={request.agreementRevision ?? 0} /></>}
    lifecycleActions={request.agreementBlocked ? <a href="#outcome">{closure ?? "Closed"}</a> : <LifecycleButtons requestId={request.id} status={request.status} context={{ orgId }} isGuest={isGuest} pickupBlockedReason={pickupBlockedReason} pickupRequester={pickupRequester} />}
    editRequest={request.status === "open" && changes ? <><EditRequest request={request} orgId={orgId} draftOwnerId={currentUserId} /><DeleteRequest requestId={request.id} title={request.title} orgId={orgId} /></> : undefined}
    commentForm={<CommentForm requestId={request.id} context={{ orgId }} />}
    attachmentAction={attachment => <AttachmentDownload attachmentId={attachment.id} fileName={attachment.fileName} context={{ orgId }} />}
  />
}
