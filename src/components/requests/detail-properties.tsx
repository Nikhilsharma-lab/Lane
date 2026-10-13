"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { Avatar } from "@/components/arc/avatar/avatar"
import { Button } from "@/components/arc/button/button"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { Select } from "@/components/arc/select/select"
import dotStyles from "@/components/projects/project-dot.module.css"
import { projectToneForId } from "@/lib/project-tone"
import { REQUEST_PRIORITIES, REQUEST_PRIORITY_LABELS, REQUEST_TYPE_LABELS, type RequestPriority } from "@/lib/request-constants"
import { allowedMove } from "@/lib/request-lifecycle"
import { statusLabel } from "@/lib/request-status"
import { useDetailRequest } from "./detail-context"
import { GlyphMenu } from "./glyph-menu"
import { useListAnnouncer } from "./list-announcer"
import { useRequestMoves } from "./request-moves"
import { PriorityGlyph, StatusGlyph } from "./row-presentation"
import styles from "./detail.module.css"

// The Properties sheet loads on first open, so the phone's first load does not carry the Drawer.
const PropertiesDrawer = dynamic(() => import("./detail-properties-drawer").then(module => module.PropertiesDrawer), { ssr: false })

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

/** Read-only value with its glyph, for a guest or a Request with no move left. */
function Value({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className={styles.propertyValue}>{icon}<span className={styles.propertyText}>{children}</span></span>
}

/** A quiet trigger for the panel's two editable properties. */
function PropertyButton({ label, icon, children, ...props }: { label: string; icon: ReactNode; children: ReactNode } & Omit<ComponentProps<typeof Button>, "children">) {
  return <Button type="button" variant="ghost" size="sm" morph="plain" className={styles.propertyButton} aria-label={label} {...props}>
    {icon}<span className={styles.propertyText}>{children}</span>
  </Button>
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
export function DetailProperties({ inSheet = false }: { inSheet?: boolean }) {
  const { request, isGuest, submittedAgo } = useDetailRequest()
  const { move: runMove, setPriority } = useDetailMoves()
  const status = request.status
  const priority = request.priority
  const move = allowedMove({ status }, { isGuest })
  const statusText = statusLabel(status)
  const priorityText = REQUEST_PRIORITY_LABELS[priority]
  const statusGlyph = <span className={styles.statusGlyph} data-status={status}><StatusGlyph status={status} /></span>
  const priorityGlyph = <span className={styles.priorityGlyph} data-priority={priority}><PriorityGlyph priority={priority} /></span>
  const statusLabelText = `Status: ${statusText}. Change status`
  const priorityLabelText = `Priority: ${priorityText}. Change priority`
  const assignee = request.assignedTo ? request.assigneeName?.trim() || "Unknown member" : null

  const statusControl = !move ? <Value icon={statusGlyph}>{statusText}</Value>
    : inSheet ? <DropdownMenu label="Change status" items={[{ label: move.label, icon: <StatusGlyph status={move.to} />, onSelect: () => { void runMove(move.move) } }]}
      trigger={<PropertyButton label={statusLabelText} icon={statusGlyph}>{statusText}</PropertyButton>} />
    : <GlyphMenu label="Change status" tip="Change status" items={[{ id: move.move, label: move.label, icon: <StatusGlyph status={move.to} />, onSelect: () => { void runMove(move.move) } }]}>
      <PropertyButton label={statusLabelText} icon={statusGlyph}>{statusText}</PropertyButton>
    </GlyphMenu>

  const priorityControl = isGuest ? <Value icon={priorityGlyph}>{priorityText}</Value>
    : inSheet ? <Select label="Priority" value={priority} options={REQUEST_PRIORITIES.map(value => ({ value, label: REQUEST_PRIORITY_LABELS[value] }))}
      onValueChange={value => setPriority(value as RequestPriority)}
      trigger={<PropertyButton label={priorityLabelText} icon={priorityGlyph}>{priorityText}</PropertyButton>} />
    : <GlyphMenu label="Change priority" tip="Change priority" items={REQUEST_PRIORITIES.map(value => ({
      id: value, label: REQUEST_PRIORITY_LABELS[value], icon: <PriorityGlyph priority={value} />, checked: value === priority,
      onSelect: value === priority ? undefined : () => setPriority(value),
    }))}>
      <PropertyButton label={priorityLabelText} icon={priorityGlyph}>{priorityText}</PropertyButton>
    </GlyphMenu>

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
      <Row label="Project">{request.projectId
        ? <Value icon={<span className={dotStyles.dot} data-tone={projectToneForId(request.projectId)} aria-hidden="true" />}>{request.projectName ?? "Unavailable Project"}</Value>
        : <span className={styles.propertyMuted}>No Project</span>}</Row>
      <Row label="Type">{request.requestType ? REQUEST_TYPE_LABELS[request.requestType] : <span className={styles.propertyMuted}>No type</span>}</Row>
      <Row label="Submitted"><span className={styles.propertyText}>{request.creatorName ?? "Unknown member"}, <SubmittedTime iso={new Date(request.createdAt).toISOString()} label={submittedAgo} /></span></Row>
    </dl>
  </div>
}

/**
 * Below 960px of content width the panel gives way to one line under the
 * title. It opens the same properties in a bottom sheet, so priority stays
 * editable on a phone; Esc or Close returns focus to the line.
 */
export function DetailStateLine() {
  const { request } = useDetailRequest()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const line = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={line} type="button" className={styles.stateLine} data-detail-state-line="" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => { setLoaded(true); setOpen(true) }}>
      <span className={styles.statusGlyph} data-status={request.status}><StatusGlyph status={request.status} /></span>
      <span className={styles.propertyText}>{stateLineText(request.status, request.priority)}</span>
      <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
    {loaded && <PropertiesDrawer open={open} onOpenChange={setOpen} returnFocus={() => line.current?.focus({ preventScroll: true })} />}
  </>
}
