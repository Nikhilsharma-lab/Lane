import { canChange } from "./request-access-rules"
import type { GuestSubmissionState, PickupBlock } from "./guest-submission"
export type RequestStatus = "open" | "in_progress" | "done"
export type LifecycleMove = "pick-up" | "done"
export type AllowedMove = { move: LifecycleMove; to: "in_progress" | "done"; label: "Pick up" | "Mark Done" }
/** An offered move, and why it can't be made yet when it can't. */
export type AvailableMove = AllowedMove & { blockedReason: PickupBlock | null }
/** Who asks. Profile labels never gate actions (AGENTS.md); only the workspace role does: a Guest and a Viewer
 * (`readOnly`, #210) make no lifecycle move. */
export type MoveViewer = { isGuest: boolean; readOnly?: boolean }

/**
 * The edit rule (priority and the Request's own fields): Open, and the viewer can change it
 * (`canChange`: an admin or its creator, a guest's own Request included). The row menu, the detail panel
 * and the ⌘K palette share it; lib/data/requests.ts computes the same for list rows as `canEdit`.
 */
export function canEditRequest(request: { status: RequestStatus; createdBy: string | null; takenOnBy: string | null }, viewer: { id: string; isAdmin?: boolean; readOnly?: boolean }): boolean {
  const role = viewer.readOnly ? "viewer" : viewer.isAdmin ? "admin" : "member"
  return request.status === "open" && canChange({ userId: viewer.id, role }, { createdBy: request.createdBy ?? "", takenOnBy: request.takenOnBy })
}

/** What a surface knows about a Request to decide its move. `pickupBlockedReason`
 * is `measurementReadiness`, worked out where the measurement plan is loaded. */
export type LifecycleRequest = {
  status: RequestStatus
  /** Closed with a result or without one: a closed Request never advances. */
  agreementBlocked?: boolean
  pickupBlockedReason?: PickupBlock | null
}

/** Each move's statuses and its copy, shared by every surface and the server. */
export const MOVES = {
  "pick-up": { move: "pick-up", from: "open", to: "in_progress", label: "Pick up", fromLabel: "Open", verb: "pick it up" },
  done: { move: "done", from: "in_progress", to: "done", label: "Mark Done", fromLabel: "In progress", verb: "mark it Done" },
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
  if (request.agreementBlocked || viewer.isGuest || viewer.readOnly) return null
  if (request.status === "open") return { ...offered("pick-up"), blockedReason: request.pickupBlockedReason ?? null }
  if (request.status === "in_progress") return { ...offered("done"), blockedReason: null }
  return null
}

/** Why the server refuses `move` on a Request it has locked, or null to let it through. */
export function moveRefusal(
  request: { status: RequestStatus; exceptionClosure: unknown; outcomeClosure: unknown; pickupBlockedReason: PickupBlock | null },
  move: LifecycleMove,
): string | null {
  if (request.exceptionClosure) return "This Request is closed without a result and cannot advance."
  if (request.outcomeClosure) return "This Request is Closed and cannot advance."
  if (request.status !== MOVES[move].from) return `This Request is no longer ${MOVES[move].fromLabel}. Refresh to see its current state.`
  if (move === "pick-up") return request.pickupBlockedReason?.reason ?? null
  return null
}

/** A blocked pickup, said to this viewer: someone who can't edit the plan is told who can. A waiting Guest
 * submission's reason is said as it is, since any Member may take it on (#280). */
export function pickupBlockedMessage({ code, reason }: PickupBlock, requester: string | null): string {
  if (!requester || code === "take_on_first") return reason
  if (code === "set_the_goal") return `Ask ${requester} to set the goal before pickup.`
  return `Ask ${requester} to add current values before pickup.`
}

/**
 * Who pickupBlockedMessage sends a viewer to, or null for a viewer who can change the Request (`changes`). A Guest
 * submission is never answered for by its Guest (#280): nobody while it waits, then whoever took it on. A list row
 * doesn't carry the taker's name (`takenOnByName` undefined), so its reason is said as it is.
 */
export function pickupRequester(request: { guestSubmission: GuestSubmissionState | null; creatorName: string | null; takenOnByName?: string | null }, changes: boolean): string | null {
  if (changes || request.guestSubmission === "waiting") return null
  if (request.guestSubmission === "taken_on") return request.takenOnByName === undefined ? null : request.takenOnByName || "the Requester"
  return request.creatorName || "the Requester"
}
