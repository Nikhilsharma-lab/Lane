"use client"

import Link from "next/link"
import { useEffect, useRef, type ComponentProps, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types"
import type { OverviewRequest } from "@/lib/request-overview"
import { requestDetailHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { RequestProperty } from "../request-properties"
import styles from "../request-rows.module.css"

/** How long the pointer must rest on a title before the full detail route is prefetched. */
export const PREFETCH_INTENT_MS = 80
// PrefetchKind is a type-only enum in Next; "full" fetches the whole page,
// not just the loading skeleton the viewport prefetch fetches.
const FULL_PREFETCH = { kind: "full" as PrefetchKind }

/**
 * Plan item 1.11: the Link keeps Next's default viewport prefetch (the only
 * prefetch phones get). On top of it, a full router.prefetch starts after a
 * short hover, on focus (J/K and Tab) and on pointerdown, so the detail is
 * often loaded before the click lands. staleTimes (next.config.ts) keeps it
 * fresh for 30 s.
 */
export function RequestTitleLink({ href, onPointerEnter, onPointerLeave, onPointerDown, onFocus, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const router = useRouter()
  const timer = useRef<number | undefined>(undefined)
  const prefetched = useRef<string | null>(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const prefetch = () => {
    window.clearTimeout(timer.current)
    if (prefetched.current === href) return
    prefetched.current = href
    router.prefetch(href, FULL_PREFETCH)
  }
  return <Link href={href} {...props}
    onPointerEnter={event => { onPointerEnter?.(event); if (event.pointerType !== "touch") { window.clearTimeout(timer.current); timer.current = window.setTimeout(prefetch, PREFETCH_INTENT_MS) } }}
    onPointerLeave={event => { onPointerLeave?.(event); window.clearTimeout(timer.current) }}
    onPointerDown={event => { onPointerDown?.(event); prefetch() }}
    onFocus={event => { onFocus?.(event); prefetch() }} />
}

export type RequestColumn = { key: string; label: string; value: (row: OverviewRequest) => string; render: (row: OverviewRequest, filter: RequestStatusFilter, projectFilter?: RequestProjectFilter) => ReactNode }
export const columns: RequestColumn[] = [
  // Canonical /requests/[id] (plan item 1.7): the list context to return to lives in the layout's list view state.
  { key: "title", label: "Request", value: row => row.reframedProblem ?? row.title, render: row => <RequestTitleLink id={`request-${row.id}`} href={requestDetailHref(row.id, "all")} title={row.reframedProblem ?? row.title} className={styles.title}>{row.reframedProblem ?? row.title}</RequestTitleLink> },
  { key: "status", label: "Status", value: row => row.status, render: row => <RequestProperty request={row} property="status" /> },
  { key: "project", label: "Project", value: row => row.projectName ?? "", render: (row, filter) => <RequestProperty request={row} property="project" filter={filter} /> },
  { key: "pickedUpBy", label: "Owner", value: row => row.assigneeName ?? "", render: row => <RequestProperty request={row} property="pickedUpBy" /> },
  { key: "createdAt", label: "Submitted", value: row => row.createdAt, render: row => <RequestProperty request={row} property="createdAt" /> },
  { key: "requestType", label: "Request type", value: row => row.requestType ?? "", render: row => <RequestProperty request={row} property="requestType" /> },
  { key: "submittedBy", label: "Submitted by", value: row => row.creatorName ?? "", render: row => <RequestProperty request={row} property="submittedBy" /> },
]
