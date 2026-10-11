"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useIsPresent, useReducedMotion } from "motion/react"
import { X } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { ChipGroup } from "@/components/arc/chip-group/chip-group"
import { motionTokens } from "@/components/arc/lib/motion-tokens"
import type { OverviewRequest } from "@/lib/request-overview"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import { REQUEST_TYPE_LABELS } from "@/lib/request-constants"
import { statuses } from "./tasks/statuses"
import buttonStyles from "@/components/arc/button/button.module.css"
import styles from "./tasks/data-table-toolbar.module.css"

const dimensions = [{ value: "status", label: "Status" }, { value: "project", label: "Project" }, { value: "requestType", label: "Request type" }]
type Dimension = "status" | "project" | "requestType"
// Arc Cart drawer's critically damped physical spring preserves velocity on reversal.
const physical = (duration: number) => {
  const root = 2 * Math.PI / (duration * 1.2)
  return { type: "spring" as const, stiffness: root * root, damping: 2 * root, mass: 1 }
}
const drawerSpring = physical(.42), drawerExit = physical(.34)

/** A breakdown of the currently matching list, before pagination. No new record data. */
export function RequestListSummary({ rows, filter, project, requestType, onFilter, onClose }: {
  rows: OverviewRequest[]; filter: RequestStatusFilter; project: string; requestType: string;
  onFilter: (field: Dimension, value: string) => void; onClose: () => void;
}) {
  const panel = useRef<HTMLElement>(null)
  const reduced = !!useReducedMotion()
  const present = useIsPresent()
  useEffect(() => { if (present) panel.current?.focus({ preventScroll: true }) }, [present])
  const [dimension, setDimension] = useState<Dimension>("status")
  const counts = new Map<string, { label: string; count: number }>()
  for (const row of rows) {
    const value = dimension === "status" ? row.status : dimension === "project" ? row.projectId ?? "none" : row.requestType ?? "none"
    const label = dimension === "status" ? statuses.find(status => status.value === row.status)!.label
      : dimension === "project" ? row.projectName ?? (row.projectId ? "Unavailable Project" : "No Project")
        : row.requestType ? REQUEST_TYPE_LABELS[row.requestType] : "No type"
    counts.set(value, { label, count: (counts.get(value)?.count ?? 0) + 1 })
  }
  const active = dimension === "status" ? filter : dimension === "project" ? project : requestType
  const label = dimensions.find(item => item.value === dimension)!.label
  return <motion.div className={styles.summaryViewport} inert={!present} aria-hidden={!present || undefined}
    initial={reduced ? { width: 350, opacity: 0 } : { width: 0 }} animate={{ width: 350, opacity: 1 }}
    exit={reduced ? { opacity: 0 } : { width: 0, transition: drawerExit }} transition={reduced ? { duration: motionTokens.duration.instant } : drawerSpring}>
    <motion.section ref={panel} tabIndex={-1} className={styles.summary} role="region" aria-label="List summary"
      initial={reduced ? { opacity: 0 } : { x: "104%" }} animate={{ x: "0%", opacity: 1 }} exit={reduced ? { opacity: 0 } : { x: "104%", transition: drawerExit }}
      transition={reduced ? { duration: motionTokens.duration.instant } : drawerSpring} onKeyDown={event => {
    if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose() }
  }}>
    <div className={styles.summaryHeading}>
      <ChipGroup className={styles.summaryDimensions} label="Summarize Requests by" options={dimensions} multiple={false} value={[dimension]} onValueChange={values => { if (values[0]) setDimension(values[0] as Dimension) }} />
      <Button className={styles.summaryClose} variant="ghost" size="sm" aria-label="Close list summary" onClick={onClose}><X size={14} aria-hidden="true" /></Button>
    </div>
    <p className={styles.summaryCount} aria-live="polite">{rows.length} matching {rows.length === 1 ? "Request" : "Requests"}</p>
    <div className={styles.summaryRows}>{Array.from(counts, ([value, item]) => <button key={value} type="button" className={`${buttonStyles.button} ${buttonStyles.ghost} ${styles.summaryRow}`} aria-pressed={active === value}
      aria-label={`Filter ${label}: ${item.label}, ${item.count} ${item.count === 1 ? "Request" : "Requests"}`} onClick={() => onFilter(dimension, active === value ? "" : value)}>
      <span>{item.label}</span><span>{item.count}</span>
    </button>)}</div>
    {!rows.length && <p className={styles.summaryCount}>Clear a filter to see Requests here.</p>}
  </motion.section></motion.div>
}
