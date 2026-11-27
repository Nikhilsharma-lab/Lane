"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { isOffline } from "@/lib/connection-status"
import { onNavigation, routerMoves } from "@/lib/navigation-intent"
import { createFrameCheck, type FrameCheck, type FrameSession } from "./frame-check"

let pageCheck: FrameCheck | null = null

/** One check for the page's whole life, however often the frame mounts: it outlives a frame that Back can bring back. */
function checkOfPage(): FrameCheck {
  if (pageCheck) return pageCheck
  const check = pageCheck = createFrameCheck({
    offline: isOffline,
    path: () => location.pathname,
    openHome: () => location.replace("/"),
    reload: () => location.reload(),
  })
  addEventListener("pageshow", event => { if (event.persisted) check.restored() })
  return check
}

const tabAddress = () => `${location.pathname}${location.search}`

/** #402: tells the frame's check (frame-check.ts) which address the frame shows, and whether an in-app move brought it. */
export function FrameWatch({ orgId, userId, role }: FrameSession) {
  const pathname = usePathname()
  const search = useSearchParams()?.toString() ?? ""
  const last = useRef({ pathname, address: "", moves: 0, stepped: false })

  useEffect(() => {
    // Back or Forward to another address; a popup's own step (popup-history.ts) keeps the address.
    const onPopState = () => { last.current.stepped = tabAddress() !== last.current.address }
    addEventListener("popstate", onPopState)
    return () => removeEventListener("popstate", onPopState)
  }, [])
  useEffect(() => onNavigation(() => checkOfPage().moving()), [])
  useEffect(() => () => checkOfPage().unmounted(), [])
  useEffect(() => {
    const before = last.current
    last.current = { pathname, address: tabAddress(), moves: routerMoves(), stepped: false }
    const moved = before.pathname !== pathname || before.moves !== last.current.moves || before.stepped
    checkOfPage().shown({ orgId, userId, role }, `${pathname}?${search}`, moved)
  }, [orgId, userId, role, pathname, search])
  return null
}
