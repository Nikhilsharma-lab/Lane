import type { ReactNode } from "react"
import Link from "next/link"
import { ExternalLink, FileText, Image as ImageIcon, Inbox, Link as LinkIcon } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import buttonStyles from "@/components/arc/button/button.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import type { RequestPriority, RequestType } from "@/lib/request-constants"
import type { ExpectedImpact, IncompleteMeasurement } from "@/lib/request-impact"
import type { DesignReview } from "@/lib/request-review"
import { RequestDesignLink, isFigmaLink } from "./request-design-link"
import { ExpectedImpactSummary } from "./expected-impact-summary"
import { relativeTime } from "@/lib/relative-time"
import { formatAttachmentSize } from "@/lib/request-attachments"
import { DetailConversation, type ConversationComment } from "./detail-conversation"
import { DetailArrivalReset, DetailRequestProvider, type DetailViewer } from "./detail-context"
import { DetailProperties, DetailStateLine } from "./detail-properties"
import { DetailBackLink } from "./detail-back-link"
import { DetailStrip } from "./detail-strip"
import detailStyles from "./detail.module.css"
import styles from "./requests.module.css"

export type RequestStatus = "open" | "in_progress" | "done"

export type RequestDetail = {
  agreementRevision?: number
  agreementBlocked?: boolean
  agreementSubmitted?: boolean
  exceptionClosure?: import("@/lib/request-agreement").ExceptionClosure | null
  outcomeClosure?: import("@/lib/request-outcome").OutcomeClosure | null
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
  measurementDraft?: IncompleteMeasurement | null
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
  labelKeys?: string[] | null
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


const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`

/** The strip names the state as the page h1; the body says what happened, as the error frames do.
 * Plan item 2.5: a missing Request and one this person may not see read the same, with no existence leak.
 * Reached with J or K, its heading takes the focus the title would have had. */
export function RequestUnavailable({ returnHref }: { returnHref: string }) {
  return <section className="flex min-w-0 flex-1 flex-col"><DetailArrivalReset /><PageStrip leading={<DetailBackLink href={returnHref} always />} title="Request unavailable" heading /><div className="flex flex-1 items-center justify-center p-5"><EmptyState icon={<Inbox />} title="This Request can’t be opened" description="It could not be found or is not available in this workspace." action={<Link className={secondaryLink} href={returnHref}>Back to Requests</Link>} /></div></section>
}

/**
 * Plan item 2.5: Request detail. One 44px strip, a reading column and a
 * property panel. The column holds labelled regions with stable ids, in
 * order: problem, expected-impact, files, design and conversation.
 * Design reviews happen in Figma; Lane only exposes the saved design reference.
 *
 * A server component: the attachment action stays a render prop, and the
 * times are phrased here so the client islands never disagree with the
 * server about "3h ago".
 */
export function RequestDetailView({ request, comments, attachments, isGuest, viewer, orgId, returnHref = "/", lifecycleActions, commentForm, attachmentAction, currentValues, editRequest, agreement }: {
  request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[]; isGuest: boolean;
  /** Who is reading: Pick up names them as Assignee and a posted comment shows their name in the same frame. */
  viewer: DetailViewer; orgId: string; returnHref?: string;
  lifecycleActions?: ReactNode; commentForm: ReactNode; attachmentAction: (attachment: RequestAttachment) => ReactNode; currentValues?: ReactNode; editRequest?: ReactNode; agreement?: ReactNode;
}) {
  const problem = request.reframedProblem ?? request.description
  const context = [{ label: "Users", value: request.affectedPeople }, { label: "Desired change", value: request.desiredChange }, { label: "Supporting information", value: request.observedEvidence }, { label: "Open questions", value: request.uncertainty }].filter(item => item.value)
  const supportingLink = isFigmaLink(request.usefulLink) ? null : request.usefulLink
  const timed: ConversationComment[] = comments.map(comment => ({ ...comment, timeLabel: relativeTime(comment.createdAt) }))
  return <DetailRequestProvider request={request} viewer={viewer} orgId={orgId} isGuest={isGuest} submittedAgo={relativeTime(request.createdAt)}>
    <section aria-label={`Request detail: ${request.title}`} className={detailStyles.root} data-detail="" data-request-id={request.id}>
      <DetailStrip returnHref={returnHref} editAction={editRequest} action={isGuest ? undefined : lifecycleActions} />
      <div className={`${detailStyles.body} px-5 py-6 md:px-8`}>
        <div className={detailStyles.layout}>
          <div className={detailStyles.main} data-detail-main="">
            <header className={detailStyles.titleBlock} data-detail-title="">
              <h1 id="request-title" tabIndex={-1} className={detailStyles.title}>{request.title}</h1>
              <DetailStateLine />
            </header>
            <section id="problem" aria-labelledby="problem-heading" className={detailStyles.section}>
              <h2 id="problem-heading" className="sr-only">Problem</h2>
              <p className={detailStyles.description}>{problem}</p>
              {supportingLink && <a href={supportingLink} target="_blank" rel="noopener noreferrer" className={styles.fileRow}><LinkIcon aria-hidden="true" /><span className="min-w-0 flex-1 break-all text-sm">{supportingLink}<span className="sr-only"> (opens in a new tab)</span></span><ExternalLink aria-hidden="true" /></a>}
              {request.reframedProblem && <details className={detailStyles.disclosure}>
                <summary><h3>Original Request</h3></summary>
                <div className={detailStyles.disclosureBody}><p className={detailStyles.secondaryText}>{request.description}</p></div>
              </details>}
              {request.extractedSolution && <div className={detailStyles.block}>
                <h3 className={detailStyles.blockHeading}>Suggested change</h3>
                <p className={detailStyles.secondaryText}>{request.extractedSolution}</p>
              </div>}
              {context.length > 0 && <dl className={detailStyles.context}>{context.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>}

            </section>
            {(request.expectedImpact ?? request.measurementDraft) && <ExpectedImpactSummary id="expected-impact" impact={(request.expectedImpact ?? request.measurementDraft)!} />}
            {currentValues}
            {agreement}
            {attachments.length > 0 && <section id="files" aria-labelledby="files-heading" className={detailStyles.section}>
              <div className={detailStyles.sectionHeader}><h2 id="files-heading" className={detailStyles.sectionHeading}>Files</h2><span className={detailStyles.sectionCount}>{attachments.length}</span></div>
              <ul aria-label="Request files" className={detailStyles.files}>{attachments.map(attachment => <li key={attachment.id} className={styles.fileRow}>{attachment.mimeType.startsWith("image/") ? <ImageIcon aria-hidden="true" /> : <FileText aria-hidden="true" />}<div className="min-w-0 flex-1"><p className={detailStyles.fileName}>{attachment.fileName}</p><p className={detailStyles.fileMeta}>{formatAttachmentSize(attachment.sizeBytes)} · Added {attachment.uploadedAt ? relativeTime(attachment.uploadedAt) : "just now"}</p></div>{attachmentAction(attachment)}</li>)}</ul>
            </section>}
            <RequestDesignLink relatedLink={request.usefulLink} reviews={request.designReviews} />
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
