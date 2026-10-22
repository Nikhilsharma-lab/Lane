export type RequestStatus = "open" | "in_progress" | "done"
export type LifecycleMove = "pick-up" | "done"
export type AllowedMove = { move: LifecycleMove; to: "in_progress" | "done"; label: "Pick up" | "Mark Done" }
/** An offered move, and why it can't be made yet when it can't. */
export type AvailableMove = AllowedMove & { blockedReason: string | null }
/** Who asks. Profile labels never gate actions (AGENTS.md); only the Clerk role does today. */
export type MoveViewer = { isGuest: boolean }

/** What a surface knows about a Request to decide its move. `pickupBlockedReason`
 * is `measurementReadiness`, worked out where the measurement plan is loaded. */
export type LifecycleRequest = {
  status: RequestStatus
  /** Closed with a result or without one: a closed Request never advances. */
  agreementBlocked?: boolean
  pickupBlockedReason?: string | null
}

/** Each move's statuses and its copy, shared by every surface and the server. */
export const MOVES = {
  "pick-up": { move: "pick-up", from: "open", to: "in_progress", label: "Pick up", fromLabel: "Open", verb: "pick it up" },
  done: { move: "done", from: "in_progress", to: "done", label: "Mark Done", fromLabel: "In Progress", verb: "mark it Done" },
} as const

const offered = (move: LifecycleMove): AllowedMove => ({ move, to: MOVES[move].to, label: MOVES[move].label })

/**
 * The one lifecycle move this viewer is offered now, or null. The row menu, the
 * bulk bar, detail's button and its status control all read this, so they
 * offer the same move with the same reason. A move with a `blockedReason` is
 * shown but can't be made; the server refuses it with the same copy
 * (`moveRefusal`).
 */
export function availableMove(request: LifecycleRequest, viewer: MoveViewer): AvailableMove | null {
  if (request.agreementBlocked || viewer.isGuest) return null
  if (request.status === "open") return { ...offered("pick-up"), blockedReason: request.pickupBlockedReason ?? null }
  if (request.status === "in_progress") return { ...offered("done"), blockedReason: null }
  return null
}

/** Why the server refuses `move` on a Request it has locked, or null to let it through. */
export function moveRefusal(
  request: { status: RequestStatus; exceptionClosure: unknown; outcomeClosure: unknown; pickupBlockedReason: string | null },
  move: LifecycleMove,
): string | null {
  if (request.exceptionClosure) return "This Request is closed without a result and cannot advance."
  if (request.outcomeClosure) return "This Request is Closed and cannot advance."
  if (request.status !== MOVES[move].from) return `This Request is no longer ${MOVES[move].fromLabel}. Refresh to see its current state.`
  if (move === "pick-up") return request.pickupBlockedReason
  return null
}

/** A blocked pickup, said to this viewer: someone who can't edit the plan is told who can. */
export function pickupBlockedMessage(reason: string, requester: string | null): string {
  return requester ? `Ask ${requester} to add current values before pickup.` : reason
}

export function statusLabel(status: string): string {
  switch (status) {
    case "open": return "Open"
    case "in_progress": return "In Progress"
    case "done": return "Done"
    default: return status
  }
}
