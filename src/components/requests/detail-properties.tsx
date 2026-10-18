"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Badge } from "@/components/arc/badge/badge"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Button } from "@/components/arc/button/button"
import { RequestStatusControl } from "./request-status-control"
import { RequestPriorityPicker } from "./request-priority-picker"
import { ProjectMarker } from "@/components/projects/project-marker"
import { RequestTypeGlyph } from "./request-type-presentation"
import { REQUEST_PRIORITY_LABELS, REQUEST_TYPE_LABELS, type RequestPriority } from "@/lib/request-constants"
import { allowedMove, type LifecycleMove } from "@/lib/request-lifecycle"
import { statusLabel } from "@/lib/request-status"
import { useDetailRequest } from "./detail-context"
import { useListAnnouncer } from "./list-announcer"
import { useRequestMoves } from "./request-moves"
import { PriorityGlyph } from "./row-presentation"
import styles from "./detail.module.css"

// The Properties sheet stays out of the phone's first load. Its chunk is fetched
// once the page is idle, or on the first press or focus of the state line, so
// the sheet opens without waiting on the network.
const PropertiesDrawer = dynamic(() => import("./detail-properties-drawer").then(module => module.PropertiesDrawer), { ssr: false })
const preloadDrawer = () => { void import("./detail-properties-drawer") }

/** "In Progress, High priority" or "Open, No priority": the phone's one state line (plan item 2.5). */
export function stateLineText(status: Parameters<typeof statusLabel>[0], priority: RequestPriority) {
  return `${statusLabel(status)}, ${priority === "none" ? "No priority" : `${REQUEST_PRIORITY_LABELS[priority]} priority`}`
}

/** The Status and Priority moves, the same ones the strip and the list run. */
function useDetailMoves() {
  const { orgId, viewer, request, name } = useDetailRequest()
  const announce = useListAnnouncer()
  const moves = useRequestMoves({ orgId, announce })
  return {
    move: (kind: "pick-up" | "done") => moves.move({ id: request.id, name }, kind, {
      // Pick up names the viewer as Assignee in the same frame; the status decides when the patch clears.
      assignee: kind === "pick-up" ? { id: viewer.id, name: viewer.name } : undefined,
    }),
    setPriority: (priority: RequestPriority) => { if (priority !== request.priority) void moves.setPriority(request.id, priority) },
  }
}

function Row({ label, children, ...props }: { label: string; children: ReactNode } & Record<`data-${string}`, string | undefined>) {
  return <div className={styles.propertyRow}><dt>{label}</dt><dd {...props}>{children}</dd></div>
}

