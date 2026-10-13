import type { ReactNode } from "react"
import Link from "next/link"
import { ExternalLink, FileText, Image as ImageIcon, Inbox, Link as LinkIcon } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import buttonStyles from "@/components/arc/button/button.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import type { RequestPriority, RequestType } from "@/lib/request-constants"
import type { ExpectedImpact } from "@/lib/request-impact"
import type { DesignReview } from "@/lib/request-review"
import { ExpectedImpactSummary } from "./expected-impact-summary"
import { relativeTime } from "@/lib/relative-time"
import { formatAttachmentSize } from "@/lib/request-attachments"
import { DetailConversation, type ConversationComment } from "./detail-conversation"
import { DetailRequestProvider, type DetailViewer } from "./detail-context"
import { DetailProperties, DetailStateLine } from "./detail-properties"
import { DetailBackLink, DetailStrip } from "./detail-strip"
import detailStyles from "./detail.module.css"
import styles from "./requests.module.css"

export type RequestStatus = "open" | "in_progress" | "done"

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


const secondaryLink = `${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`

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
            {request.expectedImpact && <ExpectedImpactSummary id="expected-impact" impact={request.expectedImpact} />}
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
