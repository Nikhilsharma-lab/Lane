"use client"

import { CalendarClock, Hourglass } from "lucide-react"
import { EmptyState } from "@/components/arc/empty-state/empty-state"
import { Button } from "@/components/arc/button/button"
import buttonStyles from "@/components/arc/button/button.module.css"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import { NewRequestLink } from "./new-request-link"
import { StatusGlyph } from "./status-glyph"
import type { ListEmptyLine } from "./list-empty-state"
import styles from "./list-empty-state.module.css"

const iconFor = (status: RequestStatusFilter) => status === "due" ? <CalendarClock data-icon-size="2xl" strokeWidth={1.5} />
  : status === "waiting" ? <Hourglass data-icon-size="2xl" strokeWidth={1.5} />
  : status === "all" ? undefined : <StatusGlyph status={status} data-icon-size="2xl" />

/** The list's empty line (list-empty-state.ts) in Arc's empty state: a status pill's line carries its status glyph. */
export function ListEmptyState({ line, status, onClear }: { line: Exclude<ListEmptyLine, { kind: "welcome" }>; status: RequestStatusFilter; onClear: () => void }) {
  const action = line.newRequest ? <NewRequestLink className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>New Request</NewRequestLink>
    : line.clearFilters ? <Button variant="secondary" onClick={onClear}>Clear filters</Button> : undefined
  return <EmptyState title={line.title} description={line.description} action={action} icon={line.kind === "status" ? iconFor(status) : undefined}
    className={line.description ? undefined : styles.oneLine} />
}
