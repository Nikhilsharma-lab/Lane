"use client"

import { useEffect, useEffectEvent, useRef, useState, type ComponentType } from "react"
import { useToastStack } from "@/components/arc/toast-stack/toast-stack"
import { isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import type { CommandPaletteProps, CommandPaletteWorkspace } from "./command-palette"
import { paletteShortcut } from "./command-palette-shortcut"
import { loadShellSurfaces } from "./workspace-search-pane-lazy"

type Palette = ComponentType<CommandPaletteProps>

// Issue #106 (spec #101): only this listener and loader are in every route's first load. The palette
// itself loads on demand with the search pane (shell-lazy-surfaces.ts, #107). The shell's idle preload
// of that module (sidebar-view.tsx, on every page, Settings included) fetches it for both, so the first
// ⌘K finds it in memory; before that lands, ⌘K fetches it. From then on it renders synchronously.
// The precedent is workspace-search-pane-lazy.tsx.
let loaded: Palette | null = null
const load = () => loadShellSurfaces().then(module => (loaded = module.CommandPalette))

/**
 * ⌘K or Ctrl+K anywhere in the signed-in app, Settings included (the shell
 * mounts this in both of its branches). A second ⌘K closes it. Closed, it
 * respects the shared typing and overlay guards. Focus goes back to what had
 * it when ⌘K was pressed.
 */
export function CommandPaletteHost(props: CommandPaletteWorkspace & { pathname: string }) {
  const { pathname, ...workspace } = props
  const [Component, setComponent] = useState<Palette | null>(() => loaded)
  const [open, setOpen] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const { toast } = useToastStack()
  // Every navigation closes it, including one it did not start (Back).
  const [shownAt, setShownAt] = useState(pathname)
  if (shownAt !== pathname) { setShownAt(pathname); setOpen(false) }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const command = paletteShortcut(event, { open, typing: isTypingTarget(event.target), overlay: !open && overlayOpen() })
    if (!command) return
    event.preventDefault()
    if (command === "close") { setOpen(false); return }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(true)
    if (!Component) load().then(palette => setComponent(() => palette), () => {
      setOpen(false)
      toast({ type: "error", title: "Couldn't open the command palette", description: "Check your connection and try again." })
    })
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])

  return Component ? <Component {...workspace} open={open} onOpenChange={setOpen} returnFocusRef={returnFocus} /> : null
}
