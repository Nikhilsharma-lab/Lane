"use client"

import { Folder, UserRound } from "lucide-react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { Avatar } from "@/components/arc/avatar/avatar"
import { DetailStateLine } from "./detail-properties"
import { LocalTime } from "./local-time"
import type { RequestComment } from "./detail-view"
import { useDetailRequest } from "./detail-context"
import { usePendingMutations } from "./pending-mutations-provider"
import styles from "./request-pane-header.module.css"

/** Arc page-header's title, metadata and section navigation, bound to the saved Request. */
export function RequestPaneHeader({ comments }: { comments: RequestComment[] }) {
  const { request } = useDetailRequest()
  const overlay = usePendingMutations()
  const commentCount = overlay ? overlay.commentsFor(request.id, comments).length : comments.length
  return <header className={styles.header} data-detail-title="">
    <div className={styles.introInner}>
      <div className={styles.titleRow}>
        <h2 id="request-title" tabIndex={-1} className={styles.title}>{request.title}</h2>
      </div>
      <DetailStateLine />
      <div className={styles.meta}>
        <span className={styles.metaIcon}><Avatar name={request.creatorName ?? "Unknown member"} size="sm" aria-hidden="true" /><span>Requested by <strong>{request.creatorName ?? "Unknown member"}</strong></span></span>
        <LocalTime iso={new Date(request.createdAt).toISOString()} day />
        {request.projectName && <span className={styles.metaIcon}><Folder data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" />{request.projectName}</span>}
        {request.assigneeName && <span className={styles.metaIcon}><UserRound data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" />{request.assigneeName}</span>}
      </div>
    </div>
    <TabsPrimitive.List aria-label="Request sections" className={styles.tabs}>
      <TabsPrimitive.Trigger value="overview" className={styles.tab}>Overview</TabsPrimitive.Trigger>
      <TabsPrimitive.Trigger value="journey" data-section="journey" className={styles.tab}>Journey</TabsPrimitive.Trigger>
      <TabsPrimitive.Trigger value="activity" className={styles.tab}>Activity</TabsPrimitive.Trigger>
      <TabsPrimitive.Trigger value="conversation" className={styles.tab}>Conversation<span className={styles.count}>{commentCount}</span></TabsPrimitive.Trigger>
    </TabsPrimitive.List>
  </header>
}
