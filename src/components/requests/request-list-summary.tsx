"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { AnimatePresence, m, useIsPresent, useReducedMotion } from "motion/react"
import { X } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { ChipGroup } from "@/components/arc/chip-group/chip-group"
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { usePhonePanel } from "@/lib/use-media-query"
import { rowJourney, type OverviewRequest } from "@/lib/request-overview"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import { requestLabelKeys } from "@/lib/request-labels"
import { useWorkspaceLabels } from "./workspace-labels"
import { statusOf } from "./tasks/statuses"
import { panelSlide } from "./request-peek"
import buttonStyles from "@/components/arc/button/button.module.css"
import styles from "./tasks/data-table-toolbar.module.css"

const dimensions = [{ value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "requestType", label: "Labels" }]
type Dimension = "status" | "project" | "requestType"
type SummaryProps = {
  rows: OverviewRequest[]; filter: RequestStatusFilter; project: string; requestType: string;
  onFilter: (field: Dimension, value: string) => void; onClose: () => void;
}

/**
 * A231 (#240 decision 4): the list summary. On desktop it is the second panel beside the list, in the preview's
 * place (the two replace each other), and narrows the list; on a phone it is the Build 2 bottom panel.
 */
export function RequestListSummary({ open, ...props }: SummaryProps & { open: boolean }) {
  // The popups' own switch (popup-behaviour.tsx): under 640px the summary is the phone's bottom panel.
  const phone = usePhonePanel()
  if (phone) return <Dialog open={open} onOpenChange={next => { if (!next) props.onClose() }}>
    <DialogContent title="List summary"><SummaryBody {...props} /></DialogContent>
  </Dialog>
  return <AnimatePresence initial={false}>{open && <SummaryPanel key="summary" {...props} />}</AnimatePresence>
}

function SummaryPanel(props: SummaryProps) {
  const { onClose } = props
  const panel = useRef<HTMLElement>(null)
  const reduced = !!useReducedMotion()
  const present = useIsPresent()
  useEffect(() => { if (present) panel.current?.focus({ preventScroll: true }) }, [present])
  // Leaving, the panel gives its column back at once and slides out over the list's edge, as the preview does.
  return <div className={styles.summaryViewport} inert={!present} aria-hidden={!present || undefined} data-leaving={!present || undefined}>
    <m.section ref={panel} tabIndex={-1} className={styles.summary} role="region" aria-label="List summary"
      {...panelSlide(reduced)} onKeyDown={event => {
    if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <SummaryBody {...props} close={<Button className={styles.summaryClose} variant="ghost" size="sm" aria-label="Close list summary" onClick={onClose}><X data-icon-size="sm" aria-hidden="true" /></Button>} />
  </m.section></div>
}

/** A breakdown of every Request the list matches, shown or not. No new record data. */
function SummaryBody({ rows, filter, project, requestType, onFilter, close }: SummaryProps & { close?: ReactNode }) {
  const { labels } = useWorkspaceLabels()
  const [dimension, setDimension] = useState<Dimension>("status")
  const counts = new Map<string, { label: string; count: number }>()
  for (const row of rows) {
    if (dimension === "requestType") {
      for (const key of requestLabelKeys(row).length ? requestLabelKeys(row) : ["none"]) counts.set(key, { label: key === "none" ? "No labels" : labels.find(label => label.id === key)?.name ?? "Saved label", count: (counts.get(key)?.count ?? 0) + 1 })
      continue
    }
    const value = dimension === "status" ? rowJourney(row).status : dimension === "project" ? row.projectId ?? "none" : row.requestType ?? "none"
    const label = dimension === "status" ? statusOf(rowJourney(row).status).label
      : dimension === "project" ? row.projectName ?? (row.projectId ? "Unavailable Project" : "No Project")
        : "No labels"
    counts.set(value, { label, count: (counts.get(value)?.count ?? 0) + 1 })
  }
  const active = dimension === "status" ? filter : dimension === "project" ? project : requestType
  const label = dimensions.find(item => item.value === dimension)!.label
  // The header: the dimensions, and on desktop the × in its top corner (on a phone the panel's own × is there).
  return <>
    <div className={styles.summaryHeading}>
      <ChipGroup className={styles.summaryDimensions} label="Summarize Requests by" options={dimensions} multiple={false} value={[dimension]} onValueChange={values => { if (values[0]) setDimension(values[0] as Dimension) }} />
      {close}
    </div>
    <p className={styles.summaryCount}>{rows.length} matching {rows.length === 1 ? "Request" : "Requests"}</p>
    <div className={styles.summaryRows}>{Array.from(counts, ([value, item]) => <button key={value} type="button" className={`${buttonStyles.button} ${buttonStyles.ghost} ${styles.summaryRow}`} aria-pressed={active === value}
      aria-label={`Filter ${label}: ${item.label}, ${item.count} ${item.count === 1 ? "Request" : "Requests"}`} onClick={() => onFilter(dimension, active === value ? "" : value)}>
      <span>{item.label}</span><span>{item.count}</span>
    </button>)}</div>
    {!rows.length && <p className={styles.summaryCount}>Clear a filter to see Requests here.</p>}
  </>
}
