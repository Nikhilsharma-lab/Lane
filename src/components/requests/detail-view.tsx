import type { ReactNode } from "react"
import Link from "next/link"
import { NewRequestLink } from "./new-request-link"
import { ChevronRight, ExternalLink, FileText, Image as ImageIcon, Inbox, Link as LinkIcon, Plus } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import buttonStyles from "@/components/arc/button/button.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import { statuses } from "./tasks/statuses"
import { RequestStatusFilter as StatusFilter } from "@/app/(app)/request-status-filter"
import { REQUEST_TYPE_LABELS, type RequestPriority, type RequestType } from "@/lib/request-constants"
import type { ExpectedImpact } from "@/lib/request-impact"
import type { DesignReview } from "@/lib/request-review"
import { ExpectedImpactSummary } from "./expected-impact-summary"
import { relativeTime } from "@/lib/relative-time"
import { formatAttachmentSize } from "@/lib/request-attachments"
import { requestDetailHref, requestListHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { DetailConversation, type ConversationComment } from "./detail-conversation"
import { DetailRequestProvider, type DetailViewer } from "./detail-context"
import { DetailProperties, DetailStateLine } from "./detail-properties"
import { DetailBackLink, DetailStrip } from "./detail-strip"
import detailStyles from "./detail.module.css"
import { statusLabel } from "@/lib/request-status"
import { cn } from "@/lib/utils"
import styles from "./requests.module.css"

export type RequestStatus = "open" | "in_progress" | "done"

export type RequestListItem = {
  id: string
  title: string
  reframedProblem: string | null
  status: RequestStatus
  createdAt: Date
  creatorName: string | null
  assigneeName: string | null
  projectId?: string | null
  projectName?: string | null
  requestType?: RequestType | null
}

export type RequestDetail = {
  designReviews?: DesignReview[]
  designReviewVersion?: number
  id: string
  /** Saved workspace-local number (LAN-n). NOT NULL, CHECK > 0 in the schema. */
  requestNumber: number
  /** Saved triage signal. The overlay reads it to clear a confirmed priority patch. */
  priority: RequestPriority
  title: string
  description: string
  affectedPeople: string | null
  desiredChange: string | null
  observedEvidence: string | null
  uncertainty: string | null
  usefulLink: string | null
  expectedImpact?: ExpectedImpact | null
  reframedProblem: string | null
  extractedSolution: string | null
  classification: "problem" | "solution" | "hybrid" | null
  status: RequestStatus
  assignedTo: string | null
  createdBy: string
  createdAt: Date
  creatorName: string | null
  assigneeName: string | null
  assigneeAvatarUrl: string | null
  projectId?: string | null
  projectName?: string | null
  requestType?: RequestType | null
}

export type RequestComment = {
  id: string
  body: string
  createdAt: Date
  authorName: string | null
}

export type RequestAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: Date | null
}


