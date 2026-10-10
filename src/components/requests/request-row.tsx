"use client"

import { cloneElement, useEffect, useId, useRef, useState, type FocusEvent, type ReactElement } from "react"
import { Check, Copy, Ellipsis, RotateCcw } from "lucide-react"
import { formatRequestCode } from "@/lib/request-code"
import type { OverviewRequest } from "@/lib/request-overview"
import { REQUEST_PRIORITY_LABELS } from "@/lib/request-properties"
import type { RequestProjectFilter, RequestStatusFilter } from "@/lib/request-workspace"
import type { RequestColumn } from "./tasks/columns"
import styles from "./request-rows.module.css"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Button } from "@/components/arc/button/button"
import { ContextMenu, type ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { PriorityGlyph, StatusGlyph, useRequestRowPresentation } from "./row-presentation"
import { statuses } from "./tasks/statuses"

function RequestCodeControl({ code }: { code: string }) {
  const feedbackId = useId()
  const [state, setState] = useState<"idle" | "copying" | "copied" | "error">("idle")
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
    try {
      await navigator.clipboard.writeText(code)
      if (mounted.current) setState("copied")
    } catch {
      if (mounted.current) setState("error")
    } finally { inFlight.current = false }
  }

  const Icon = state === "copied" ? Check : state === "error" ? RotateCcw : Copy
  // Arc's loading button swallows repeat activation. The wrapper also prevents
  // those pending clicks from reaching any containing row navigation handler.
  // data-state keeps the copy glyph visible while a result is showing.
  return <span className={styles.savedCode} data-state={state} onClick={event => event.stopPropagation()}>
    <Tooltip content={state === "copied" ? "Copied. Copy again" : state === "error" ? "Retry copying code" : "Copy code"}>
      <Button type="button" variant="ghost" size="sm" className={styles.codeButton}
        aria-label={`Copy code ${code}`} aria-describedby={feedbackId}
        loading={state === "copying"} onClick={() => { void copyCode() }}>
        <span data-request-code>{code}</span><Icon size={14} strokeWidth={1.75} aria-hidden="true" />
      </Button>
    </Tooltip>
    <span id={feedbackId} role="status" className={state === "error" ? styles.codeError : "sr-only"}>
      {state === "copied" ? `${code} copied.` : state === "error" ? "Copy failed. Try again." : state === "copying" ? `Copying ${code}.` : ""}
    </span>
  </span>
}

/** A glyph button that explains itself on hover and opens its menu on click.
 * Arc's ContextMenu clones one element and the Radix tooltip slots into one
 * element, so a layout-free span carries the menu handlers while the button
 * keeps focus, the tooltip and the menu's return focus. */
function GlyphMenu({ label, items, tip, onOpenChange, children }: { label: string; items: ContextMenuItem[]; tip: string; onOpenChange?: (open: boolean) => void; children: ReactElement<{ "aria-expanded"?: boolean; onFocus?: (event: FocusEvent<HTMLButtonElement>) => void }> }) {
  // The span receives the menu's expanded state; the button is what assistive tech reads, so it repeats it.
  const [open, setOpen] = useState(false)
  return <ContextMenu label={label} items={items} asChild onOpenChange={next => { setOpen(next); onOpenChange?.(next) }}>
    <span className={styles.menuSlot}><Tooltip content={tip}>{cloneElement(children, {
      "aria-expanded": open,
      // The menu hands focus back to the button when it closes. Radix opens the tooltip on
      // any focus unless the handler before it prevents default, so only keyboard focus does.
      onFocus: event => { children.props.onFocus?.(event); if (!event.currentTarget.matches(":focus-visible")) event.preventDefault() },
    })}</Tooltip></span>
  </ContextMenu>
}

export function RequestRow({ request, columns, visibility, filter, projectFilter, checked, disabled, onCheckedChange }: {
  request: OverviewRequest
  columns: RequestColumn[]
  visibility: Record<string, boolean>
  filter: RequestStatusFilter
  projectFilter: RequestProjectFilter
  checked: boolean
  disabled: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const presentation = useRequestRowPresentation()
  const identity = presentation?.identities[request.id]
  const savedCode = request.requestNumber === undefined ? null : formatRequestCode(request.requestNumber)
  const code = savedCode ?? identity?.code ?? ""
  const menuItems = presentation?.menuItems(request) ?? []
  const status = statuses.find(item => item.value === request.status)!
  const priorityLabel = identity ? REQUEST_PRIORITY_LABELS[identity.priority] : ""
  // An open row menu keeps the row lit and its menu button shown while the pointer is on the menu.
  const [menuOpen, setMenuOpen] = useState(false)
  // Compact rows carry only saved facts; an unset type or Project is not one.
  const unset = (key: string) => key === "requestType" ? !request.requestType : key === "project" ? !request.projectId : false
  const row = <li className={styles.row} data-compact-row={presentation ? "true" : undefined} tabIndex={presentation ? -1 : undefined} data-request-id={request.id} data-selected={checked || undefined} data-menu-open={menuOpen || undefined}>
    <Checkbox checked={checked} disabled={disabled} onCheckedChange={value => onCheckedChange(value === true)} aria-label={`Select ${request.reframedProblem ?? request.title}`} />
    <div className={styles.rowContent}>
    {identity &&
      <GlyphMenu label="Request priority" items={menuItems.find(item => item.id === "priority")?.children ?? []} tip={`Priority: ${priorityLabel}`}>
        <button type="button" className={styles.identityControl} data-priority={identity.priority} aria-haspopup="menu" aria-label={`Priority: ${priorityLabel}`}><PriorityGlyph priority={identity.priority} /></button>
      </GlyphMenu>
    }
    {savedCode ? <RequestCodeControl key={savedCode} code={savedCode} /> : identity ? <span className={styles.requestCode} data-request-code>{identity.code}</span> : null}
    {identity && visibility.status !== false && <GlyphMenu label="Request status" items={menuItems.find(item => item.id === "status")?.children ?? []} tip={`Status: ${status.label}`}>
        <button type="button" className={styles.identityControl} data-status={request.status} aria-haspopup="menu" aria-label={`Status: ${status.label}`}><StatusGlyph status={request.status} /></button>
      </GlyphMenu>}
    {columns[0].render(request, filter, projectFilter)}
    <div className={styles.properties}>
      {columns.filter(column => column.key !== "title" && (!presentation || (column.key !== "status" && !unset(column.key))) && visibility[column.key] !== false).map(column => <span key={column.key} data-row-property={column.key}>{column.render(request, filter, projectFilter)}</span>)}
    </div>
    {presentation && <GlyphMenu label={`Request ${code} actions`} items={menuItems} tip="More actions" onOpenChange={setMenuOpen}>
      <button type="button" className={styles.rowMenu} aria-haspopup="menu" aria-label={`More actions for ${code}`}><Ellipsis size={16} strokeWidth={1.75} aria-hidden="true" /></button>
    </GlyphMenu>}
    </div>
  </li>
  return presentation ? <ContextMenu label={`Request ${code || "actions"}`} items={menuItems} asChild openOnClick={false} onOpenChange={setMenuOpen}>{row}</ContextMenu> : row
}
