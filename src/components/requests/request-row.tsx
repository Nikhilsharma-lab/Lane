"use client"

import { useRequestLabels } from "./request-labels"
import { requestLabelKeys } from "@/lib/request-labels"
import { memo, useRef, useState } from "react"
import { ArrowUpRight, PanelRight, SquareCheck } from "lucide-react"
import { formatRequestCode } from "@/lib/request-code"
import { concernMarker } from "@/lib/request-reviewer-rules"
import { WAITING_TO_BE_TAKEN_ON } from "@/lib/guest-submission"
import { Badge } from "@/components/arc/badge/badge"
import { rowDue, rowJourney, type OverviewRequest } from "@/lib/request-overview"
import { REQUEST_PRIORITY_LABELS } from "@/lib/request-constants"
import { requestDetailHref } from "@/lib/request-workspace"
import { ROW_MENU_HINTS } from "@/lib/keyboard-shortcuts"
import type { RequestColumn } from "./tasks/columns"
import { GlyphMenu } from "./glyph-menu"
import { requestRowLabel } from "./request-row-label"
import styles from "./request-rows.module.css"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { ContextMenu, type ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { PriorityGlyph, StatusGlyph, useRequestRowPresentation } from "./row-presentation"
import { statusOfJourney } from "./tasks/statuses"
import { DueTag, useDueNow } from "./due-tag"
import { REQUEST_PREVIEW_ID, useRequestPeekOpener } from "./request-peek"
import { useRowLoadAhead } from "./request-peek-load-ahead"

type RequestRowProps = {
  request: OverviewRequest
  columns: RequestColumn[]
  visibility: Record<string, boolean>
  checked: boolean
  previewed?: boolean
  disabled: boolean
  /** Plan item 2.4: this row holds the grid's one tab stop. */
  tabbable?: boolean
  /** The treegrid level (2 under a group header); left out when the list is not grouped. */
  level?: number
  /** Excluded from the memo comparison: callers pass a fresh closure each render,
   * so the handler must act on the latest selection itself (useRequestSelection does). */
  onCheckedChange: (checked: boolean) => void
}

const shallowEqual = (a: object, b: object) => {
  const left = a as Record<string, unknown>, right = b as Record<string, unknown>
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.is(left[key], right[key]))
}

/** Each RSC response and each overlay patch hands rows new objects. A row
 * re-renders only when what it shows changed: its id, status, priority,
 * request number or another saved field (compared field by field), its
 * selection, or the view's columns (plan item 1.14). A status view or Project
 * change re-renders only the rows it brings in (#296). The row presentation
 * context still re-renders rows when codes or priorities change. */
function sameRow(previous: RequestRowProps, next: RequestRowProps) {
  return previous.previewed === next.previewed
    && previous.checked === next.checked
    && previous.disabled === next.disabled
    && previous.tabbable === next.tabbable
    && previous.level === next.level
    && previous.columns === next.columns
    && shallowEqual(previous.visibility, next.visibility)
    && (previous.request === next.request || shallowEqual(previous.request, next.request))
}

