"use client"

import { useRef, useState, type RefObject } from "react"
import { DateRangePicker } from "@/components/date-range-picker-lazy"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import styles from "./measurement-date-dialog.module.css"

/** Parse a date in the viewer's local calendar, without UTC shifting its day. */
function parseDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const [year, month, day] = value.split("-").map(Number)
  if (year < 1) return undefined
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined
}

function formatDate(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function MeasurementDateDialog({ open, startDate, endDate, onOpenChange, onApply, returnFocusRef }: {
  open: boolean
  startDate: string
  endDate: string
  onOpenChange: (open: boolean) => void
  onApply: (startDate: string, endDate: string) => void
  returnFocusRef?: RefObject<HTMLButtonElement | null>
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // Arc can reopen during its exit without unmounting. Each opening starts with
  // committed dates, while the previous panel stays intact throughout its exit.
  const [session, setSession] = useState({ open, version: 0 })
  if (session.open !== open) setSession({ open, version: session.version + (open ? 1 : 0) })
  const start = parseDate(startDate)
  const end = parseDate(endDate)
  const value = start && end && end >= start ? { start, end } : null

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Measurement date range" className={styles.dialog} overlayClassName={styles.overlay} aria-describedby={undefined}
      onOpenAutoFocus={event => {
        // The calendar focuses its own day once it has loaded; until then Radix's default keeps focus inside the dialog.
        const day = bodyRef.current?.querySelector<HTMLButtonElement>('[data-current] [data-date][tabindex="0"]')
        if (!day) return
        event.preventDefault()
        day.focus({ preventScroll: true })
      }}
      onCloseAutoFocus={event => {
        if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus() }
      }}
      onKeyDown={event => event.stopPropagation()}
      onEscapeKeyDown={event => event.stopPropagation()}>
      <div ref={bodyRef}>
        <DateRangePicker key={session.version} embedded label="Measurement dates" value={value} presets={[]} boundary={() => bodyRef.current}
          onCancel={() => onOpenChange(false)}
          onChange={range => {
            onApply(formatDate(range.start), formatDate(range.end))
            onOpenChange(false)
          }} />
      </div>
    </DialogContent>
  </Dialog>
}
