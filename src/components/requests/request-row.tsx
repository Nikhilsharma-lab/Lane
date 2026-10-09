"use client"

import { useEffect, useId, useRef, useState } from "react"
import { Check, Copy, RotateCcw } from "lucide-react"
import { formatRequestCode } from "@/lib/request-code"
import type { OverviewRequest } from "@/lib/request-overview"
import type { RequestProjectFilter, RequestStatusFilter } from "@/lib/request-workspace"
import type { RequestColumn } from "./tasks/columns"
import styles from "./request-rows.module.css"
import { Checkbox } from "@/components/arc/checkbox/checkbox"
import { Button } from "@/components/arc/button/button"
import { ContextMenu } from "@/components/arc/context-menu/context-menu"
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
  return <span className={styles.savedCode} onClick={event => event.stopPropagation()}>
    <Button type="button" variant="ghost" size="sm" className={styles.codeButton}
      aria-label={`Copy code ${code}`} aria-describedby={feedbackId}
      title={state === "copied" ? "Copied. Copy again" : state === "error" ? "Retry copying code" : "Copy code"}
      loading={state === "copying"} onClick={() => { void copyCode() }}>
      <span data-request-code>{code}</span><Icon size={14} strokeWidth={1.75} aria-hidden="true" />
    </Button>
    <span id={feedbackId} role="status" className={state === "error" ? styles.codeError : "sr-only"}>
      {state === "copied" ? `${code} copied.` : state === "error" ? "Copy failed. Try again." : state === "copying" ? `Copying ${code}.` : ""}
    </span>
  </span>
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
  const menuItems = presentation?.menuItems(request) ?? []
  const status = statuses.find(item => item.value === request.status)!
  const row = <li className={styles.row} data-compact-row={presentation ? "true" : undefined} tabIndex={presentation ? -1 : undefined} data-request-id={request.id} data-selected={checked || undefined}>
    <Checkbox checked={checked} disabled={disabled} onCheckedChange={value => onCheckedChange(value === true)} aria-label={`Select ${request.reframedProblem ?? request.title}`} />
    <div className={styles.rowContent}>
    {identity &&
      <ContextMenu label="Request priority" items={menuItems.find(item => item.id === "priority")?.children ?? []} asChild>
        <button type="button" className={styles.identityControl} data-priority={identity.priority} aria-label={`Priority: ${identity.priority === "none" ? "No priority" : identity.priority}`}><PriorityGlyph priority={identity.priority} /></button>
      </ContextMenu>
    }
    {savedCode ? <RequestCodeControl key={savedCode} code={savedCode} /> : identity ? <span className={styles.requestCode} data-request-code>{identity.code}</span> : null}
    {identity && visibility.status !== false && <ContextMenu label="Request status" items={menuItems.find(item => item.id === "status")?.children ?? []} asChild>
        <button type="button" className={styles.identityControl} data-status={request.status} aria-label={`Status: ${status.label}`}><StatusGlyph status={request.status} /></button>
      </ContextMenu>}
    {columns[0].render(request, filter, projectFilter)}
    <div className={styles.properties}>
      {columns.filter(column => column.key !== "title" && (!presentation || column.key !== "status") && visibility[column.key] !== false).map(column => <span key={column.key} data-row-property={column.key}>{column.render(request, filter, projectFilter)}</span>)}
    </div>
    </div>
  </li>
  return presentation ? <ContextMenu label={`Request ${savedCode ?? identity?.code ?? "actions"}`} items={menuItems} asChild openOnClick={false}>{row}</ContextMenu> : row
}
