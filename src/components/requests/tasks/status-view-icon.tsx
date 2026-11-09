import type { SVGProps } from "react"
import { CalendarClock, Hourglass, Rows3 } from "lucide-react"
import type { RequestStatusFilter } from "@/lib/request-workspace"
import { StatusGlyph } from "../status-glyph"

/**
 * #133: each status view's glyph, the one map the status pills, their "N more" menu, Add filter's Status and the
 * pills' empty lines draw: every Request, a journey status's own glyph, Due soon or overdue, and Guest submissions
 * waiting to be taken on.
 */
export function StatusViewIcon({ view, ...props }: { view: RequestStatusFilter } & SVGProps<SVGSVGElement>) {
  return view === "all" ? <Rows3 {...props} /> : view === "due" ? <CalendarClock {...props} /> : view === "waiting" ? <Hourglass {...props} /> : <StatusGlyph status={view} {...props} />
}
