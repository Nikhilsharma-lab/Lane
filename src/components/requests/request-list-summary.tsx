"use client"

import { useEffect, useRef, useState } from "react"
import { m, useIsPresent, useReducedMotion, type Transition } from "motion/react"
import { X } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { ChipGroup } from "@/components/arc/chip-group/chip-group"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import { rowJourney, type OverviewRequest } from "@/lib/request-overview"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import { requestLabelKeys } from "@/lib/request-labels"
import { useWorkspaceLabels } from "./workspace-labels"
import { statusOf } from "./tasks/statuses"
import buttonStyles from "@/components/arc/button/button.module.css"
import styles from "./tasks/data-table-toolbar.module.css"

const dimensions = [{ value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "requestType", label: "Labels" }]
type Dimension = "status" | "project" | "requestType"
// Plan item 2.4 (plan §2.3): the summary overlays the list and moves on transform only,
// entering in 240 ms on the enter curve and leaving in 180 ms on the exit curve, like every Arc Dialog.
const enter: Transition = { duration: motionTokens.duration.standard, ease: [...motionTokens.ease.enter] as [number, number, number, number] }
const leave: Transition = { duration: motionTokens.duration.exit, ease: [...motionTokens.ease.exit] as [number, number, number, number] }

/** A breakdown of the currently matching list, before pagination. No new record data. */
export function RequestListSummary({ rows, filter, project, requestType, onFilter, onClose }: {
  rows: OverviewRequest[]; filter: RequestStatusFilter; project: string; requestType: string;
  onFilter: (field: Dimension, value: string) => void; onClose: () => void;
}) {
  const { labels } = useWorkspaceLabels()
  const panel = useRef<HTMLElement>(null)
  const reduced = !!useReducedMotion()
  const present = useIsPresent()
  useEffect(() => { if (present) panel.current?.focus({ preventScroll: true }) }, [present])
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
  // The viewport only clips; it animates nothing, and AnimatePresence still waits for the panel's exit.
  return <m.div className={styles.summaryViewport} inert={!present} aria-hidden={!present || undefined}>
    <m.section ref={panel} tabIndex={-1} className={styles.summary} role="region" aria-label="List summary"
      initial={reduced ? { opacity: 0 } : { x: "104%" }} animate={{ x: "0%", opacity: 1 }} exit={reduced ? { opacity: 0 } : { x: "104%", transition: leave }}
      transition={reduced ? { duration: motionTokens.duration.instant } : enter} onKeyDown={event => {
    if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <div className={styles.summaryHeading}>
      <ChipGroup className={styles.summaryDimensions} label="Summarize Requests by" options={dimensions} multiple={false} value={[dimension]} onValueChange={values => { if (values[0]) setDimension(values[0] as Dimension) }} />
      <Button className={styles.summaryClose} variant="ghost" size="sm" aria-label="Close list summary" onClick={onClose}><X data-icon-size="sm" aria-hidden="true" /></Button>
    </div>
    <p className={`${styles.summaryCount} ${styles.summaryTotal}`}>{rows.length} matching {rows.length === 1 ? "Request" : "Requests"}</p>
    <div className={styles.summaryRows}>{Array.from(counts, ([value, item]) => <button key={value} type="button" className={`${buttonStyles.button} ${buttonStyles.ghost} ${styles.summaryRow}`} aria-pressed={active === value}
      aria-label={`Filter ${label}: ${item.label}, ${item.count} ${item.count === 1 ? "Request" : "Requests"}`} onClick={() => onFilter(dimension, active === value ? "" : value)}>
      <span>{item.label}</span><span>{item.count}</span>
    </button>)}</div>
    {!rows.length && <p className={styles.summaryCount}>Clear a filter to see Requests here.</p>}
  </m.section></m.div>
}
