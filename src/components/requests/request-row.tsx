"use client"

import { useRequestLabels } from "./request-labels"
import { requestLabelKeys } from "@/lib/request-labels"
import { memo, useEffect, useId, useRef, useState } from "react"
import { Check, Copy, RotateCcw } from "lucide-react"
import { formatRequestCode } from "@/lib/request-code"
import type { OverviewRequest } from "@/lib/request-overview"
import { REQUEST_PRIORITY_LABELS } from "@/lib/request-constants"
import { requestDetailHref, type RequestProjectFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import { ROW_MENU_HINTS } from "@/lib/keyboard-shortcuts"
import type { RequestColumn } from "./tasks/columns"
import { useIntentPrefetch } from "./use-intent-prefetch"
import { GlyphMenu } from "./glyph-menu"
import { requestRowLabel } from "./request-row-label"
import styles from "./request-rows.module.css"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Button } from "@/components/arc/button/button"
import { ContextMenu, type ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { PriorityGlyph, StatusGlyph, useRequestRowPresentation } from "./row-presentation"
import { statuses } from "./tasks/statuses"
import { useListAnnouncer } from "./list-announcer"
import { useRequestPeekOpener } from "./request-peek"

function RequestCodeControl({ code }: { code: string }) {
  const feedbackId = useId()
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle")
  // Plan item 2.4: progress and success speak in the list's one region; only the error stays visible here.
  const announce = useListAnnouncer()
  const inFlight = useRef(false)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function copyCode() {
    if (inFlight.current) return
    inFlight.current = true
    setState("copying")
    // Said only if the clipboard is slow; a quick result replaces it unheard.
    announce(`Copying ${code}.`, { key: "copy", delay: 400 })
    try {
      await navigator.clipboard.writeText(code)
      announce(`${code} copied.`, { key: "copy" })
      if (mounted.current) setState("copied")
    } catch {
      announce("Copy failed. Try again.", { key: "copy" })
      if (mounted.current) setState("error")
    } finally { inFlight.current = false }
  }

  const Icon = state === "copied" ? Check : state === "error" ? RotateCcw : Copy
  // Arc's loading button swallows repeat activation. The wrapper also prevents
  // those pending clicks from reaching any containing row navigation handler.
  // data-state keeps the copy glyph visible while a result is showing.
  return <span className={styles.savedCode} data-state={state} onClick={event => event.stopPropagation()}>
    {/* Plan item 2.4 (decision 8.22): no blur morphs in dense rows. */}
    <Tooltip morph="plain" content={state === "copied" ? "Copied. Copy again" : state === "error" ? "Retry copying code" : "Copy code"}>
      <Button type="button" variant="ghost" size="sm" morph="plain" tabIndex={-1} className={styles.codeButton}
        aria-label={`Copy code ${code}`} aria-describedby={state === "error" ? feedbackId : undefined}
        loading={state === "copying"} onClick={() => { void copyCode() }}>
        <span data-request-code>{code}</span><Icon data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </Tooltip>
    {state === "error" && <span id={feedbackId} className={styles.codeError}>Copy failed. Try again.</span>}
  </span>
}

type RequestRowProps = {
  request: OverviewRequest
  columns: RequestColumn[]
  visibility: Record<string, boolean>
  filter: RequestStatusFilter
  projectFilter: RequestProjectFilter
  checked: boolean
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
 * selection, or the view's columns and filters (plan item 1.14). The row
 * presentation context still re-renders rows when codes or priorities change. */
function sameRow(previous: RequestRowProps, next: RequestRowProps) {
  return previous.checked === next.checked
    && previous.disabled === next.disabled
    && previous.tabbable === next.tabbable
    && previous.level === next.level
    && previous.filter === next.filter
    && previous.projectFilter === next.projectFilter
    && previous.columns === next.columns
    && shallowEqual(previous.visibility, next.visibility)
    && (previous.request === next.request || shallowEqual(previous.request, next.request))
}

export const RequestRow = memo(function RequestRow({ request, columns, visibility, filter, projectFilter, checked, disabled, tabbable = false, level, onCheckedChange }: RequestRowProps) {
  const labels = useRequestLabels(request)
  const presentation = useRequestRowPresentation()
  const identity = presentation?.identities[request.id]
  const savedCode = request.requestNumber === undefined ? null : formatRequestCode(request.requestNumber)
  const code = savedCode ?? identity?.code ?? ""
  const rowRef = useRef<HTMLDivElement>(null)
  // Plan item 2.4: keyboard focus rests on the row, so the row prefetches its detail once the person stops on it.
  const prefetch = useIntentPrefetch(requestDetailHref(request.id, "all"))
  const actionItems = presentation?.menuItems(request) ?? []
  // Plan item 2.12: Preview, where the list offers it (not on phones).
  const peek = useRequestPeekOpener()
  // The row menu names the two keys it can stand in for; nothing else carries a hint.
  const menuItems: ContextMenuItem[] = presentation ? [...actionItems,
    { id: "select", label: checked ? "Deselect" : "Select", shortcut: ROW_MENU_HINTS.select, separatorBefore: true, disabled, onSelect: () => onCheckedChange(!checked) },
    { id: "open", label: "Open Request", shortcut: ROW_MENU_HINTS.open, onSelect: () => rowRef.current?.querySelector<HTMLAnchorElement>("a[data-request-title]")?.click() },
    ...(peek ? [{ id: "peek", label: "Preview", shortcut: ROW_MENU_HINTS.peek, onSelect: () => peek(request.id) }] : []),
  ] : []
  const status = statuses.find(item => item.value === request.status)!
  const priorityLabel = identity ? REQUEST_PRIORITY_LABELS[identity.priority] : ""
  // An open row menu keeps the row lit while the pointer is on the menu.
  const [menuOpen, setMenuOpen] = useState(false)
  // Compact rows carry only saved facts; an unset type or Project is not one.
  const unset = (key: string) => key === "requestType" ? !requestLabelKeys(request).length : key === "project" ? !request.projectId : false
  // Plan item 2.4 (decision 8.24): an APG grid row. The row is the one tab
  // stop and carries every value in its name; each control inside it is
  // tabIndex -1 and stays reachable through the row menu or a key.
  const row = <div ref={rowRef} role="row" aria-level={level} aria-selected={checked} aria-label={requestRowLabel(request, identity, labels.map(label => label.name))} tabIndex={tabbable ? 0 : -1}
    id={`request-row-${request.id}`} data-grid-row={`r:${request.id}`} data-request-id={request.id}
    className={styles.row} data-compact-row={presentation ? "true" : undefined} data-selected={checked || undefined} data-menu-open={menuOpen || undefined}
    onFocus={event => { if (event.target === event.currentTarget) prefetch.schedule() }}
    onBlur={event => { if (event.target === event.currentTarget) prefetch.cancel() }}>
    <div role="gridcell" className={styles.selectCell}>
      <Checkbox tabIndex={-1} checked={checked} disabled={disabled} onCheckedChange={value => onCheckedChange(value === true)} aria-label={`Select ${request.reframedProblem ?? request.title}`} />
    </div>
    <div role="gridcell" className={styles.rowContent}>
    {identity && request.status !== "done" &&
      <GlyphMenu label="Request priority" items={actionItems.find(item => item.id === "priority")?.children ?? []} tip={`Priority: ${priorityLabel}`}>
        <button type="button" tabIndex={-1} className={styles.identityControl} data-priority={identity.priority} aria-haspopup="menu" aria-label={`Priority: ${priorityLabel}`}><PriorityGlyph priority={identity.priority} /></button>
      </GlyphMenu>
    }
    {savedCode ? <RequestCodeControl key={savedCode} code={savedCode} /> : identity ? <span className={styles.requestCode} data-request-code>{identity.code}</span> : null}
    {identity && visibility.status !== false && <GlyphMenu label="Request status" items={actionItems.find(item => item.id === "status")?.children ?? []} tip={`Status: ${status.label}`}>
        <button type="button" tabIndex={-1} className={styles.identityControl} data-status={request.status} aria-haspopup="menu" aria-label={`Status: ${status.label}`}><StatusGlyph status={request.status} /></button>
      </GlyphMenu>}
    {columns[0].render(request, filter, projectFilter)}
    {/* Sketch reservation (2026-10-11): a later "waiting" token joins these as data-row-property="waiting"; see request-rows.module.css. */}
    <div className={styles.properties}>
      {columns.filter(column => column.key !== "title" && (!presentation || (column.key !== "status" && !unset(column.key))) && visibility[column.key] !== false).map(column => <span key={column.key} data-row-property={column.key}>{column.render(request, filter, projectFilter)}</span>)}
    </div>

    </div>
  </div>
  return presentation ? <ContextMenu label={`Request ${code || "actions"}`} items={menuItems} asChild openOnClick={false} onOpenChange={setMenuOpen}>{row}</ContextMenu> : row
}, sameRow)
