"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const RETURN_FOCUS_KEY = "lane:request-return-focus"

function readReturnFocus() {
  try { return window.sessionStorage.getItem(RETURN_FOCUS_KEY) } catch { return null }
}

function rememberReturnFocus(id: string) {
  try { window.sessionStorage.setItem(RETURN_FOCUS_KEY, id) } catch { /* Navigation works when storage is disabled. */ }
}

function clearReturnFocus() {
  try { window.sessionStorage.removeItem(RETURN_FOCUS_KEY) } catch { /* Storage may be disabled. */ }
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("input, textarea, select, [role='textbox']"))
  )
}

export function RequestWorkspaceKeyboard({
  selectedRequestId,
  returnHref,
  onRestoreRequest,
}: {
  selectedRequestId?: string
  returnHref: string
  onRestoreRequest?: (id: string) => void
}) {
  const router = useRouter()
  const markerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    markerRef.current?.setAttribute("data-ready", "true")
  }, [])

  useEffect(() => {
    if (selectedRequestId) return

    const requestId = readReturnFocus()
    if (!requestId) return

    onRestoreRequest?.(requestId)

    let frame = 0
    let attempts = 0

    function restoreFocus() {
      const requestLink = document.getElementById(`request-${requestId}`)
      // Restoring a row may first expand its group or change pages. Do not
      // consume the marker until the newly visible link accepts focus.
      if (requestLink?.getClientRects().length && !requestLink.closest("[hidden], [inert]")) {
        requestLink.focus()
        if (document.activeElement === requestLink) {
          clearReturnFocus()
          return
        }
      }

      attempts += 1
      if (attempts < 20) {
        frame = window.requestAnimationFrame(restoreFocus)
      } else {
        clearReturnFocus()
        // A lifecycle change can remove the Request from the active filter.
        document.querySelector<HTMLElement>('[aria-label="Filter Requests by title"]')?.focus()
      }
    }

    restoreFocus()
    return () => window.cancelAnimationFrame(frame)
  }, [selectedRequestId, onRestoreRequest])

  useEffect(() => {
    if (!selectedRequestId) return
    const requestId = selectedRequestId

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        (event.target instanceof Element && Boolean(event.target.closest('[role="dialog"], [role="alertdialog"]'))) ||
        isTypingTarget(event.target)
      ) {
        return
      }

      event.preventDefault()
      rememberReturnFocus(requestId)
      router.push(returnHref)
    }

    function handleReturnClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(link instanceof HTMLAnchorElement)) return
      const destination = new URL(returnHref, window.location.origin)
      if (link.origin === destination.origin && link.pathname === destination.pathname && link.search === destination.search) {
        rememberReturnFocus(requestId)
      }
    }

    function handleBrowserBack() {
      if (window.location.pathname === "/") rememberReturnFocus(requestId)
    }

    window.addEventListener("keydown", handleKeyDown)
    document.addEventListener("click", handleReturnClick, true)
    window.addEventListener("popstate", handleBrowserBack)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("click", handleReturnClick, true)
      window.removeEventListener("popstate", handleBrowserBack)
    }
  }, [returnHref, router, selectedRequestId])

  return (
    <span
      ref={markerRef}
      data-slot="request-workspace-keyboard"
      data-ready="false"
      className="hidden"
    />
  )
}
