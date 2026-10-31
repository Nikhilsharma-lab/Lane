"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import { useShellOpener } from "./shell-openers"

// #267: the overlay's code loads when `?` (or the palette) asks for it; only this listener ships with the page.
const dialogCode = popupCode(() => import("./keyboard-shortcuts-dialog"))

/**
 * Plan item 2.4 (decision 8.25): `?` lists every shortcut, from the one map
 * in src/lib/keyboard-shortcuts.ts. Mounted once in the authenticated shell.
 * `?` opens and closes it, Esc closes it, and the Arc Dialog returns focus to
 * where it was (a row, say). Nothing renders until it opens.
 */
export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  // No trigger button opens it, so it hands focus back to where `?` was pressed itself.
  const returnFocus = useRef<HTMLElement | null>(null)
  const show = (from: HTMLElement | null) => { returnFocus.current = from; setOpen(true) }
  const dialog = usePopupCode(dialogCode, open, {
    id: "popup-unavailable:shortcuts", close: () => setOpen(false), retry: () => show(returnFocus.current),
  })
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // "?" arrives as its own key; Shift is how most layouts type it, so Shift is allowed.
    if (event.key !== "?" || event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
    // Open, the overlay is itself the visible dialog, so `?` closes it. Closed, another dialog, menu or listbox keeps the key.
    if (!open && overlayOpen()) return
    event.preventDefault()
    if (open) setOpen(false)
    else show(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
  // Issue #102: the palette opens it too, naming where focus goes back to.
  useShellOpener("shortcuts", request => {
    if (open) return
    show(request.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  })

  return dialog && <dialog.KeyboardShortcutsDialog open={open} onOpenChange={setOpen} returnFocusRef={returnFocus} />
}
