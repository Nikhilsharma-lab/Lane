import type { FinishedView } from "@/lib/request-workspace"
import type { ListGroup } from "./list-view-model"

/**
 * A212 and #275: the older-finished read that brings a group up to the count it should show, or null. A reload of an
 * address that showed more of a finished group reads until the group holds that many again, and a Show more whose
 * read added none of its group's Requests (a Project's older ones may sit further back) reads on, so each Show more
 * adds rows or goes. One read at a time; after a failed one, Show more tries again. Loaded after the page, with
 * list-motion.ts.
 */
export function readToFill(groups: ListGroup[], shownCounts: Record<string, number>, older: Pick<OlderFill, "pending" | "error">): FinishedView | null {
  if (older.pending || older.error) return null
  return groups.find(group => group.older && (shownCounts[group.key] ?? 0) > group.rows.length)?.older ?? null
}

/** The older-finished reads as the list holds them (requests-overview.tsx). */
export type OlderFill = { pending: FinishedView | null; error: unknown; load: (read: FinishedView) => void }

/** After each change to the list: starts the read that fills a group, if one is due. */
export function fillGroups(groups: ListGroup[], shownCounts: Record<string, number>, older: OlderFill) {
  const read = readToFill(groups, shownCounts, older)
  if (read) older.load(read)
}
