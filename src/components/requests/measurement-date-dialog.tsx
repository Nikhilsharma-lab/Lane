"use client"

import { useId, useRef, useState, type RefObject } from "react"
import { CalendarDays } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Calendar } from "@/components/arc/calendar/calendar"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { Input } from "@/components/arc/input/input"
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
  const prefix = useId()
  const fromRef = useRef<HTMLInputElement>(null)
  const toRef = useRef<HTMLInputElement>(null)
  const [wasOpen, setWasOpen] = useState(open)
  const [from, setFrom] = useState(startDate)
  const [to, setTo] = useState(endDate)
  const [endpoint, setEndpoint] = useState<"from" | "to">("from")
  const [month, setMonth] = useState(() => parseDate(startDate) ?? parseDate(endDate))
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setFrom(startDate)
      setTo(endDate)
      setEndpoint("from")
      setMonth(parseDate(startDate) ?? parseDate(endDate))
    }
  }

  const parsedFrom = parseDate(from)
  const parsedTo = parseDate(to)
  const reversed = Boolean(parsedFrom && parsedTo && parsedTo < parsedFrom)
  const fromError = from && !parsedFrom ? "Enter a valid From date." : undefined
  const toError = to && !parsedTo ? "Enter a valid To date." : reversed ? "Choose a To date on or after From." : undefined
  const canApply = Boolean(parsedFrom && parsedTo && !reversed)

  function selectDate(date: Date) {
    const value = formatDate(date)
    if (endpoint === "from") {
      setFrom(value)
      setEndpoint("to")
      toRef.current?.focus()
      setMonth(date)
    } else {
      setTo(value)
    }
  }

  function focusEndpoint(next: "from" | "to") {
    setEndpoint(next)
    const date = next === "from" ? parsedFrom : parsedTo
    if (date) setMonth(date)
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Custom measurement dates" className={styles.dialog} overlayClassName={styles.overlay} aria-describedby={undefined}
      onOpenAutoFocus={event => { event.preventDefault(); fromRef.current?.focus() }}
      onCloseAutoFocus={event => {
        if (returnFocusRef?.current) { event.preventDefault(); returnFocusRef.current.focus() }
      }}
      onKeyDown={event => event.stopPropagation()}
      onEscapeKeyDown={event => event.stopPropagation()}>
      <div className={styles.body}>
        <div className={styles.fields}>
          <div className={styles.field}>
            <label id={`${prefix}-from-label`} htmlFor={`${prefix}-from`} className={styles.label}><CalendarDays aria-hidden="true" />From</label>
            <Input ref={fromRef} id={`${prefix}-from`} label="From" hideLabel type="date" value={from} className={styles.dateInput}
              aria-labelledby={`${prefix}-from-label`}
              data-active={endpoint === "from" || undefined} error={fromError} onFocus={() => focusEndpoint("from")}
              onChange={event => { setFrom(event.target.value); const date = parseDate(event.target.value); if (date) setMonth(date) }} />
          </div>
          <div className={styles.field}>
            <label id={`${prefix}-to-label`} htmlFor={`${prefix}-to`} className={styles.label}><CalendarDays aria-hidden="true" />To</label>
            <Input ref={toRef} id={`${prefix}-to`} label="To" hideLabel type="date" value={to} min={parsedFrom ? from : undefined} className={styles.dateInput}
              aria-labelledby={`${prefix}-to-label`}
              data-active={endpoint === "to" || undefined} error={toError} onFocus={() => focusEndpoint("to")}
              onChange={event => { setTo(event.target.value); const date = parseDate(event.target.value); if (date) setMonth(date) }} />
          </div>
        </div>
        <div className={styles.calendar}>
          <p className={styles.calendarPrompt} role="status">Choose {endpoint === "from" ? "From" : "To"} date</p>
          <Calendar value={endpoint === "from" ? parsedFrom : parsedTo} month={month} onMonthChange={setMonth}
            minDate={endpoint === "to" ? parsedFrom : undefined} onChange={selectDate} />
        </div>
        <div className={styles.actions}>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="sm" disabled={!canApply} onClick={() => {
            if (!canApply) return
            onApply(from, to)
            onOpenChange(false)
          }}>Apply dates</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
