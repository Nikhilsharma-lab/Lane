"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { isShown, requestRowSelector, restoreRequestFocus } from "@/components/requests/list-focus"
import { isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"

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
      // Plan item 2.4: the Request's row, the list's one tab stop. Restoring it
      // may first expand its group or change pages, so do not consume the
      // marker until the newly visible row accepts focus.
      const row = document.querySelector(requestRowSelector(requestId!))
      if (isShown(row)) {
        row.focus({ preventScroll: true })
        row.scrollIntoView({ block: "nearest" })
        if (document.activeElement === row) {
          clearReturnFocus()
          return
        }
      }

      attempts += 1
      if (attempts < 20) {
        frame = window.requestAnimationFrame(restoreFocus)
      } else {
        clearReturnFocus()
        // A lifecycle change can remove the Request from the active filter:
        // the grid's tab stop, else the title filter.
        restoreRequestFocus(requestId!, { force: true })
      }
    }

    restoreFocus()
    return () => window.cancelAnimationFrame(frame)
  }, [selectedRequestId, onRestoreRequest])

  useEffect(() => {
    if (!selectedRequestId) return
    const requestId = selectedRequestId

    // Plan item 2.5: Esc on detail does the first thing that applies. An open
    // menu, popover, drawer or dialog closes itself (and prevents default); a
    // section form or the comment box with focus handles its own Esc. Then an
    // open section form the person opened is cancelled; only then does Esc
    // return to the list, which focuses this Request's row.
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.isComposing ||
        (event.target instanceof Element && Boolean(event.target.closest('[role="dialog"], [role="alertdialog"]'))) ||
        isTypingTarget(event.target) ||
        overlayOpen()
      ) {
        return
      }
      // Search hides the page; Esc then belongs to the search pane.
      if (!isShown(document.querySelector('[data-slot="requests-workspace"]'))) return

      const form = document.querySelector("[data-detail] [data-detail-form]")
      if (form) {
        event.preventDefault()
        form.querySelector<HTMLButtonElement>("[data-detail-form-cancel]:not(:disabled)")?.click()
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
