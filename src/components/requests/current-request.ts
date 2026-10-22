import { createExternalStore } from "@/lib/external-store"
import { requestCodeOrNull } from "@/lib/request-code"
import type { RequestPriority } from "@/lib/request-constants"
import type { RequestStatus } from "@/lib/request-lifecycle"
import type { OverviewRequest } from "@/lib/request-overview"
import type { ReviewState } from "@/lib/request-reviewer-rules"

/**
 * #103: the one Request the app shell acts on (the ⌘K palette, #101). The
 * Request open on its page or in the list's preview wins; otherwise the list's
 * highlighted row (its active row, never the ticked ones). The viewer's role is
 * the caller's to apply, as `allowedMove(request, { isGuest })` does.
 */
export type CurrentRequest = {
  id: string
  /** The saved code (LAN-12), or null for an unnumbered Request. */
  code: string | null
  /** What toasts and the polite region call it: its code, else its title. */
  name: string
  status: RequestStatus
  priority: RequestPriority
  /** Where it is: Request detail's page, the list's preview, or the list's highlighted row. */
  source: "page" | "peek" | "list"
  /** The row menu's and detail panel's edit rule before the viewer's role: Open, and the viewer is an admin or created it. */
  canEdit: boolean
  /** Closed by an outcome: no lifecycle move. */
  agreementBlocked: boolean
  /** Saved reviews, for "Pick up anyway?" (#77). */
  reviewState: ReviewState | null
  /** Request detail only: why its Pick up button is unavailable, else null. */
  pickupBlockedReason: string | null
}

export type CurrentRequestState = { open: CurrentRequest | null; highlightedId: string | null }

export type CurrentRequestStore = {
  get: () => CurrentRequestState
  subscribe: (listener: () => void) => () => void
  /** Publishes the open Request. The returned release clears it only if it is still the one shown. */
  setOpen: (request: CurrentRequest) => () => void
  setHighlighted: (id: string | null) => void
}

export function createCurrentRequestStore(): CurrentRequestStore {
  const store = createExternalStore<CurrentRequestState>({ open: null, highlightedId: null })
  return {
    get: store.get,
    subscribe: store.subscribe,
    setOpen: request => {
      store.set({ ...store.get(), open: request })
      return () => { if (store.get().open === request) store.set({ ...store.get(), open: null }) }
    },
    setHighlighted: id => { if (store.get().highlightedId !== id) store.set({ ...store.get(), highlightedId: id }) },
  }
}

/** A loaded list row as the current Request. */
export function rowCurrentRequest(row: OverviewRequest): CurrentRequest {
  const code = requestCodeOrNull(row.requestNumber)
  return {
    id: row.id, code, name: code ?? row.reframedProblem ?? row.title, status: row.status, priority: row.priority ?? "none", source: "list",
    canEdit: row.canEdit ?? false, agreementBlocked: row.agreementBlocked ?? false, reviewState: row.reviewState ?? null, pickupBlockedReason: null,
  }
}

/** The open Request, else the highlighted row found among the loaded rows (through the pending overlay), else null. */
export function resolveCurrentRequest(state: CurrentRequestState, loaded: readonly OverviewRequest[],
  applyOne: <T extends { id: string }>(row: T) => T = row => row): CurrentRequest | null {
  if (state.open) return state.open
  const row = state.highlightedId ? loaded.find(item => item.id === state.highlightedId) : undefined
  return row ? rowCurrentRequest(applyOne(row)) : null
}
