"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { Hash, Inbox, Link2, Maximize2, X } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import buttonStyles from "@/components/arc/button/button.module.css"
import { PageStrip, PageStripProvider } from "@/components/shell/page-strip"
import { requestDetailHref } from "@/lib/request-workspace"
import { CopyButton } from "./copy-button"
import { useDetailRequest } from "./detail-context"
import type { RequestDetail } from "./detail-view"
import { usePendingMutations } from "./pending-mutations-provider"
import { RequestDetailPane } from "./request-detail-pane"
export { preloadSameProblemView } from "./same-problem-section"
import { peekEntry, peekKey, readForPreview, subscribePeek } from "./request-peek-memory"
import type { RequestPeekProps } from "./request-peek"
import detailStyles from "./detail.module.css"
import styles from "./request-peek.module.css"
import { Placeholder } from "@/components/loading/placeholder";
import { KeyCap } from "@/components/keyboard/key-caps";

/** The shell's trail and sidebar control belong to the page's strip, not the preview's. */
const PREVIEW_FRAME = { trail: [], expand: null, link: "a" as const }
function PreviewFrame({ children }: { children: React.ReactNode }) {
  return <PageStripProvider value={PREVIEW_FRAME}>{children}</PageStripProvider>
}

function PreviewClose({ onClose }: { onClose: () => void }) {
  return <Tooltip morph="plain" side="bottom" content={<>Close preview<KeyCap className={styles.kbd}>Esc</KeyCap></>}>
    <Button type="button" variant="ghost" size="sm" morph="plain" className={detailStyles.iconButton} aria-label="Close preview" onClick={onClose} data-request-peek-close="">
      <X strokeWidth={1.75} aria-hidden="true" />
    </Button>
  </Tooltip>
}

/** The loaded preview's boxes while its code or its Request loads. Close is there from the first frame. */
function PreviewSkeleton({ onClose }: { onClose: () => void }) {
  return <section className={detailStyles.root} aria-busy="true" data-skeleton="request-preview">
    <PreviewFrame><PageStrip leading={<PreviewClose onClose={onClose} />} title={<span aria-hidden="true" className="block w-16"><Skeleton lines={1} /></span>} /></PreviewFrame>
    <Placeholder><div className={styles.skeleton}>
      <div className={styles.skeletonTitle}><Skeleton label="Loading Request preview" lines={1} /></div>
      <div aria-hidden="true" className={styles.skeleton}><Skeleton lines={3} /><Skeleton lines={4} /></div>
    </div></Placeholder>
  </section>
}

/** The preview's strip: its code, copy, Open full page, Edit Request and the one lifecycle action. */
function PeekStrip({ action, editAction, onClose, onOpenFullPage }: { action?: ReactNode; editAction?: ReactNode; onClose: () => void; onOpenFullPage: RequestPeekProps["onOpenFullPage"] }) {
  const { request, code, formsOpen } = useDetailRequest()
  return <PageStrip title={code ?? "Request"} leading={<PreviewClose onClose={onClose} />}
    tools={<><span className={detailStyles.desktopTools}>
      <CopyButton label="Copy link" value={() => new URL(`/requests/${request.id}`, window.location.origin).href} copied="Link copied." icon={<Link2 strokeWidth={1.75} aria-hidden="true" />} />
      {code && <CopyButton label={`Copy code ${code}`} value={code} copied={`${code} copied.`} icon={<Hash strokeWidth={1.75} aria-hidden="true" />} />}
      <Tooltip morph="plain" side="bottom" content="Open full page">
        <Link href={requestDetailHref(request.id, "all")} onClick={onOpenFullPage} aria-label="Open full page" className={`${buttonStyles.button} ${buttonStyles.ghost} ${buttonStyles.sm} ${detailStyles.iconButton}`} data-request-peek-open="">
          <Maximize2 strokeWidth={1.75} aria-hidden="true" />
        </Link>
      </Tooltip>
    </span>{editAction}</>}
    action={formsOpen > 0 ? undefined : action} />
}

/**
 * Plan item 2.12: the preview's content, the Request page's own pane. It reads
 * the Request on open and after each change: when the list's server row for it
 * is replaced (an action revalidated the list, or Edit Request refreshed it),
 * and when a comment the person posted is saved but not yet read back (comments
 * revalidate only the Request page). Until a fresh read lands, the moves,
 * priority, title, Project and labels come from the list's server row, so the
 * preview never shows an older state than the row beside it.
 */
