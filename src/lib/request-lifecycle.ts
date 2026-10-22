export type RequestStatus = "open" | "in_progress" | "done"
export type LifecycleMove = "pick-up" | "done"
export type AllowedMove = { move: LifecycleMove; to: "in_progress" | "done"; label: "Pick up" | "Mark Done" }
/** Who asks. Profile labels never gate actions (AGENTS.md); only the Clerk role does today. */
export type MoveViewer = { isGuest: boolean }

/**
 * The edit rule (priority and the Request's own fields): Open, and the viewer is an admin or created it.
 * The row menu, the detail panel and the ⌘K palette share it; lib/data/requests.ts computes the same for
 * list rows as `canEdit`. The viewer's role is the caller's to apply, as allowedMove's is.
 */
export function canEditRequest(request: { status: RequestStatus; createdBy: string | null }, viewer: { id: string; isAdmin?: boolean }): boolean {
  return request.status === "open" && (Boolean(viewer.isAdmin) || request.createdBy === viewer.id)
}

const PICK_UP: AllowedMove = { move: "pick-up", to: "in_progress", label: "Pick up" }
const MARK_DONE: AllowedMove = { move: "done", to: "done", label: "Mark Done" }

/**
 * The one lifecycle move this viewer may make now, or null. The row menu, the
 * bulk bar and the detail strip read only this (plan item 2.4). The later
 * alignment guard (sketch "2.4 list") widens the parameters and changes only
 * this body; the server actions keep their own guards and must gain the same
 * check then.
 */
export function allowedMove(request: { status: RequestStatus; agreementBlocked?: boolean }, viewer: MoveViewer): AllowedMove | null {
  if (request.agreementBlocked) return null
  if (viewer.isGuest) return null
  if (request.status === "open") return PICK_UP
  if (request.status === "in_progress") return MARK_DONE
  return null
}
