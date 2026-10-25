/**
 * #212 (spec #195, item 4): Guest submissions. A Guest files a Request without a prediction; it waits as a Guest
 * submission until a Member (or Admin) takes it on, which makes them its Requester and asks them for the
 * prediction. The Guest keeps seeing and commenting on it. Pure and client-safe; the server rules read it too.
 */

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

export const TAKE_ON_FIRST = "Take this Guest submission on before picking it up."
export const WRITE_THE_PREDICTION = "Write the prediction before picking up this Request."

/**
 * Why a Guest submission can't be picked up yet, or null: nobody picks it up while it waits, and the Member who took
 * it on writes the prediction (a measured result, or No measurable impact with its reason) first. Every surface
 * shows this and the server refuses with it.
 */
export function guestPickupRefusal(request: { guestSubmission: GuestSubmissionState | null; expectedImpact: unknown; noMeasurableImpactReason: string | null }): string | null {
  if (request.guestSubmission === "waiting") return TAKE_ON_FIRST
  if (request.guestSubmission === "taken_on" && !request.expectedImpact && !request.noMeasurableImpactReason) return WRITE_THE_PREDICTION
  return null
}

/** What Request detail shows about a Guest submission. Names come from saved profiles. */
export type GuestSubmissionView = {
  state: GuestSubmissionState
  submitterName: string | null
  takenOnBy: string | null
  takenOnByName: string | null
}
