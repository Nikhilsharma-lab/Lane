"use client"

import Link from "next/link"
import type { ComponentProps, ReactNode } from "react"
import type { OverviewRequest } from "@/lib/request-overview"
import { requestDetailHref } from "@/lib/request-workspace"
import { RequestProperty } from "../request-properties"
import { useIntentPrefetch } from "../use-intent-prefetch"
import styles from "../request-rows.module.css"

/**
 * Plan item 1.11: the Link keeps Next's default viewport prefetch (the only
 * prefetch phones get). On top of it, a full router.prefetch starts after a
 * short hover and on pointerdown, so the detail is often loaded before the
 * click lands. Keyboard focus rests on the row, which prefetches itself (plan
 * item 2.4). staleTimes (next.config.ts) keeps it fresh for 30 s.
 */
export function RequestTitleLink({ href, onPointerEnter, onPointerLeave, onPointerDown, onFocus, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const prefetch = useIntentPrefetch(href)
  return <Link href={href} {...props}
    onPointerEnter={event => { onPointerEnter?.(event); if (event.pointerType !== "touch") prefetch.schedule() }}
    onPointerLeave={event => { onPointerLeave?.(event); prefetch.cancel() }}
    onPointerDown={event => { onPointerDown?.(event); prefetch.now() }}
    onFocus={event => { onFocus?.(event); prefetch.now() }} />
}

export type RequestColumn = { key: string; label: string; value: (row: OverviewRequest) => string; render: (row: OverviewRequest) => ReactNode }
export const columns: RequestColumn[] = [
  // Canonical /requests/[id] (plan item 1.7): the list context to return to lives in the layout's list view state.
  // Plan item 2.4: the row is the list's one tab stop, so its title and pills leave the Tab order.
  // Enter opens through the title (data-request-title); the pills' values are in the row's name.
  { key: "title", label: "Request", value: row => row.reframedProblem ?? row.title, render: row => <RequestTitleLink id={`request-${row.id}`} href={requestDetailHref(row.id, "all")} title={row.reframedProblem ?? row.title} className={styles.title} tabIndex={-1} data-request-title="">{row.reframedProblem ?? row.title}</RequestTitleLink> },
  { key: "status", label: "Status", value: row => row.status, render: row => <RequestProperty request={row} property="status" tabIndex={-1} /> },
  { key: "project", label: "Project", value: row => row.projectName ?? "", render: row => <RequestProperty request={row} property="project" tabIndex={-1} /> },
  { key: "pickedUpBy", label: "Assignee", value: row => row.assigneeName ?? "", render: row => <RequestProperty request={row} property="pickedUpBy" tabIndex={-1} /> },
  { key: "createdAt", label: "Submitted", value: row => row.createdAt, render: row => <RequestProperty request={row} property="createdAt" tabIndex={-1} /> },
  { key: "requestType", label: "Labels", value: row => row.requestType ?? "", render: row => <RequestProperty request={row} property="requestType" tabIndex={-1} /> },
  { key: "submittedBy", label: "Submitted by", value: row => row.creatorName ?? "", render: row => <RequestProperty request={row} property="submittedBy" tabIndex={-1} /> },
]
