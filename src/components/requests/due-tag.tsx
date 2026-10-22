"use client"

import { useEffect, useState, type HTMLAttributes } from "react"
import { CalendarClock } from "lucide-react"
import { Badge } from "@/components/arc/badge/badge"
import type { DueSignal } from "@/lib/request-journey"

/**
 * The due tag (#133): "Due in N days", "Due today" or "Overdue N days" for a Measuring Request whose
 * result is due soon, today or overdue (`dueSignal` in request-journey.ts), and nothing otherwise.
 * Always words, and always the warning tone: overdue is neutral, never an error or danger tone.
 * Used by the list row, the board, the peek and the Request page.
 */
export function DueTag({ signal, ...props }: { signal: DueSignal } & HTMLAttributes<HTMLSpanElement>) {
  if (signal.kind === "none") return null
  return <Badge size="sm" tone="warning" icon={<CalendarClock data-icon-size="xs" aria-hidden="true" />} data-due={signal.kind} {...props}>{signal.label}</Badge>
}

const msToNextUtcDay = (now: Date) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()

/** Now, for due tags: the same instant through a render, moved on at each UTC midnight so a tag left open turns over with the day. */
export function useDueNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(new Date()), msToNextUtcDay(now) + 1000)
    return () => window.clearTimeout(timer)
  }, [now])
  return now
}
