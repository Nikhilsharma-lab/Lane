"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import type { ComponentPropsWithoutRef, RefObject } from "react"
import { Dialog as ArcDialog, DialogContent as ArcDialogContent, type DialogContentProps as ArcDialogContentProps } from "@/components/arc/dialog/dialog"
import { useBehaviour } from "./load-behaviour"

/**
 * #263: Lane's one popup. Every Lane dialog imports `Dialog`, `DialogContent`, `DialogTrigger` and `DialogClose`
 * from here instead of `@/components/arc/dialog/dialog`, with Arc's props unchanged.
 *
 * - At 640px and wider it is Arc `dialog`; under 640px it is Arc `bottom-sheet`, which loads only on a phone.
 *   Both take the same title, description and content, and both use Arc's motion presets (`motion-tokens.ts`).
 *   The form chosen when it opens holds until it closes, so turning a phone never remounts what's typed.
 * - Opening focuses the first field, else the first control in the content (a confirmation's Cancel), never the ×.
 *   Its own `onOpenAutoFocus` still wins.
 * - Closing hands focus back to the control that opened it (a menu's button when a menu item did), or to
 *   `returnFocus` when that control is gone. Its own `onCloseAutoFocus` still wins.
 * - `guardTypedText` (on Dialog) asks "Discard what you typed?" before Escape, Close, a press outside or Back drops
 *   typed text. Leave it off where closing keeps the text (the New Request and Edit Request composers keep drafts).
 * - On a phone, Back closes the panel.
 *
 * This file is the part every page loads; the behaviour is popup-behaviour.tsx (load-behaviour.ts).
 * Menus and small pickers (Arc popover, dropdown-menu, context-menu, the date range dialogs, the command palette)
 * stay as they are.
 */

/** The content's guard: asks before `close` drops typed text and returns true, or returns false to close now. */
export type CloseGuard = (close: () => void) => boolean
export type Popup = { open: boolean; change: (open: boolean) => void; guardTypedText: boolean; guardRef: RefObject<CloseGuard | null> }
const PopupContext = createContext<Popup | null>(null)

export function Dialog({ open: openProp, defaultOpen = false, onOpenChange, guardTypedText = false, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Root> & {
  /** Ask "Discard what you typed?" before a close would drop text typed into this popup's fields. */
  guardTypedText?: boolean
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const guardRef = useRef<CloseGuard | null>(null)
  const change = useCallback((next: boolean) => {
    const commit = () => { if (openProp === undefined) setUncontrolled(next); onOpenChange?.(next) }
    if (!next && guardTypedText && guardRef.current?.(commit)) return
    commit()
  }, [guardTypedText, openProp, onOpenChange])
  const value = useMemo(() => ({ open, change, guardTypedText, guardRef }), [open, change, guardTypedText])
  return <PopupContext.Provider value={value}><ArcDialog {...props} open={open} onOpenChange={change} /></PopupContext.Provider>
}

export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export interface DialogContentProps extends ArcDialogContentProps {
  /** Where focus goes on close when the control that opened the popup is gone (it was replaced, or it was a menu item). */
  returnFocus?: () => HTMLElement | null | undefined
  /** Class for the phone panel's surface, where `className` styles the centred dialog. */
  sheetClassName?: string
}

export function DialogContent(props: DialogContentProps) {
  const popup = useContext(PopupContext)
  if (!popup) throw new Error("DialogContent needs Dialog from @/components/popup/adaptive-dialog.")
  const behaviour = useBehaviour()
  // The behaviour takes over only between opens, so an open popup never remounts what it holds.
  const [Content, setContent] = useState(() => behaviour?.AdaptiveContent ?? null)
  if (!Content && behaviour && !popup.open) setContent(() => behaviour.AdaptiveContent)
  if (Content) return <Content {...props} popup={popup} />
  const arc = { ...props }
  delete arc.returnFocus
  delete arc.sheetClassName
  return <ArcDialogContent {...arc} />
}
