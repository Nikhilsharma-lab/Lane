export type RequestStatus = "open" | "in_progress" | "done"
export type LifecycleMove = "pick-up" | "done"
export type AllowedMove = { move: LifecycleMove; to: "in_progress" | "done"; label: "Pick up" | "Mark Done" }
/** Who asks. Profile labels never gate actions (AGENTS.md); only the Clerk role does today. */
export type MoveViewer = { isGuest: boolean }

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
