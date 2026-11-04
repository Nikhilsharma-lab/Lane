"use client"

import { useEffect, useId, useRef, useState, type ComponentProps } from "react"
import { BottomSheetContent } from "@/components/arc/bottom-sheet/bottom-sheet"
import { navigatedWithin } from "@/lib/navigation-intent"
import { createPopupEntry, type PopupEntryEnvironment } from "./popup-history"

export type PhoneSheetProps = ComponentProps<typeof BottomSheetContent>

/**
 * #263: the adaptive popup's phone form (adaptive-dialog.tsx), loaded only on a phone. Arc's bottom sheet resting on
 * one detent, under the popup's own Radix root. While it is open the page gains one history entry (popup-history.ts),
 * so the phone's Back closes the panel instead of leaving the page; closing it any other way takes that entry back off.
 */
export default function PhoneSheet({ open, onDismiss, ...props }: PhoneSheetProps) {
  const marker = useId()
  const dismiss = useRef(onDismiss)
  useEffect(() => { dismiss.current = onDismiss }, [onDismiss])
  // One per panel, so a run straight after a release (React's Strict Mode, a remount) keeps the entry it left.
  const [hold] = useState(() => createPopupEntry(marker, browserTab))

  useEffect(() => {
    if (!open) return
    return hold(() => dismiss.current())
  }, [hold, open])

  return <BottomSheetContent {...props} open={open} onDismiss={onDismiss} detents={[.92]} />
}

const browserTab: PopupEntryEnvironment = {
  history: { get state() { return window.history.state }, pushState: (state, unused) => window.history.pushState(state, unused), replaceState: (state, unused) => window.history.replaceState(state, unused), back: () => window.history.back() },
  onPopState(listener) { window.addEventListener("popstate", listener); return () => window.removeEventListener("popstate", listener) },
  defer: task => { window.setTimeout(task, 0) },
  navigatedWithin,
  address: () => window.location.href,
}
