"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { focusRowWhenShown, isShown, restoreRequestFocus } from "@/components/requests/list-focus"
import { isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import { dismissOpenForm } from "@/components/popup/dismiss-form"
import { useRequestNavigation } from "./request-navigation"

const RETURN_FOCUS_KEY = "lane:request-return-focus"

function readReturnFocus() {
  try { return window.sessionStorage.getItem(RETURN_FOCUS_KEY) } catch { return null }
}

function rememberReturnFocus(id: string) {
  try { window.sessionStorage.setItem(RETURN_FOCUS_KEY, id) } catch { /* Navigation works when storage is disabled. */ }
}

function clearReturnFocus() {
  try { window.sessionStorage.removeItem(RETURN_FOCUS_KEY); window.sessionStorage.removeItem(LEFT_KEY) } catch { /* Storage may be disabled. */ }
}

// #263 (A232): the router can unmount a Request page before the browser's popstate arrives, so a page notes
// the Request it showed as it leaves. The list arriving straight after (browser Back) focuses that row.
const LEFT_KEY = "lane:request-left"
const LEFT_FRESH_MS = 3000

function rememberLeft(id: string) {
  try { window.sessionStorage.setItem(LEFT_KEY, JSON.stringify({ id, at: Date.now() })) } catch { /* Navigation works when storage is disabled. */ }
}

function readJustLeft() {
  try {
    const left = JSON.parse(window.sessionStorage.getItem(LEFT_KEY) ?? "null") as { id?: unknown; at?: unknown } | null
    return left && typeof left.id === "string" && typeof left.at === "number" && Date.now() - left.at < LEFT_FRESH_MS ? left.id : null
  } catch { return null }
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
  const navigation = useRequestNavigation()
  const markerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    markerRef.current?.setAttribute("data-ready", "true")
  }, [])

  useEffect(() => {
    if (selectedRequestId) return

    const requestId = readReturnFocus() ?? readJustLeft()
    if (!requestId) return

    onRestoreRequest?.(requestId)

    // Plan item 2.4: the Request's row, the list's one tab stop. Restoring it
    // may first expand its group or change pages, so the marker stays until
    // the newly visible row accepts focus.
    return focusRowWhenShown(requestId, (focused) => {
      clearReturnFocus()
      // A lifecycle change can remove the Request from the active filter:
      // the grid's tab stop, else the title filter.
      if (!focused) restoreRequestFocus(requestId, { force: true })
    })
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

      // #263: an open Journey or Reviewers form is the top layer. It closes (asking first if it holds typed text); the page stays.
      const detail = document.querySelector("[data-detail]")
      if (detail && dismissOpenForm(detail)) {
        event.preventDefault()
        return
      }

      event.preventDefault()
      rememberReturnFocus(requestId)
      navigation.invalidate()
      router.push(returnHref)
    }

    function handleReturnClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self")) return
      const destination = new URL(returnHref, window.location.origin)
      if (link.origin === destination.origin && link.pathname === destination.pathname && link.search === destination.search) {
        rememberReturnFocus(requestId)
        navigation.invalidate()
      }
    }

    function handleBrowserBack() {
      if (window.location.pathname === "/") rememberReturnFocus(requestId)
    }

    window.addEventListener("keydown", handleKeyDown)
    document.addEventListener("click", handleReturnClick, true)
    const stopRemembering = navigation.onHistoryReturn(handleBrowserBack)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("click", handleReturnClick, true)
      stopRemembering()
      rememberLeft(requestId)
    }
  }, [returnHref, router, selectedRequestId, navigation])

  return (
    <span
      ref={markerRef}
      data-slot="request-workspace-keyboard"
      data-ready="false"
      className="hidden"
    />
  )
}
