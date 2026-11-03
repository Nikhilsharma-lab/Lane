"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { usePopupCode } from "@/components/popup/lazy-popup"
import { isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import type { CommandPaletteWorkspace } from "./command-palette"
import { paletteShortcut, typeaheadKey } from "./command-palette-shortcut"
import { useShellOpener } from "./shell-openers"
import { shellSurfaces } from "./workspace-search-pane-lazy"

// Issue #106 (spec #101): only this listener and loader are in every route's first load. The palette
// itself loads on demand with the search pane (shell-lazy-surfaces.ts, #107). The shell's idle preload
// of that module (sidebar-view.tsx, on every page, Settings included) fetches it for both, so the first
// ⌘K finds it in memory; before that lands, ⌘K fetches it. From then on it renders synchronously.
// The precedent is workspace-search-pane-lazy.tsx.

/**
 * ⌘K or Ctrl+K anywhere in the signed-in app, Settings included (the shell
 * mounts this in both of its branches), and the sidebar's Jump to… bar (#268).
 * A second ⌘K closes it. Closed, it respects the shared typing and overlay
 * guards. Focus goes back to what had it when ⌘K was pressed.
 *
 * #268 (A12): from ⌘K until the palette's field has focus, keys are kept here
 * and handed to the field, and none reaches the page. #268 (A11): Back or
 * Forward after it opened closes it; a page that was already on its way when
 * ⌘K was pressed lands under it, and it stays open.
 */
export function CommandPaletteHost(props: CommandPaletteWorkspace & { pathname: string }) {
  const { pathname, ...workspace } = props
  const [open, setOpen] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  // What was typed while it opens; null once the field has it, or while closed.
  const typeahead = useRef<string | null>(null)
  const { toast } = useToastStack()
  const change = (next: boolean) => { if (!next) typeahead.current = null; setOpen(next) }
  const show = (focusBack: HTMLElement | null) => { returnFocus.current = focusBack; typeahead.current = ""; setOpen(true) }
  const surfaces = usePopupCode(shellSurfaces, open, () => {
    change(false)
    toast({ type: "error", title: "Couldn't open the command palette", description: "Check your connection and try again." })
  })

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const command = paletteShortcut(event, { open, typing: isTypingTarget(event.target), overlay: !open && overlayOpen() })
    if (!command) return
    event.preventDefault()
    if (command === "close") { change(false); return }
    show(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  })
  // Capture on the window runs before every page and row key, so a kept letter never reaches them.
  const onOpeningKey = useEffectEvent((event: KeyboardEvent) => {
    if (typeahead.current === null) return
    const command = typeaheadKey(event, typeahead.current)
    if (!command) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (command.type === "close") change(false)
    else typeahead.current = command.text
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    const opening = (event: KeyboardEvent) => onOpeningKey(event)
    window.addEventListener("keydown", listener)
    window.addEventListener("keydown", opening, true)
    return () => { window.removeEventListener("keydown", listener); window.removeEventListener("keydown", opening, true) }
  }, [])
  useEffect(() => {
    if (!open) return
    const back = () => change(false)
    window.addEventListener("popstate", back)
    return () => window.removeEventListener("popstate", back)
  }, [open])
  useShellOpener("palette", request => {
    if (!open) show(request.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null))
  })

  return surfaces ? <surfaces.CommandPalette {...workspace} open={open} onOpenChange={change} returnFocusRef={returnFocus} pathname={pathname}
    takeTypeahead={() => { const typed = typeahead.current ?? ""; typeahead.current = null; return typed }} /> : null
}
