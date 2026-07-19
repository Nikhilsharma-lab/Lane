"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const RETURN_FOCUS_KEY = "lane:request-return-focus"

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
}: {
  selectedRequestId?: string
  returnHref: string
}) {
  const router = useRouter()
  const markerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    markerRef.current?.setAttribute("data-ready", "true")
  }, [])

  useEffect(() => {
    if (selectedRequestId) return

    const requestId = window.sessionStorage.getItem(RETURN_FOCUS_KEY)
    if (!requestId) return

    let frame = 0
    let attempts = 0

    function restoreFocus() {
      const requestLink = document.getElementById(`request-${requestId}`)
      if (requestLink) {
        window.sessionStorage.removeItem(RETURN_FOCUS_KEY)
        requestLink.focus()
        return
      }

      attempts += 1
      if (attempts < 20) {
        frame = window.requestAnimationFrame(restoreFocus)
      }
    }

    restoreFocus()
    return () => window.cancelAnimationFrame(frame)
  }, [selectedRequestId])

  useEffect(() => {
    if (!selectedRequestId) return
    const requestId = selectedRequestId

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        isTypingTarget(event.target)
      ) {
        return
      }

      event.preventDefault()
      window.sessionStorage.setItem(RETURN_FOCUS_KEY, requestId)
      router.push(returnHref)
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
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
