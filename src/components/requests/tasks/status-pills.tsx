"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { ChipGroup } from "@/components/arc/chip-group/chip-group"
import { DropdownMenu } from "@/components/arc/dropdown-menu/dropdown-menu"
import { isRequestStatusFilter, type RequestStatusFilter } from "@/lib/request-workspace"
import styles from "./data-table-toolbar.module.css"

export const statusViews: { value: RequestStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const GAP = 8 // the chip group's --space-2 gap
const noop = () => {}

/** The status views stay on one row. Views that no longer fit fold into a
 * "N more" menu from the right, the current view is never hidden, and at the
 * narrowest widths the current view itself opens the menu. Widths come from an
 * inert copy of the full row that is never squeezed, so a folded row can
 * always grow back. */
export function StatusPills({ filter, onStatusChange }: { filter: RequestStatusFilter; onStatusChange: (value: RequestStatusFilter) => void }) {
  const frame = useRef<HTMLDivElement>(null)
  const measure = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(statusViews.length)

  const current = statusViews.find(view => view.value === filter) ?? statusViews[0]
  const visible = fit >= statusViews.length ? statusViews : (() => {
    const shown = statusViews.slice(0, fit)
    if (fit > 0 && !shown.includes(current)) shown[fit - 1] = current
    return shown
  })()
  const hidden = statusViews.filter(view => !visible.includes(view))

  useLayoutEffect(() => {
    const node = frame.current, sample = measure.current
    if (!node || !sample) return
    const compute = () => {
      const chips = Array.from(sample.querySelectorAll<HTMLElement>("button[data-chip]"), chip => chip.getBoundingClientRect().width)
      const trigger = sample.querySelector<HTMLElement>("[data-status-more] button")?.getBoundingClientRect().width ?? 0
      if (chips.length !== statusViews.length || !trigger) return
      const available = node.clientWidth
      const total = chips.reduce((sum, width, index) => sum + width + (index ? GAP : 0), 0)
      if (total <= available) { setFit(statusViews.length); return }
      // Fold from the right until the shown chips and the menu trigger fit.
      let used = 0, count = 0
      for (const [index, width] of chips.entries()) {
        const next = used + (index ? GAP : 0) + width
        if (next + GAP + trigger > available) break
        used = next; count = index + 1
      }
      setFit(count)
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(node)
    observer.observe(sample) // font swaps and selection changes resize the sample
    return () => observer.disconnect()
  }, [])

  const choose = (value: string) => { if (isRequestStatusFilter(value) && value !== filter) onStatusChange(value) }
  const menu = (views: typeof statusViews) => views.map(view => ({ label: view.label, onSelect: () => choose(view.value) }))

  return <div ref={frame} className={styles.statusRow} role="group" aria-label="Request status">
    {fit === 0
      ? <span data-status-more className={styles.statusMore}><DropdownMenu label={current.label} items={menu(statusViews.filter(view => view !== current))} /></span>
      : <>
        <ChipGroup label="Status views" options={visible} value={[filter]} multiple={false} onValueChange={values => choose(values[0] ?? "all")} />
        {hidden.length > 0 && <span data-status-more className={styles.statusMore}><DropdownMenu label={`${hidden.length} more`} items={menu(hidden)} /></span>}
      </>}
    {/* Invisible, inert copy of the full row: the source of natural widths. */}
    <div ref={measure} className={styles.statusMeasure} aria-hidden="true" inert>
      <ChipGroup label="Status views (measurement)" options={statusViews} value={[filter]} multiple={false} onValueChange={noop} />
      <span data-status-more className={styles.statusMore}><DropdownMenu label="3 more" items={[]} /></span>
    </div>
  </div>
}
