"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { SlidersHorizontal } from "lucide-react"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Button } from "@/components/arc/button/button"
import { RequestStatusControl } from "./request-status-control"
import { StatusGlyph } from "./status-glyph"
import { LocalTime } from "./local-time"
import { RequestPriorityPicker } from "./request-priority-picker"
import { ProjectMarker } from "@/components/projects/project-marker"
import { RequestLabels } from "./request-labels"
import { REQUEST_PRIORITY_LABELS, type RequestPriority } from "@/lib/request-constants"
import { availableMove, canEditRequest, type LifecycleMove } from "@/lib/request-lifecycle"
import { dueSignal, journeyFactsOf, journeyStatus, type DueSignal, type Journey } from "@/lib/request-journey"
import { DueTag, useDueNow } from "./due-tag"
import { useDetailRequest } from "./detail-context"
import { useListAnnouncer } from "./list-announcer"
import { useRequestMoves } from "./request-moves"
import { useRequestNavigation } from "./request-navigation"
import { PriorityGlyph } from "./row-presentation"
import styles from "./detail.module.css"

// The Properties sheet stays out of the phone's first load. Its chunk is fetched
// once the page is idle, or on the first press or focus of the state line, so
// the sheet opens without waiting on the network.
const PropertiesDrawer = dynamic(() => import("./detail-properties-drawer").then(module => module.PropertiesDrawer), { ssr: false })
const preloadDrawer = () => { void import("./detail-properties-drawer") }

/** "In progress, High priority", "Open, No priority" or "Measuring, Due in 3 days": the phone's one state line (plan item 2.5; #133).
 * Priority is read only while it shows: before the work is Done. */
export function stateLineText(journey: Journey, priority: RequestPriority | null, due: DueSignal) {
  const facts = [journey.label, ...(due.kind === "none" ? [] : [due.label]), ...(priority ? [priority === "none" ? "No priority" : `${REQUEST_PRIORITY_LABELS[priority]} priority`] : [])]
  return facts.join(", ")
}

/**
 * The Request's one journey status and due tag (#133), read through the journey module. The due tag shows in
 * the peek only: on the full Request page the timeline's Measuring step is the one place that counts down (#127).
 */
export function detailJourney(request: Parameters<typeof journeyFactsOf>[0], now: Date, { peek }: { peek: boolean }): { journey: Journey; due: DueSignal } {
  const facts = journeyFactsOf(request)
  return { journey: journeyStatus(facts), due: peek ? dueSignal(facts, now) : { kind: "none" } }
}

function useDetailJourney() {
  const { request, peek } = useDetailRequest()
  return detailJourney(request, useDueNow(), { peek })
}

/** The Status and Priority moves, the same ones the strip and the list run. */
function useDetailMoves() {
  const { orgId, viewer, request, name } = useDetailRequest()
  const announce = useListAnnouncer()
  const moves = useRequestMoves({ orgId, announce })
  return {
    move: (kind: "pick-up" | "done") => moves.move({ id: request.id, name, reviewState: request.reviewState }, kind, {
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
  const { deferFocus } = useRequestNavigation()
  const { request, isGuest, viewer } = useDetailRequest()
  const { move: runMove, setPriority } = useDetailMoves()
  const { journey, due } = useDetailJourney()
  const status = request.status
  const priority = request.priority
  const move = availableMove({ status, agreementBlocked: request.agreementBlocked, pickupBlockedReason: request.pickupBlockedReason }, { isGuest, readOnly: viewer.readOnly })
  const priorityText = REQUEST_PRIORITY_LABELS[priority]
  const priorityGlyph = <span className={styles.priorityGlyph} data-priority={priority}><PriorityGlyph priority={priority} /></span>
  const selectMove = (kind: LifecycleMove) => {
    void runMove(kind)
    if (inSheet) return
    // The menu hands focus back to its trigger, but a move that leaves none
    // (Mark Done) unmounts that trigger with it. Focus then goes to the title,
    // as the strip's slot does. In the sheet the dialog keeps focus.
    deferFocus(() => {
      const active = document.activeElement
      if (!active || active === document.body) document.getElementById("request-title")?.focus({ preventScroll: true })
    })
  }

  // Decision 2026-10-21 (critique 2.5): a value this viewer cannot change reads as plain glyph and text, like
  // Assignee and Project; only a control that opens something keeps the chip.
  // A pickup that isn't ready is explained by the strip's Pick up beside it, so Status offers no move then.
  // #133: a Measuring Request's due tag sits beside its status, in words, in the warning tone.
  const statusControl = <>
    {move && !move.blockedReason ? <RequestStatusControl journey={journey} move={move} onMove={selectMove} className={styles.propertyButton} />
      : <Value icon={<StatusGlyph status={journey.status} />}>{journey.label}</Value>}
    <DueTag signal={due} />
  </>

  // Whoever can change the Request sets its priority, a guest on their own Request included.
  const priorityControl = !canEditRequest(request, viewer) ? <Value icon={priorityGlyph}>{priorityText}</Value>
    : <RequestPriorityPicker className={styles.propertyButton} value={priority} onChange={setPriority} disabled={false} />

  return { statusControl, priorityControl }
}

export function DetailProperties({ inSheet = false }: { inSheet?: boolean }) {
  const { request } = useDetailRequest()
  const { statusControl, priorityControl } = usePropertyControls(inSheet)
  const { journey } = useDetailJourney()
  const status = request.status
  const priority = request.priority
  const assignee = request.assignedTo ? request.assigneeName?.trim() || "Unknown member" : null
  return <div className={styles.properties}>
    <dl className={styles.propertyGroup}>
      {/* Sketch reservation (2026-10-11): Alignment and Outcome rows insert after Status, in this group. Nothing renders for them in Phase 2. */}
      <Row label="Status" data-detail-status="" data-status={journey.status}>{statusControl}</Row>
    </dl>
    <dl className={styles.propertyGroup}>
      {status !== "done" && <Row label="Priority" data-detail-priority="" data-priority={priority}>{priorityControl}</Row>}
      <Row label="Assignee">{assignee
        ? <Value icon={<Avatar name={assignee} src={request.assigneeAvatarUrl ?? undefined} unoptimized size="sm" className={styles.avatar} aria-hidden="true" />}>{assignee}</Value>
        : <span className={styles.propertyMuted}>No one yet</span>}</Row>
      <Row label="Project"><Value icon={<ProjectMarker projectId={request.projectId} />}>{request.projectId ? request.projectName ?? "Unavailable Project" : "No Project"}</Value></Row>
      <Row label="Labels"><RequestLabels request={request} /></Row>
      <Row label="Submitted"><span className={styles.propertyText}>{request.creatorName ?? "Unknown member"}, <LocalTime iso={new Date(request.createdAt).toISOString()} /></span></Row>
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
  const { journey, due } = useDetailJourney()
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
      {request.status !== "done" && priorityControl}
    <Button ref={line} type="button" variant="secondary" size="sm" morph="plain" className={styles.stateLine} data-detail-state-line="" aria-label={`Properties: ${stateLineText(journey, request.status !== "done" ? request.priority : null, due)}`} aria-haspopup="dialog" aria-expanded={open}
      onPointerDown={preloadDrawer} onFocus={preloadDrawer}
      onClick={() => { setLoaded(true); setOpen(true) }}>
      <SlidersHorizontal strokeWidth={1.75} aria-hidden="true" />
      Properties
    </Button>
    </div>
    {loaded && <PropertiesDrawer open={open} onOpenChange={setOpen} returnFocus={() => line.current?.focus({ preventScroll: true })} />}
  </>
}
