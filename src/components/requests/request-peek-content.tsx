"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { Hash, Inbox, Link2, Maximize2 } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import buttonStyles from "@/components/arc/button/button.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import { requestDetailHref } from "@/lib/request-workspace"
import { CopyButton } from "./copy-button"
import { useDetailRequest } from "./detail-context"
import type { RequestAttachment, RequestComment, RequestDetail } from "./detail-view"
import { usePendingMutations } from "./pending-mutations-provider"
import { RequestDetailPane } from "./request-detail-pane"
import { PreviewClose, PreviewFrame, PreviewSkeleton, type RequestPeekProps } from "./request-peek"
import { PREFETCH_INTENT_MS } from "./use-intent-prefetch"
import detailStyles from "./detail.module.css"
import styles from "./request-peek.module.css"

type Detail = { request: RequestDetail; comments: RequestComment[]; attachments: RequestAttachment[] }
type Entry = { status: "ready"; detail: Detail } | { status: "unavailable" } | { status: "error"; message: string }

// Plan item 2.12: what the preview last read for each Request, for this page's life and this viewer
// and workspace only, so J back to a Request shows it at once while a fresh copy loads.
const entries = new Map<string, Entry>()
const listeners = new Set<() => void>()
const MAX_ENTRIES = 30
function write(key: string, entry: Entry) {
  entries.delete(key)
  entries.set(key, entry)
  if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!)
  for (const notify of listeners) notify()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

type Wire = {
  request: Omit<RequestDetail, "createdAt"> & { createdAt: string }
  comments: (Omit<RequestComment, "createdAt"> & { createdAt: string })[]
  attachments: (Omit<RequestAttachment, "uploadedAt"> & { uploadedAt: string | null })[]
}

/** Reads one Request through the GET route (plan items 1.16 and 2.12), never a server action. */
async function fetchDetail(orgId: string, id: string, signal: AbortSignal): Promise<Entry> {
  const response = await fetch(`/api/requests/${encodeURIComponent(id)}?${new URLSearchParams({ org: orgId })}`, { headers: { Accept: "application/json" }, signal })
  const body = await response.json().catch(() => null) as (Wire & { error?: string }) | null
  if (response.status === 404) return { status: "unavailable" }
  if (!response.ok || !body?.request) return { status: "error", message: body?.error ?? "This Request could not be loaded. Try again." }
  return { status: "ready", detail: {
    request: { ...body.request, createdAt: new Date(body.request.createdAt) },
    comments: body.comments.map(comment => ({ ...comment, createdAt: new Date(comment.createdAt) })),
    attachments: body.attachments.map(attachment => ({ ...attachment, uploadedAt: attachment.uploadedAt ? new Date(attachment.uploadedAt) : null })),
  } }
}

/** The preview's strip: its code, copy, Open full page, Edit Request and the one lifecycle action. */
function PeekStrip({ action, editAction, onClose, onOpenFullPage }: { action?: ReactNode; editAction?: ReactNode; onClose: () => void; onOpenFullPage: () => void }) {
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
 * revalidate only the Request page). Until a fresh read lands, the moves and
 * priority come from the list's server row, so the preview never shows an older
 * status than the row beside it.
 */
export function RequestPeekContent({ requestId, serverRow, orgId, isGuest, viewer, onClose, onOpenFullPage }: RequestPeekProps) {
  const key = `${orgId}:${viewer.id}:${requestId}`
  const entry = useSyncExternalStore(subscribe, () => entries.get(key), () => undefined)
  const overlay = usePendingMutations()
  const [retry, setRetry] = useState(0)
  const detail = entry?.status === "ready" ? entry.detail : null
  // A comment addComment confirmed that this copy does not list yet: read once more.
  const unsyncedComment = Boolean(detail && overlay?.commentsFor(requestId, detail.comments).some(comment => "pending" in comment && comment.pending === "sent"))

  useEffect(() => {
    const controller = new AbortController()
    // A held J passes many rows: only the one the person stops on is read.
    const timer = window.setTimeout(() => {
      fetchDetail(orgId, requestId, controller.signal).then(next => {
        // A failed refresh keeps the copy already shown.
        if (next.status === "error" && entries.get(key)?.status === "ready") return
        write(key, next)
      }, (error: unknown) => {
        if (controller.signal.aborted) return
        if (entries.get(key)?.status !== "ready") write(key, { status: "error", message: error instanceof Error && error.name === "TypeError" ? "Check your connection and try again." : "This Request could not be loaded. Try again." })
      })
    }, entries.has(key) ? 0 : PREFETCH_INTENT_MS)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [key, orgId, requestId, serverRow, unsyncedComment, retry])

  const request = useMemo(() => {
    if (!detail) return null
    if (!serverRow) return detail.request
    const merged: RequestDetail = { ...detail.request, status: serverRow.status, assigneeName: serverRow.assigneeName }
    if (serverRow.priority !== undefined) merged.priority = serverRow.priority
    if (serverRow.assignedTo !== undefined) merged.assignedTo = serverRow.assignedTo
    if (serverRow.assigneeAvatarUrl !== undefined) merged.assigneeAvatarUrl = serverRow.assigneeAvatarUrl
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
      currentUserId={viewer.id} viewerName={viewer.name} isAdmin={viewer.isAdmin}
      peekStrip={slots => <PeekStrip {...slots} onClose={onClose} onOpenFullPage={onOpenFullPage} />} />
  </PreviewFrame>
}