function StatusIcon({ status }: { status: RequestStatus }) {
  const presentation = statuses.find(item => item.value === status)!
  const Icon = presentation.icon
  return <Icon aria-hidden="true" className={cn("size-4 shrink-0", presentation.colorClassName)} />
}
const primaryLink = `${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.sm}`
const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`

function RequestListEmpty({ isGuest, filter, projectFilter }: { isGuest: boolean; filter: RequestStatusFilter; projectFilter: RequestProjectFilter }) {
  return <EmptyState icon={<Inbox />} title={filter === "all" ? "No Requests yet" : `No ${statusLabel(filter)} Requests`} description={filter !== "all" ? "Change the filter to check other statuses." : isGuest ? "Requests you submit will appear here." : "Describe a problem your team needs to solve."} action={filter !== "all" ? <Link className={secondaryLink} href={requestListHref("all", projectFilter)}>Show all statuses</Link> : <NewRequestLink className={primaryLink}>{isGuest ? "Submit a Request" : "Submit the first Request"}</NewRequestLink>} />
}

export function RequestListPane({ requests, selectedRequestId, filter, projectFilter = "all", projectName, isGuest }: {
  requests: RequestListItem[]; selectedRequestId?: string; filter: RequestStatusFilter; projectFilter?: RequestProjectFilter; projectName?: string; isGuest: boolean
}) {
  const groups = (["open", "in_progress", "done"] as const).filter(status => filter === "all" || filter === status).map(status => ({ status, requests: requests.filter(request => request.status === status) }))
  const visibleCount = groups.reduce((count, group) => count + group.requests.length, 0)
  return <aside aria-label="Request list" className={cn("min-h-0 min-w-0 flex-1 flex-col border-r lg:w-80 lg:flex-none xl:w-96", selectedRequestId ? "hidden lg:flex" : "flex")}>
    <header className="space-y-4 border-b p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-medium">{projectName ?? (projectFilter === "none" ? "No Project" : isGuest ? "My Requests" : "Requests")}</h2><p className="text-sm text-muted-foreground">{filter === "all" ? `${requests.length} loaded` : `${visibleCount} ${statusLabel(filter).toLocaleLowerCase()}`}</p></div>
        <NewRequestLink className={primaryLink}><Plus size={16} aria-hidden="true" />New Request</NewRequestLink>
      </div>
      <StatusFilter value={filter} />
    </header>
    {visibleCount === 0 ? <RequestListEmpty isGuest={isGuest} filter={filter} projectFilter={projectFilter} /> : <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {groups.map(group => <section key={group.status} aria-labelledby={`requests-${group.status}`} className="mb-4">
        <div className="flex items-center gap-2 px-3 py-2"><StatusIcon status={group.status} /><h3 id={`requests-${group.status}`} className="text-sm font-medium">{statusLabel(group.status)}</h3><span className="text-sm text-muted-foreground">{group.requests.length}</span></div>
        {group.requests.length ? <ul className="space-y-1">{group.requests.map(request => <li key={request.id}>
          <Link id={`request-${request.id}`} href={requestDetailHref(request.id, filter, projectFilter)} aria-current={request.id === selectedRequestId ? "page" : undefined} className={styles.requestLink}>
            <StatusIcon status={request.status} /><span className="sr-only">{statusLabel(request.status)}</span>
            <span className="min-w-0 flex-1 space-y-1"><span className="line-clamp-2 block font-medium">{request.reframedProblem ?? request.title}</span>
              {request.reframedProblem && <span className="line-clamp-1 block text-sm text-muted-foreground">{request.title}</span>}
              {(request.projectName || request.requestType) && <span className="line-clamp-1 block text-sm text-muted-foreground">{[request.projectName, request.requestType ? REQUEST_TYPE_LABELS[request.requestType] : null].filter(Boolean).join(" · ")}</span>}
              <span className="block text-sm text-muted-foreground">{request.reframedProblem ? "Reframed · " : ""}{request.creatorName || "Unknown member"} · {relativeTime(request.createdAt)}{request.status === "in_progress" && request.assigneeName ? ` · ${request.assigneeName}` : ""}</span>
            </span><ChevronRight size={16} aria-hidden="true" />
          </Link>
        </li>)}</ul> : <p className="p-3 text-sm text-muted-foreground">No {statusLabel(group.status).toLocaleLowerCase()} Requests</p>}
      </section>)}
    </div>}
  </aside>
}

/** The strip names the state as the page h1; the body says what happened, as the error frames do.
 * Plan item 2.5: a missing Request and one this person may not see read the same, with no existence leak. */
export function RequestUnavailable({ returnHref }: { returnHref: string }) {
  return <section className="flex min-w-0 flex-1 flex-col"><PageStrip leading={<DetailBackLink href={returnHref} always />} title="Request unavailable" heading /><div className="flex flex-1 items-center justify-center p-5"><EmptyState icon={<Inbox />} title="This Request can’t be opened" description="It could not be found or is not available in this workspace." action={<Link className={secondaryLink} href={returnHref}>Back to Requests</Link>} /></div></section>
}

/**
 * Plan item 2.5: Request detail. One 44px strip, a reading column and a
 * property panel. The column holds labelled regions with stable ids, in
 * order: problem, expected-impact, files, ask-for-review and conversation.
 * Alignment (after expected-impact) and outcome (after ask-for-review) are
 * reserved by this order and render nothing in Phase 2.
 *
 * A server component: the attachment action stays a render prop, and the
 * times are phrased here so the client islands never disagree with the
 * server about "3h ago".
 */
export function RequestDetailView({ request, comments, attachments, isGuest, viewer, orgId, returnHref = "/", lifecycleActions, commentForm, attachmentAction, designReview }: {
  request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[]; isGuest: boolean;
  /** Who is reading: Pick up names them as Assignee and a posted comment shows their name in the same frame. */
  viewer: DetailViewer; orgId: string; returnHref?: string;
  lifecycleActions?: ReactNode; commentForm: ReactNode; attachmentAction: (attachment: RequestAttachment) => ReactNode; designReview?: ReactNode;
}) {
  const problem = request.reframedProblem ?? request.title
  const context = [{ label: "Users", value: request.affectedPeople }, { label: "Desired change", value: request.desiredChange }, { label: "Supporting information", value: request.observedEvidence }, { label: "Open questions", value: request.uncertainty }].filter(item => item.value)
  const timed: ConversationComment[] = comments.map(comment => ({ ...comment, timeLabel: relativeTime(comment.createdAt) }))
  return <DetailRequestProvider request={request} viewer={viewer} orgId={orgId} isGuest={isGuest} submittedAgo={relativeTime(request.createdAt)}>
    <section aria-label={`Request detail: ${problem}`} className={detailStyles.root} data-detail="" data-request-id={request.id}>
      <DetailStrip returnHref={returnHref} action={isGuest ? undefined : lifecycleActions} />
      <div className={`${detailStyles.body} px-5 py-6 md:px-8`}>
        <div className={detailStyles.layout}>
          <div className={detailStyles.main} data-detail-main="">
            <header className={detailStyles.titleBlock} data-detail-title="">
              <h1 id="request-title" tabIndex={-1} className={detailStyles.title}>{problem}</h1>
              <DetailStateLine />
            </header>
            <section id="problem" aria-labelledby="problem-heading" className={detailStyles.section}>
              <h2 id="problem-heading" className="sr-only">Problem</h2>
              <p className={detailStyles.description}>{request.description}</p>
              {request.reframedProblem && <details className={detailStyles.disclosure}>
                <summary><h3>Original Request</h3></summary>
                <div className={detailStyles.disclosureBody}><p className={detailStyles.secondaryText}>{request.title}</p></div>
              </details>}
              {request.extractedSolution && <div className={detailStyles.block}>
                <h3 className={detailStyles.blockHeading}>Suggested change</h3>
                <p className={detailStyles.secondaryText}>{request.extractedSolution}</p>
              </div>}
              {(context.length > 0 || request.usefulLink) && <details className={detailStyles.disclosure}>
                <summary><h3>Supporting details</h3></summary>
                <div className={detailStyles.disclosureBody}>
                  {context.length > 0 && <dl className={detailStyles.context}>{context.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}
                  {request.usefulLink && <a href={request.usefulLink} target="_blank" rel="noopener noreferrer" className={styles.fileRow}><LinkIcon size={16} aria-hidden="true" /><span className="min-w-0 flex-1 break-all text-sm">{request.usefulLink}<span className="sr-only"> (opens in a new tab)</span></span><ExternalLink size={16} aria-hidden="true" /></a>}
                </div>
              </details>}
            </section>
            {request.expectedImpact && <ExpectedImpactSummary impact={request.expectedImpact} />}
            {attachments.length > 0 && <section id="files" aria-labelledby="files-heading" className={detailStyles.section}>
              <div className={detailStyles.sectionHeader}><h2 id="files-heading" className={detailStyles.sectionHeading}>Files</h2><span className={detailStyles.sectionCount}>{attachments.length}</span></div>
              <ul aria-label="Request files" className={detailStyles.files}>{attachments.map(attachment => <li key={attachment.id} className={styles.fileRow}>{attachment.mimeType.startsWith("image/") ? <ImageIcon size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}<div className="min-w-0 flex-1"><p className={detailStyles.fileName}>{attachment.fileName}</p><p className={detailStyles.fileMeta}>{formatAttachmentSize(attachment.sizeBytes)} · Added {attachment.uploadedAt ? relativeTime(attachment.uploadedAt) : "just now"}</p></div>{attachmentAction(attachment)}</li>)}</ul>
            </section>}
            {designReview}
            <DetailConversation comments={timed}>{commentForm}</DetailConversation>
          </div>
          <aside id="properties" aria-label="Properties" className={detailStyles.panel} data-detail-panel="">
            <DetailProperties />
          </aside>
        </div>
      </div>
    </section>
  </DetailRequestProvider>
}

/** Plan item 2.5: the loaded page's boxes, so the swap to the page does not move the column or the panel.
 * No copy, sequence or action placeholders: the strip is fixed-height and those controls sit at its end. */
export function RequestDetailSkeleton() {
  return <section className={detailStyles.root} data-skeleton="detail" aria-busy="true">
    <PageStrip compactTrail leading={<DetailBackLink href="/" />} title={<span aria-hidden="true" className="block w-16"><Skeleton lines={1} /></span>} />
    <div className={`${detailStyles.body} px-5 py-6 md:px-8`}>
      <div className={detailStyles.layout}>
        <div className={detailStyles.main} data-detail-main="">
          <div className={detailStyles.titleBlock} data-detail-title="">
            <div className={detailStyles.skeletonLine}><Skeleton label="Loading selected Request" lines={1} /></div>
            <div aria-hidden="true" className={detailStyles.skeletonStateLine} />
          </div>
          <div aria-hidden="true" className={detailStyles.skeletonBlocks}><Skeleton lines={3} /><Skeleton lines={4} /></div>
        </div>
        <div aria-hidden="true" className={detailStyles.panel} data-detail-panel="">
          <div className={detailStyles.properties}>
            <div className={detailStyles.propertyGroup}><div className={detailStyles.skeletonRow}><Skeleton lines={1} /><Skeleton lines={1} /></div></div>
            <div className={detailStyles.propertyGroup}>{Array.from({ length: 5 }, (_, index) => <div key={index} className={detailStyles.skeletonRow}><Skeleton lines={1} /><Skeleton lines={1} /></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  </section>
}
