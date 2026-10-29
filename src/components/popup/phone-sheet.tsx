"use client"

import { useEffect, useId, useRef, type ComponentProps } from "react"
import { BottomSheetContent } from "@/components/arc/bottom-sheet/bottom-sheet"
import { navigatedWithin } from "@/lib/navigation-intent"

export type PhoneSheetProps = ComponentProps<typeof BottomSheetContent>

/**
 * #263: the adaptive popup's phone form (adaptive-dialog.tsx), loaded only on a phone. Arc's bottom sheet resting on
 * one detent, under the popup's own Radix root. While it is open the page gains one history entry, so the phone's
 * Back closes the panel instead of leaving the page; closing it any other way takes that entry back off.
 */
export default function PhoneSheet({ open, onDismiss, ...props }: PhoneSheetProps) {
  const marker = useId()
  const dismiss = useRef(onDismiss)
  useEffect(() => { dismiss.current = onDismiss }, [onDismiss])

  useEffect(() => {
    if (!open) return
    const ours = () => (window.history.state as { lanePopup?: string } | null)?.lanePopup === marker
    const page = window.history.state
    window.history.pushState({ lanePopup: marker }, "")
    const back = () => {
      if (ours()) return
      // Back was pressed: hold the place again until the popup really closes (it may ask first), then close it.
      window.history.pushState({ lanePopup: marker }, "")
      dismiss.current()
    }
    window.addEventListener("popstate", back)
    return () => {
      window.removeEventListener("popstate", back)
      // A close that also moves to another page (Delete Request, a link) must not step back: that would undo the
      // move before Next.js records it. The entry becomes the page's own again, so Back from the new page returns
      // here as it would without the panel. Otherwise an entry still on top goes.
      if (navigatedWithin(1000)) { if (ours()) window.history.replaceState(page, ""); return }
      window.setTimeout(() => { if (ours() && !navigatedWithin(1000)) window.history.back() }, 0)
    }
  }, [marker, open])

  return <BottomSheetContent {...props} open={open} onDismiss={onDismiss} detents={[.92]} />
}
