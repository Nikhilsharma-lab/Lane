import type { ReactNode } from "react"
import Link from "next/link"
import { NewRequestLink } from "./new-request-link"
import { ArrowLeft, ChevronRight, ExternalLink, FileText, Image as ImageIcon, Inbox, Link as LinkIcon, MessageSquare, Paperclip, Plus, X } from "lucide-react"
import { Avatar } from "@/components/arc/avatar/avatar"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Badge } from "@/components/arc/badge/badge"
import buttonStyles from "@/components/arc/button/button.module.css"
import { statuses } from "./tasks/statuses"
import { RequestStatusFilter as StatusFilter } from "@/app/(app)/request-status-filter"
import { REQUEST_TYPE_LABELS, type RequestType } from "@/lib/request-properties"
import type { ExpectedImpact } from "@/lib/request-impact"
import type { DesignReview } from "@/lib/request-review"
import { ExpectedImpactSummary } from "./expected-impact-summary"
import { relativeTime } from "@/lib/relative-time"
import { formatAttachmentSize } from "@/lib/request-attachments"
import { requestDetailHref, requestListHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
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

function CloseDetail({ href, label }: { href: string; label: string }) {
  return <Link href={href} className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.sm}`} aria-label={label}><ArrowLeft size={16} aria-hidden="true" className="lg:hidden" /><X size={16} aria-hidden="true" className="hidden lg:block" /></Link>
}
export function RequestUnavailable({ returnHref }: { returnHref: string }) {
  return <section className="flex min-w-0 flex-1 flex-col p-5"><div><CloseDetail href={returnHref} label="Back to Request list" /></div><div className="flex flex-1 items-center justify-center"><EmptyState icon={<Inbox />} title="Request unavailable" description="This Request could not be found or is not available in this workspace." action={<Link className={secondaryLink} href={returnHref}>Back to Requests</Link>} /></div></section>
}
function Comments({ comments }: { comments: RequestComment[] }) {
  return <section aria-labelledby="request-conversation" className="space-y-4">
    <div className="flex items-center gap-2"><MessageSquare size={16} aria-hidden="true" /><h2 id="request-conversation" className="text-base font-medium">Conversation</h2><span className="text-sm text-muted-foreground">{comments.length}</span></div>
    {comments.length ? <ul aria-label="Request comments" className="space-y-5">{comments.map(comment => <li key={comment.id} className="flex items-start gap-3">
      <Avatar name={comment.authorName ?? "Unknown member"} size="sm" /><div className="min-w-0 flex-1 space-y-1"><div className="flex flex-wrap items-baseline gap-2"><span className="font-medium">{comment.authorName ?? "Unknown member"}</span><time dateTime={comment.createdAt.toISOString()} className="text-sm text-muted-foreground">{relativeTime(comment.createdAt)}</time></div><p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p></div>
    </li>)}</ul> : <p className="text-sm text-muted-foreground">No comments yet. Add a question or update below.</p>}
  </section>
}
export function RequestDetailView({ request, comments, attachments, filter, projectFilter = "all", isGuest, lifecycleActions, mobileLifecycleActions, commentForm, attachmentAction, designReview }: {
  request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[]; filter: RequestStatusFilter; projectFilter?: RequestProjectFilter; isGuest: boolean;
  lifecycleActions: ReactNode; mobileLifecycleActions?: ReactNode; commentForm: ReactNode; attachmentAction: (attachment: RequestAttachment) => ReactNode; designReview?: ReactNode;
}) {
  const problem = request.reframedProblem ?? request.title
  const status = statuses.find(item => item.value === request.status)!
  const context = [{ label: "Users", value: request.affectedPeople }, { label: "Expected result", value: request.desiredChange }, { label: "Supporting information", value: request.observedEvidence }, { label: "Open questions", value: request.uncertainty }].filter(item => item.value)
  return <section aria-label={`Request detail: ${problem}`} className="flex min-h-0 min-w-0 flex-1 flex-col">
    <header className="flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-3">
      <CloseDetail href={requestListHref(filter, projectFilter)} label="Close Request detail" /><Badge tone={status.tone}><StatusIcon status={request.status} />{status.label}</Badge><span className="text-sm text-muted-foreground">Submitted {relativeTime(request.createdAt)}</span>
      {!isGuest && <div className="ml-auto hidden lg:block">{lifecycleActions}</div>}
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8">
      <article className="mx-auto max-w-3xl space-y-7 break-words [&>section+section]:border-t [&>section+section]:pt-6">
        <section aria-labelledby="request-problem" className="space-y-4"><h1 id="request-problem" className="text-2xl font-medium">{problem}</h1>
          <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm"><div className="min-w-0 space-y-1"><dt className="text-muted-foreground">Project</dt><dd>{request.projectName ?? (request.projectId ? "Unavailable Project" : "No Project")}</dd></div><div className="space-y-1"><dt className="text-muted-foreground">Request type</dt><dd>{request.requestType ? REQUEST_TYPE_LABELS[request.requestType] : "No type"}</dd></div></dl>
          {!request.reframedProblem && <p className="whitespace-pre-wrap text-sm leading-relaxed">{request.description}</p>}
        </section>
        {request.reframedProblem && <section aria-labelledby="request-original" className="space-y-3"><h2 id="request-original" className="text-base font-medium">Original Request</h2><p className="text-sm font-medium">{request.title}</p><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{request.description}</p></section>}
        {request.extractedSolution && <section aria-labelledby="request-solution" className="space-y-3"><h2 id="request-solution" className="text-base font-medium">Suggested change</h2><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{request.extractedSolution}</p></section>}
        {request.expectedImpact && <ExpectedImpactSummary impact={request.expectedImpact} />}
        {(context.length > 0 || request.usefulLink) && <section aria-labelledby="request-context" className="space-y-4"><h2 id="request-context" className="text-base font-medium">Supporting details</h2><dl className="grid gap-4 sm:grid-cols-2">{context.map(item => <div key={item.label} className="space-y-1"><dt className="text-sm font-medium">{item.label}</dt><dd className="whitespace-pre-wrap text-sm text-muted-foreground">{item.value}</dd></div>)}</dl>
          {request.usefulLink && <a href={request.usefulLink} target="_blank" rel="noopener noreferrer" className={styles.fileRow}><LinkIcon size={16} aria-hidden="true" /><span className="min-w-0 flex-1 break-all text-sm">{request.usefulLink}<span className="sr-only"> (opens in a new tab)</span></span><ExternalLink size={16} aria-hidden="true" /></a>}
        </section>}
        {attachments.length > 0 && <section aria-labelledby="request-files" className="space-y-3"><div className="flex items-center gap-2"><Paperclip size={16} aria-hidden="true" /><h2 id="request-files" className="text-base font-medium">Files</h2><span className="text-sm text-muted-foreground">{attachments.length}</span></div><ul aria-label="Request files" className="divide-y">{attachments.map(attachment => <li key={attachment.id} className={styles.fileRow}>{attachment.mimeType.startsWith("image/") ? <ImageIcon size={16} aria-hidden="true" /> : <FileText size={16} aria-hidden="true" />}<div className="min-w-0 flex-1"><p className="break-all text-sm font-medium">{attachment.fileName}</p><p className="text-sm text-muted-foreground">{formatAttachmentSize(attachment.sizeBytes)} · Added {attachment.uploadedAt ? relativeTime(attachment.uploadedAt) : "just now"}</p></div>{attachmentAction(attachment)}</li>)}</ul></section>}
        <section aria-labelledby="request-people" className="space-y-3"><h2 id="request-people" className="text-base font-medium">People</h2><ul aria-label="Request people" className="space-y-3"><li className="flex items-center gap-3"><Avatar name={request.creatorName ?? "Unknown member"} size="sm" /><div><p className="text-sm font-medium">{request.creatorName ?? "Unknown member"}</p><p className="text-sm text-muted-foreground">Submitted this Request · {relativeTime(request.createdAt)}</p></div></li>{!isGuest && <li className="flex items-center gap-3"><Avatar name={request.assigneeName ?? "Unassigned"} size="sm" /><div><p className="text-sm font-medium">{request.assigneeName ?? "No one yet"}</p><p className="text-sm text-muted-foreground">{request.assigneeName ? "Picked up this Request" : "Available for anyone to pick up"}</p></div></li>}</ul></section>
        {designReview}
        <Comments comments={comments} />
        <section className="space-y-4">{!isGuest && <div className="lg:hidden">{mobileLifecycleActions ?? lifecycleActions}</div>}{commentForm}</section>
      </article>
    </div>
  </section>
}
export function RequestDetailSkeleton() {
  return <div aria-label="Loading selected Request" aria-busy="true" className="min-w-0 flex-1 space-y-8 p-6"><Skeleton label="Loading selected Request" lines={2} /><Skeleton lines={5} /><Skeleton avatar lines={3} /></div>
}
