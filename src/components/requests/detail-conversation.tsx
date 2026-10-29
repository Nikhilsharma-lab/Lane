"use client"

import { useMemo, type ReactNode } from "react"
import { Avatar } from "@/components/arc/avatar/avatar"
import { LocalTime } from "./local-time"
import { useDetailRequest } from "./detail-context"
import type { RequestComment } from "./detail-view"
import { usePendingMutations } from "./pending-mutations-provider"
import styles from "./detail.module.css"

/** A server comment; its time is phrased in the browser by LocalTime, so hydration never disagrees about "3h ago". */
export type ConversationComment = RequestComment

/**
 * Plan item 2.5: the server's comments, then the viewer's pending ones from
 * the layout-level overlay. A posted comment shows in the same frame with
 * "Sending…", keeps its place under its server id once addComment confirms
 * it, and is replaced by the server's copy (same id, so no remount) when the
 * revalidated render lists it. A failure removes it and the form restores
 * the text.
 */
export function DetailConversation({ comments, children }: { comments: ConversationComment[]; children: ReactNode }) {
  const { request } = useDetailRequest()
  const overlay = usePendingMutations()
  const shown = useMemo(() => overlay ? overlay.commentsFor(request.id, comments) : comments, [overlay, request.id, comments])
  return <section id="conversation" aria-labelledby="conversation-heading" className={styles.section}>
    <div className={styles.sectionHeader}>
      <h2 id="conversation-heading" tabIndex={-1} className={styles.sectionHeading}>Conversation</h2>
      {shown.length > 0 && <span className={styles.sectionCount}>{shown.length}</span>}
    </div>
    {shown.length ? <ul aria-label="Request comments" className={styles.comments}>{shown.map(comment => {
      const author = comment.authorName ?? "Unknown member"
      const pending = "pending" in comment ? comment.pending : null
      return <li key={comment.id} className={styles.comment} data-pending={pending ?? undefined}>
        <Avatar name={author} size="sm" aria-hidden="true" />
        <div className={styles.commentBody}>
          <div className={styles.commentMeta}>
            <span className={styles.commentAuthor}>{author}</span>
            {pending === "sending" ? <span className={styles.commentTime}>Sending…</span>
              : <LocalTime iso={comment.createdAt.toISOString()} className={styles.commentTime} />}
          </div>
          <p className={styles.commentText}>{comment.body}</p>
        </div>
      </li>
    })}</ul> : children ? null : <p className={styles.secondaryText}>No comments yet.</p>}
    {children}
  </section>
}