export const RequestRow = memo(function RequestRow({ request, columns, visibility, checked, previewed = false, disabled, tabbable = false, level, onCheckedChange }: RequestRowProps) {
  const labels = useRequestLabels(request)
  const presentation = useRequestRowPresentation()
  const identity = presentation?.identities[request.id]
  const savedCode = request.requestNumber === undefined ? null : formatRequestCode(request.requestNumber)
  const code = savedCode ?? identity?.code ?? ""
  const rowRef = useRef<HTMLDivElement>(null)
  // Plan item 2.4: keyboard focus rests on the row, so the row prefetches its detail once the person stops on it.
  // #258: that rest, by keyboard or pointer, also reads the Request into its preview, where the list offers one.
  const rest = useRowLoadAhead(requestDetailHref(request.id, "all"), request.id)
  const actionItems = presentation?.menuItems(request) ?? []
  // Plan item 2.12: Preview, where the list offers it (1280px and wider with a mouse).
  const peek = useRequestPeekOpener()
  // The row menu names the keys it can stand in for; nothing else carries a hint. A28: each item has its own icon.
  const menuItems: ContextMenuItem[] = presentation ? [...actionItems,
    { id: "select", label: checked ? "Deselect" : "Select", icon: <SquareCheck />, shortcut: ROW_MENU_HINTS.select, separatorBefore: true, disabled, onSelect: () => onCheckedChange(!checked) },
    { id: "open", label: "Open Request", icon: <ArrowUpRight />, shortcut: ROW_MENU_HINTS.open, onSelect: () => rowRef.current?.querySelector<HTMLAnchorElement>("a[data-request-title]")?.click() },
    ...(peek ? [{ id: "peek", label: "Preview", icon: <PanelRight />, shortcut: ROW_MENU_HINTS.peek, onSelect: () => peek(request.id) }] : []),
  ] : []
  // #133: the one journey status and, while Measuring, the due tag (the row's name reads both).
  const journey = rowJourney(request)
  const status = statusOfJourney(journey)
  const now = useDueNow()
  const due = rowDue(request, now)
  // #77: open concerns from saved reviews, on Open rows only. The row's name already reads it, so the marker is not read twice.
  const concerns = concernMarker(request)
  const priorityLabel = identity ? REQUEST_PRIORITY_LABELS[identity.priority] : ""
  // An open row menu keeps the row lit while the pointer is on the menu.
  const [menuOpen, setMenuOpen] = useState(false)
  // Compact rows carry only saved facts; an unset type or Project is not one.
  const unset = (key: string) => key === "requestType" ? !requestLabelKeys(request).length : key === "project" ? !request.projectId : false
  // Plan item 2.4 (decision 8.24): an APG grid row. The row is the one tab
  // stop and carries every value in its name; each control inside it is
  // tabIndex -1 and stays reachable through the row menu or a key. The previewed row names the preview it controls.
  const row = <div ref={rowRef} role="row" aria-level={level} aria-selected={checked} aria-current={previewed || undefined} aria-controls={previewed ? REQUEST_PREVIEW_ID : undefined} aria-label={requestRowLabel(request, identity, labels.map(label => label.name), now)} tabIndex={tabbable ? 0 : -1}
    id={`request-row-${request.id}`} data-grid-row={`r:${request.id}`} data-request-id={request.id}
    className={styles.row} data-pressable="" data-compact-row={presentation ? "true" : undefined} data-selected={checked || undefined} data-previewed={previewed || undefined} data-menu-open={menuOpen || undefined}
    {...rest.focus} {...rest.pointer}>
    <div role="gridcell" className={styles.selectCell}>
      <Checkbox tabIndex={-1} checked={checked} disabled={disabled} onCheckedChange={value => onCheckedChange(value === true)} aria-label={`Select ${request.reframedProblem ?? request.title}`} />
    </div>
    <div role="gridcell" className={styles.rowContent}>
    {code && <span className={styles.requestCode} data-request-code>{code}</span>}
    {identity && visibility.status !== false && <GlyphMenu label="Request status" items={actionItems.find(item => item.id === "status")?.children ?? []} tip={`Status: ${status.label}`}>
        <button type="button" tabIndex={-1} className={styles.identityControl} data-status={journey.status} aria-haspopup="menu" aria-label={`Status: ${status.label}`}><StatusGlyph status={journey.status} /></button>
      </GlyphMenu>}
    {columns[0].render(request)}
    {/* #240 decision 6 (A213): every status shows its priority; it changes only while Open, as on Request detail. */}
    {identity && (request.canEdit
      ? <GlyphMenu label="Request priority" items={actionItems.find(item => item.id === "priority")?.children ?? []} tip={`Priority: ${priorityLabel}`}>
        <button type="button" tabIndex={-1} className={styles.identityControl} data-priority={identity.priority} aria-haspopup="menu" aria-label={`Priority: ${priorityLabel}`}><PriorityGlyph priority={identity.priority} /></button>
      </GlyphMenu>
      : <Tooltip morph="plain" content={`Priority: ${priorityLabel}`}><span className={styles.identityControl} data-priority={identity.priority} data-readonly=""><PriorityGlyph priority={identity.priority} /></span></Tooltip>)}
    {/* The sketch's reserved "waiting" token (2026-10-11): a Guest submission waiting to be taken on (#212); see request-rows.module.css. */}
    <div className={styles.properties}>
      {request.guestSubmission === "waiting" && <span data-row-property="waiting" aria-hidden="true" title={WAITING_TO_BE_TAKEN_ON}><Badge size="sm" tone="warning" className={styles.waitingBadge}><span className={styles.waitingWords}>{WAITING_TO_BE_TAKEN_ON}</span></Badge></span>}
      {concerns && <span data-row-property="concerns" aria-hidden="true"><Badge size="sm" tone="warning">{concerns}</Badge></span>}
      {due.kind !== "none" && <span data-row-property="due" aria-hidden="true"><DueTag signal={due} /></span>}
      {columns.filter(column => column.key !== "title" && (!presentation || (column.key !== "status" && !unset(column.key))) && visibility[column.key] !== false).map(column => <span key={column.key} data-row-property={column.key}>{column.render(request)}</span>)}
    </div>

    </div>
  </div>
  return presentation ? <ContextMenu label={`Request ${code || "actions"}`} items={menuItems} asChild openOnClick={false} onOpenChange={setMenuOpen}>{row}</ContextMenu> : row
}, sameRow)
