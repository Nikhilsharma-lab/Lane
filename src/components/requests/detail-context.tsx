"use client"

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { requestCodeOrNull } from "@/lib/request-code"
import { canEditRequest } from "@/lib/request-lifecycle"
import type { CurrentRequest } from "./current-request"
import type { RequestDetail } from "./detail-view"
import { usePublishOpenRequest } from "./list-view-state"
import { usePendingMutations } from "./pending-mutations-provider"
import { useRequestNavigation } from "./request-navigation"

/** Who is reading. `readOnly` is a Viewer (#210): they read everything and are offered nothing that changes it. */
export type DetailViewer = { id: string; name: string; isAdmin?: boolean; readOnly?: boolean }

export type DetailRequestValue = {
  /** The server row through the pending-mutation overlay: a move or a priority shows in the same frame. */
  request: RequestDetail
  viewer: DetailViewer
  orgId: string
  isGuest: boolean
  /** Shown in the list's peek rather than as the full Request page. */
  peek: boolean
  /** The saved code (LAN-12), or null for an unnumbered Request. */
  code: string | null
  /** What toasts and the polite region call this Request: its code, else its title. */
  name: string
  /** The server's "3d ago" for Submitted, computed in the server render so the client's first render matches it. */
  submittedAgo: string
  /** Section forms the viewer opened (Ask for review, Withdraw, Respond). While any is open the strip hides its action. */
  formsOpen: number
  reportForm: (open: boolean) => void
}

const DetailRequestContext = createContext<DetailRequestValue | null>(null)
DetailRequestContext.displayName = "DetailRequest"

/**
 * On arrival (this page mounts once; it is keyed by Request id): when the
 * person came from the list or with J or K, move focus with `focus`, then
 * clear the arrival flags. Either way the page J or K left gives up its place
 * in the sequence. A deep link or a reload moves nothing.
 */
function useArrival(id: string, focus: (button: "previous" | "next" | null) => void, enabled = true) {
  const navigation = useRequestNavigation()
  useLayoutEffect(() => {
    if (enabled) navigation.arrive(id, focus)
    // Only on arrival; a stale page cannot consume another Request's intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** Request unavailable reached with J or K, or from the list: its heading takes focus, as a title would, and the flags clear. */
export function DetailArrivalReset({ requestId }: { requestId?: string }) {
  useArrival(requestId ?? "", () => {
    const heading = document.querySelector<HTMLElement>('[data-slot="page-strip"] h1')
    if (!heading) return
    // Not in the tab order; focusable only so the arrival can be read out.
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  })
  return null
}

/**
 * Plan item 2.5: one Request detail's shared state. The strip, the property
 * panel, the state line and the conversation read the same row through the
 * layout-level overlay, so a lifecycle move or a priority change shows
 * everywhere in the next frame and clears only when the server row shows it.
 * It also moves focus to the title when the person arrived from the list or
 * with J or K, never on a deep link or reload. The list's peek (plan item
 * 2.12) passes `arrival={false}`: focus stays on the list's row, and the
 * page's J and K sequence is left as it was.
 */
export function DetailRequestProvider({ request: serverRequest, viewer, orgId, isGuest, submittedAgo, arrival = true, children }: {
  request: RequestDetail
  viewer: DetailViewer
  orgId: string
  isGuest: boolean
  submittedAgo: string
  arrival?: boolean
  children: ReactNode
}) {
  const overlay = usePendingMutations()
  const request = overlay ? overlay.applyOne(serverRequest) : serverRequest
  const [formsOpen, setFormsOpen] = useState(0)
  const reportForm = useCallback((open: boolean) => setFormsOpen(count => Math.max(0, count + (open ? 1 : -1))), [])
  const code = requestCodeOrNull(serverRequest.requestNumber)
  const name = code ?? (serverRequest.reframedProblem ?? serverRequest.title)

  useArrival(request.id, button => {
    // J or K from the previous or next button keeps focus on that button; every other arrival reads the new title.
    const target = button ? document.querySelector<HTMLElement>(`[data-detail-sequence="${button}"]:not(:disabled)`) : null
    ;(target ?? document.getElementById("request-title"))?.focus({ preventScroll: true })
  }, arrival)

  // #103: the shell's current Request, with the same edit and pickup rules as the panel and the strip's button.
  const { id, status, priority, createdBy, takenOnBy, agreementBlocked, reviewState, pickupBlockedReason } = request
  const source = arrival ? "page" : "peek"
  const current = useMemo<CurrentRequest>(() => ({
    id, code, name, status, priority, source,
    canEdit: canEditRequest({ status, createdBy, takenOnBy }, viewer),
    agreementBlocked: agreementBlocked ?? false, reviewState: reviewState ?? null,
    pickupBlockedReason: pickupBlockedReason ?? null,
  }), [id, code, name, status, priority, source, viewer, createdBy, takenOnBy, agreementBlocked, reviewState, pickupBlockedReason])
  usePublishOpenRequest(current)

  const peek = !arrival
  const value = useMemo<DetailRequestValue>(() => ({ request, viewer, orgId, isGuest, peek, code, name, submittedAgo, formsOpen, reportForm }),
    [request, viewer, orgId, isGuest, peek, code, name, submittedAgo, formsOpen, reportForm])
  return <DetailRequestContext.Provider value={value}>{children}</DetailRequestContext.Provider>
}

/** The Request detail this component sits in. Throws outside DetailRequestProvider. */
export function useDetailRequest(): DetailRequestValue {
  const value = useContext(DetailRequestContext)
  if (!value) throw new Error("useDetailRequest must be used inside DetailRequestProvider")
  return value
}

/** Null outside Request detail (a standalone fixture), where nothing reports open forms. */
export function useOptionalDetailRequest() {
  return useContext(DetailRequestContext)
}