/** Read-only value with its glyph, for a guest or a Request with no move left. The text wraps; the glyph stays on its first line. */
function Value({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className={styles.propertyValue}><span className={styles.propertyIcon}>{icon}</span><span className={styles.propertyText}>{children}</span></span>
}

/** Submitted's local date and time, as a title once the page is in the browser (never in the first render). */
function SubmittedTime({ iso, label }: { iso: string; label: string }) {
  const ref = useRef<HTMLTimeElement>(null)
  useEffect(() => { ref.current?.setAttribute("title", new Date(iso).toLocaleString()) }, [iso])
  return <time ref={ref} dateTime={iso}>{label}</time>
}

/**
 * Plan item 2.5: the property panel. Status (its one allowed move, members
 * only) is the first group, where alignment and outcome rows will later
 * insert; then Priority (editable by members), Assignee, Project, Type and
 * Submitted. Guests see every row as text. `inSheet` renders the phone's
 * Properties sheet: a modal dialog traps focus and pointer events, so its
 * Status and Priority use Radix-layered Arc menus instead of the list's
 * context menu.
 */
function usePropertyControls(inSheet = false) {
  const { request, isGuest } = useDetailRequest()
  const { move: runMove, setPriority } = useDetailMoves()
  const status = request.status
  const priority = request.priority
  const move = allowedMove({ status }, { isGuest })
  const priorityText = REQUEST_PRIORITY_LABELS[priority]
  const priorityGlyph = <span className={styles.priorityGlyph} data-priority={priority}><PriorityGlyph priority={priority} /></span>
  const selectMove = (kind: LifecycleMove) => {
    void runMove(kind)
    if (inSheet) return
    // The menu hands focus back to its trigger, but a move that leaves none
    // (Mark Done) unmounts that trigger with it. Focus then goes to the title,
    // as the strip's slot does. In the sheet the dialog keeps focus.
    requestAnimationFrame(() => {
      const active = document.activeElement
      if (!active || active === document.body) document.getElementById("request-title")?.focus({ preventScroll: true })
    })
  }

  const statusControl = <RequestStatusControl status={status} move={move} onMove={selectMove} className={styles.propertyButton} />

  const priorityControl = isGuest ? <Badge appearance="control" className={styles.propertyButton} icon={priorityGlyph}>{priorityText}</Badge>
    : <RequestPriorityPicker className={styles.propertyButton} value={priority} onChange={setPriority} disabled={false} />

  return { statusControl, priorityControl }
}

export function DetailProperties({ inSheet = false }: { inSheet?: boolean }) {
  const { request, submittedAgo } = useDetailRequest()
  const { statusControl, priorityControl } = usePropertyControls(inSheet)
  const status = request.status
  const priority = request.priority
  const assignee = request.assignedTo ? request.assigneeName?.trim() || "Unknown member" : null
  return <div className={styles.properties}>
    <dl className={styles.propertyGroup}>
      {/* Sketch reservation (2026-10-11): Alignment and Outcome rows insert after Status, in this group. Nothing renders for them in Phase 2. */}
      <Row label="Status" data-detail-status="" data-status={status}>{statusControl}</Row>
    </dl>
    <dl className={styles.propertyGroup}>
      <Row label="Priority" data-detail-priority="" data-priority={priority}>{priorityControl}</Row>
      <Row label="Assignee">{assignee
        ? <Value icon={<Avatar name={assignee} src={request.assigneeAvatarUrl ?? undefined} unoptimized size="sm" className={styles.avatar} aria-hidden="true" />}>{assignee}</Value>
        : <span className={styles.propertyMuted}>No one yet</span>}</Row>
      <Row label="Project"><Value icon={<ProjectMarker projectId={request.projectId} />}>{request.projectId ? request.projectName ?? "Unavailable Project" : "No Project"}</Value></Row>
      <Row label="Type"><Value icon={<RequestTypeGlyph type={request.requestType} />}>{request.requestType ? REQUEST_TYPE_LABELS[request.requestType] : "No type"}</Value></Row>
      <Row label="Submitted"><span className={styles.propertyText}>{request.creatorName ?? "Unknown member"}, <SubmittedTime iso={new Date(request.createdAt).toISOString()} label={submittedAgo} /></span></Row>
    </dl>
  </div>
}

/**
 * Below 960px of content width the panel gives way to property pills under the
 * title. Properties opens the same information in a bottom sheet; priority stays
 * editable on a phone; Esc or Close returns focus to the line.
 */
export function DetailStateLine() {
  const { request } = useDetailRequest()
  const { statusControl, priorityControl } = usePropertyControls()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const line = useRef<HTMLButtonElement>(null)
  // Only where the line shows (below 960px of content): fetch the sheet once the page is idle.
  useEffect(() => {
    if (!line.current?.getClientRects().length) return
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(preloadDrawer, { timeout: 4000 })
      return () => window.cancelIdleCallback(idle)
    }
    const timer = window.setTimeout(preloadDrawer, 1500)
    return () => window.clearTimeout(timer)
  }, [])
  return <>
    <div className={styles.compactProperties} role="group" aria-label="Request properties">
      {statusControl}
      {priorityControl}
    <Button ref={line} type="button" variant="secondary" size="sm" morph="plain" className={styles.stateLine} data-detail-state-line="" aria-label={`Properties: ${stateLineText(request.status, request.priority)}`} aria-haspopup="dialog" aria-expanded={open}
      onPointerDown={preloadDrawer} onFocus={preloadDrawer}
      onClick={() => { setLoaded(true); setOpen(true) }}>
      <SlidersHorizontal strokeWidth={1.75} aria-hidden="true" />
      Properties
    </Button>
    </div>
    {loaded && <PropertiesDrawer open={open} onOpenChange={setOpen} returnFocus={() => line.current?.focus({ preventScroll: true })} />}
  </>
}
