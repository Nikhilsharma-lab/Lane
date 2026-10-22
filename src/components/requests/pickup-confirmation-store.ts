import { pickupConfirmation, type PickupConfirmation, type ReviewState } from "@/lib/request-reviewer-rules"

export type PickupTarget = { id: string; name: string; reviewState?: ReviewState | null }
/** Resolves true to pick up: at once when nothing is outstanding, else once the person confirms. */
export type ConfirmPickup = (targets: PickupTarget[]) => Promise<boolean>

/** A reviewers panel tells the confirmation what it last read for its Request; undefined when it goes away. */
export type ReportReviewState = (requestId: string, state: ReviewState | null | undefined) => void

/**
 * #77: the pickup confirmation's logic, apart from its dialog
 * (PickupConfirmationProvider). `show` receives what to ask, or null once it
 * is answered; `settle` is the answer. A second request while one is shown
 * cancels the first. What a reviewers panel last read wins for its Request.
 */
export function createPickupConfirmation(show: (confirmation: PickupConfirmation | null) => void) {
  let resolver: ((confirmed: boolean) => void) | null = null
  const latest = new Map<string, ReviewState | null>()

  const report: ReportReviewState = (requestId, state) => {
    if (state === undefined) latest.delete(requestId)
    else latest.set(requestId, state)
  }

  const settle = (confirmed: boolean) => {
    resolver?.(confirmed)
    resolver = null
    show(null)
  }

  const confirm: ConfirmPickup = targets => {
    const confirmation = pickupConfirmation(targets, latest)
    if (!confirmation) return Promise.resolve(true)
    resolver?.(false)
    return new Promise<boolean>(resolve => {
      resolver = resolve
      show(confirmation)
    })
  }

  return { confirm, report, settle }
}
