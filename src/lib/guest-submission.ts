/**
 * #212 (spec #195, item 4): Guest submissions. A Guest files a Request without a prediction; it waits as a Guest
 * submission until a Member (or Admin) takes it on, which makes them its Requester and asks them for the
 * prediction. The Guest keeps seeing and commenting on it. Pure and client-safe; the server rules read it too.
 */
import type { WorkspacePermission } from "./auth-guard"
import { canChangeThings, readsWholeWorkspace } from "./role-rules"

/** Waiting to be taken on, or taken on by a Member. A Request that isn't a Guest submission has none (null). */
export type GuestSubmissionState = "waiting" | "taken_on"

/** The saved facts a Guest submission is read from. */
export type GuestSubmissionFacts = { guestSubmission: boolean; takenOnBy: string | null }

export function guestSubmissionOf(request: GuestSubmissionFacts): GuestSubmissionState | null {
  if (!request.guestSubmission) return null
  return request.takenOnBy ? "taken_on" : "waiting"
}

/** The words a waiting Guest submission is tagged with, on its row and in its name. */
export const WAITING_TO_BE_TAKEN_ON = "Waiting to be taken on"

/**
 * Why pickup is blocked, said once for everyone (`reason`), with a code for code that words it per viewer
 * (`pickupBlockedMessage`): a Guest submission to take on first, its goal to set, or the measurement plan to finish.
 */
export type PickupBlock = { code: "take_on_first" | "set_the_goal" | "plan"; reason: string }
const TAKE_ON_FIRST: PickupBlock = { code: "take_on_first", reason: "Take this Guest submission on before picking it up." }
const SET_THE_GOAL: PickupBlock = { code: "set_the_goal", reason: "Set the goal before picking up this Request." }

/**
 * Why a Guest submission can't be picked up yet, or null: nobody picks it up while it waits, and the Member who took
 * it on writes the prediction (a measured result, or No measurable impact with its reason) first. Every surface
 * shows this and the server refuses with it.
 */
export function guestPickupRefusal(request: { guestSubmission: GuestSubmissionState | null; expectedImpact: unknown; noMeasurableImpactReason: string | null }): PickupBlock | null {
  if (request.guestSubmission === "waiting") return TAKE_ON_FIRST
  if (request.guestSubmission === "taken_on" && !request.expectedImpact && !request.noMeasurableImpactReason) return SET_THE_GOAL
  return null
}

/** Who reads the notice: their id and Lane role. */
export type GuestNoticeReader = { userId: string; role: WorkspacePermission }

/**
 * What Request detail says about a Guest submission to this reader, and the one thing it offers them: Admins and
 * Members take a waiting one on; whoever took it on is asked for the prediction until it's written. The Guest and a
 * Viewer are only told where it stands.
 */
export function guestSubmissionNotice(view: GuestSubmissionView, reader: GuestNoticeReader, hasPrediction: boolean): { text: string; action: "take_on" | "write_prediction" | null } {
  const submitter = view.submitterName?.trim() || "A Guest"
  const taker = view.takenOnByName?.trim() || "A Member"
  // A Guest reads only their own Requests, so a Guest reading this filed it.
  const ownSubmission = !readsWholeWorkspace(reader.role)
  if (view.state === "waiting") {
    if (ownSubmission) return { text: "Waiting for a Member to take this on. They’ll set its goal, and you’ll get an email when they do.", action: null }
    if (!canChangeThings(reader.role)) return { text: `${submitter} filed this as a Guest. It’s waiting for a Member to take it on.`, action: null }
    return { text: `${submitter} filed this as a Guest, without a goal. Take it on to become its Requester and set the goal.`, action: "take_on" }
  }
  if (ownSubmission) return { text: `${taker} took this on and is its Requester. You can still follow it and comment.`, action: null }
  if (view.takenOnBy === reader.userId && canChangeThings(reader.role)) {
    return hasPrediction
      ? { text: `${submitter} filed this as a Guest. You took it on and are its Requester.`, action: null }
      : { text: `${submitter} filed this as a Guest. You took it on, so set its goal before the work is picked up.`, action: "write_prediction" }
  }
  return { text: `${submitter} filed this as a Guest. ${taker} took it on and is its Requester.`, action: null }
}

/** What Request detail shows about a Guest submission. Names come from saved profiles. */
export type GuestSubmissionView = {
  state: GuestSubmissionState
  submitterName: string | null
  takenOnBy: string | null
  takenOnByName: string | null
}
