"use client"

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from "react"
import { formatRequestCode } from "@/lib/request-code"
import type { RequestDetail } from "./detail-view"
import { useDetailSession, useSetDetailSession } from "./list-view-state"
import { usePendingMutations } from "./pending-mutations-provider"
import { settleSequence } from "./request-sequence"

export type DetailViewer = { id: string; name: string }

export type DetailRequestValue = {
  /** The server row through the pending-mutation overlay: a move or a priority shows in the same frame. */
  request: RequestDetail
  viewer: DetailViewer
  orgId: string
  isGuest: boolean
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

/** The saved code, or null where formatRequestCode would throw (an unnumbered Request, column default 0). */
export function requestCodeOrNull(requestNumber: number | undefined) {
  try { return requestNumber ? formatRequestCode(requestNumber) : null } catch { return null }
}

/**
 * On arrival (this page mounts once; it is keyed by Request id): when the
 * person came from the list or with J or K, move focus with `focus`, then
 * clear the arrival flags. Either way the page J or K left gives up its place
 * in the sequence. A deep link or a reload moves nothing.
 */
function useArrival(focus: (button: "previous" | "next" | null) => void) {
  const { sequence, focusTitleOnArrival, focusOnArrival } = useDetailSession()
  const setSession = useSetDetailSession()
  useLayoutEffect(() => {
    const settled = settleSequence(sequence)
    if (!focusTitleOnArrival && !focusOnArrival && settled === sequence) return
    if (focusTitleOnArrival || focusOnArrival) focus(focusOnArrival)
    setSession({ focusTitleOnArrival: false, focusOnArrival: null, sequence: settled })
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** Request unavailable reached with J or K, or from the list: its heading takes focus, as a title would, and the flags clear. */
export function DetailArrivalReset() {
  useArrival(() => {
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
 * with J or K, never on a deep link or reload.
 */
export function DetailRequestProvider({ request: serverRequest, viewer, orgId, isGuest, submittedAgo, children }: {
  request: RequestDetail
  viewer: DetailViewer
  orgId: string
  isGuest: boolean
  submittedAgo: string
  children: ReactNode
}) {
  const overlay = usePendingMutations()
  const request = overlay ? overlay.applyOne(serverRequest) : serverRequest
  const [formsOpen, setFormsOpen] = useState(0)
  const reportForm = useCallback((open: boolean) => setFormsOpen(count => Math.max(0, count + (open ? 1 : -1))), [])
  const code = requestCodeOrNull(serverRequest.requestNumber)
  const name = code ?? (serverRequest.reframedProblem ?? serverRequest.title)

  useArrival(button => {
    // J or K from the previous or next button keeps focus on that button; every other arrival reads the new title.
    const target = button ? document.querySelector<HTMLElement>(`[data-detail-sequence="${button}"]:not(:disabled)`) : null
    ;(target ?? document.getElementById("request-title"))?.focus({ preventScroll: true })
  })

  const value = useMemo<DetailRequestValue>(() => ({ request, viewer, orgId, isGuest, code, name, submittedAgo, formsOpen, reportForm }),
    [request, viewer, orgId, isGuest, code, name, submittedAgo, formsOpen, reportForm])
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
