"use client"

import { useMemo, type ReactNode } from "react"
import { CommentThread } from "@/components/arc/comment-thread/comment-thread"
import { LocalTime } from "./local-time"
import { useDetailRequest } from "./detail-context"
import type { RequestComment } from "./detail-view"
import { usePendingComments } from "./pending-mutations-provider"
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
  const { request, viewer } = useDetailRequest()
  const shown = usePendingComments(request.id, comments)
  const threadComments = useMemo(() => shown.map(comment => ({
    id: comment.id,
    author: { id: comment.id, name: comment.authorName ?? "Unknown member" },
    body: comment.body,
    createdAt: "pending" in comment && comment.pending === "sending" ? "Sending…" : comment.createdAt.toISOString(),
  })), [shown])
  return <section id="conversation" aria-labelledby="conversation-heading" className={styles.section}>
    <h2 id="conversation-heading" tabIndex={-1} className={styles.sectionHeading}>Conversation</h2>
    <CommentThread
      comments={threadComments}
      currentUser={viewer}
      readOnly
      composer={children ?? null}
      renderTimestamp={comment => comment.createdAt === "Sending…" ? comment.createdAt : <LocalTime iso={comment.createdAt} />}
      labels={{ thread: "Request comments", empty: "No comments yet." }}
    />
  </section>
}