export function RequestPeekContent({ requestId, serverRow, orgId, isGuest, viewer, onClose, onOpenFullPage }: RequestPeekProps) {
  const key = peekKey({ orgId, viewerId: viewer.id, requestId })
  const entry = useSyncExternalStore(subscribePeek, () => peekEntry(key), () => undefined)
  const overlay = usePendingMutations()
  const [retry, setRetry] = useState(0)
  const detail = entry?.status === "ready" ? entry.detail : null
  // A comment addComment confirmed that this copy does not list yet: read once more.
  const unsyncedComment = Boolean(detail && overlay?.commentsFor(requestId, detail.comments).some(comment => "pending" in comment && comment.pending === "sent"))

  // #258: the first read since this Request opened, which waits on a read ahead in flight instead of
  // reading again. (A new Request remounts this, so any change after opening reads a fresh copy.)
  const [openedWith] = useState(serverRow)
  const opening = serverRow === openedWith && !unsyncedComment && retry === 0

  useEffect(() => {
    const controller = new AbortController()
    readForPreview({ orgId, viewerId: viewer.id, requestId }, controller.signal, { opening })
    return () => controller.abort()
  }, [opening, orgId, viewer.id, requestId, serverRow, unsyncedComment, retry])

  const request = useMemo(() => {
    if (!detail) return null
    if (!serverRow) return detail.request
    // The row's saved fields too, so Edit Request's refresh shows its new title, Project and labels at once.
    const merged: RequestDetail = { ...detail.request, status: serverRow.status, assigneeName: serverRow.assigneeName, title: serverRow.title, reframedProblem: serverRow.reframedProblem }
    if (serverRow.projectId !== undefined) { merged.projectId = serverRow.projectId; merged.projectName = serverRow.projectName ?? null }
    if (serverRow.labelKeys !== undefined) merged.labelKeys = serverRow.labelKeys
    if (serverRow.requestType !== undefined) merged.requestType = serverRow.requestType
    if (serverRow.priority !== undefined) merged.priority = serverRow.priority
    if (serverRow.assignedTo !== undefined) merged.assignedTo = serverRow.assignedTo
    if (serverRow.assigneeAvatarUrl !== undefined) merged.assigneeAvatarUrl = serverRow.assigneeAvatarUrl
    if (serverRow.reviewState !== undefined) merged.reviewState = serverRow.reviewState
    // #133: the journey facts too, so the peek's status and due tag read the same as the row's.
    if (serverRow.releaseState !== undefined) merged.releaseState = serverRow.releaseState
    if (serverRow.outcomeClosure !== undefined) merged.outcomeClosure = serverRow.outcomeClosure as RequestDetail["outcomeClosure"]
    if (serverRow.exceptionClosure !== undefined) merged.exceptionClosure = serverRow.exceptionClosure as RequestDetail["exceptionClosure"]
    return merged
  }, [detail, serverRow])

  if (!entry) return <PreviewSkeleton onClose={onClose} />
  if (entry.status !== "ready" || !request || !detail) {
    const unavailable = entry.status === "unavailable"
    return <section className={detailStyles.root}>
      <PreviewFrame><PageStrip leading={<PreviewClose onClose={onClose} />} title={unavailable ? "Request unavailable" : "Request preview"} /></PreviewFrame>
      <div className={styles.state}>{unavailable
        // The page's own words: a missing Request and one this person may not see read the same.
        ? <EmptyState icon={<Inbox />} title="This Request can’t be opened" description="It could not be found or is not available in this workspace." />
        : <EmptyState icon={<Inbox />} title="This Request could not be loaded" description={entry.status === "error" ? entry.message : "Try again."} action={<Button variant="secondary" size="sm" onClick={() => setRetry(count => count + 1)}>Try again</Button>} />}</div>
    </section>
  }

  return <PreviewFrame>
    <RequestDetailPane request={request} comments={detail.comments} attachments={detail.attachments} returnHref="/" orgId={orgId} isGuest={isGuest}
      currentUserId={viewer.id} viewerName={viewer.name} isAdmin={viewer.isAdmin} readOnly={viewer.readOnly}
      peekStrip={slots => <PeekStrip {...slots} onClose={onClose} onOpenFullPage={onOpenFullPage} />} />
  </PreviewFrame>
}
