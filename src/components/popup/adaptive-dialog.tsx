"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ComponentPropsWithoutRef, Ref, RefObject } from "react"
import { Dialog as ArcDialog, DialogContent as ArcDialogContent, type DialogContentProps as ArcDialogContentProps } from "@/components/arc/dialog/dialog"
import { firstFocusTarget, focusWithoutScroll, isFocusable, openerOf, type ReturnFocus } from "./focus"
import { useBehaviour } from "./load-behaviour"
import { hasTypedText } from "./typed-text"
import { preloadDiscardPrompt, useDiscardPrompt } from "./unsaved-text-guard"
import styles from "./popup.module.css"

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
 * - `guardTypedText` (on Dialog) asks "Discard what you typed?" before Escape, the ×, a press outside or Back drops
 *   typed text. Leave it off where closing keeps the text (the New Request and Edit Request composers keep drafts).
 *   A Cancel built with this file's `DialogClose` is a deliberate discard and just closes.
 * - On a phone, Back closes the panel.
 *
 * Focus and the guard load with the page, so they work from the first moment. Only the switch to the phone panel
 * waits (popup-behaviour.tsx, through load-behaviour.ts); until it arrives a popup opens as the centred Arc dialog.
 * Menus and small pickers (Arc popover, dropdown-menu, context-menu, the date range picker's own popover) stay as
 * they are, and so do the command palette and workspace search, which build 4 owns.
 */

/** The content's guard: asks before `close` drops typed text and returns true, or returns false to close now. */
export type CloseGuard = (close: () => void) => boolean
export type Popup = {
  open: boolean
  change: (open: boolean) => void
  guardTypedText: boolean
  dismissible: boolean
  guardRef: RefObject<CloseGuard | null>
  /** `DialogClose` calls it just before it closes the popup: a deliberate discard, which never asks. */
  closeOnPurpose: () => void
}
const PopupContext = createContext<Popup | null>(null)

export function Dialog({ open: openProp, defaultOpen = false, onOpenChange, guardTypedText = false, dismissible = true, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Root> & {
  /** Ask "Discard what you typed?" before a close would drop text typed into this popup's fields. */
  guardTypedText?: boolean
  /** Hold the popup in place while its content is saving, including a phone-sheet drag. */
  dismissible?: boolean
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const guardRef = useRef<CloseGuard | null>(null)
  const deliberateRef = useRef(false)
  const change = useCallback((next: boolean) => {
    const commit = () => { if (openProp === undefined) setUncontrolled(next); onOpenChange?.(next) }
    const deliberate = deliberateRef.current
    deliberateRef.current = false
    if (!next && !dismissible) return
    if (!next && guardTypedText && !deliberate && guardRef.current?.(commit)) return
    commit()
  }, [dismissible, guardTypedText, openProp, onOpenChange])
  const value = useMemo(() => ({ open, change, guardTypedText, dismissible, guardRef, closeOnPurpose: () => { deliberateRef.current = true } }), [open, change, guardTypedText, dismissible])
  return <PopupContext.Provider value={value}><ArcDialog {...props} open={open} onOpenChange={change} /></PopupContext.Provider>
}

export const DialogTrigger = DialogPrimitive.Trigger

/**
 * A control that closes the popup on purpose, such as Cancel: it never asks "Discard what you typed?". The popup's
 * own ×, Escape, a press outside and Back still ask.
 */
export function DialogClose({ onClick, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Close> & { ref?: Ref<HTMLButtonElement> }) {
  const popup = useContext(PopupContext)
  return <DialogPrimitive.Close {...props} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented) popup?.closeOnPurpose()
  }} />
}

/** A copy of `value` without `keys`: how this folder passes props on without the ones meant for something else. */
function withoutKeys<T extends object, K extends keyof T>(value: T, keys: K[]) {
  const copy = { ...value }
  for (const key of keys) delete copy[key]
  return copy as Omit<T, K>
}

export interface DialogContentProps extends ArcDialogContentProps {
  /** Where focus goes on close when the control that opened the popup is gone (it was replaced, or it was a menu item). */
  returnFocus?: ReturnFocus
  /** Class for the phone panel's surface, where `className` styles the centred dialog. */
  sheetClassName?: string
  /** A phone drag springs back before a close owner handles a busy operation or a confirmation. */
  canDismiss?: () => boolean
}

export function DialogContent({ returnFocus, sheetClassName, canDismiss, onOpenAutoFocus, onCloseAutoFocus, children, ...props }: DialogContentProps) {
  const popup = useContext(PopupContext)
  if (!popup) throw new Error("DialogContent needs Dialog from @/components/popup/adaptive-dialog.")
  const { open, change, guardTypedText, dismissible, guardRef } = popup
  const contentRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<Element | null>(null)
  const { ask, prompt } = useDiscardPrompt()
  const losesText = () => guardTypedText && hasTypedText(contentRef.current)

  // Before the popup moves focus inside itself, note what had it.
  useLayoutEffect(() => { if (open) openerRef.current = openerOf(document.activeElement) }, [open])
  useEffect(() => { if (open && guardTypedText) preloadDiscardPrompt() }, [open, guardTypedText])
  useEffect(() => {
    guardRef.current = close => { if (!losesText()) return false; ask(close); return true }
    return () => { guardRef.current = null }
  })

  const behaviour = useBehaviour()
  // The phone switch takes over only between opens, so an open popup never remounts what it holds.
  const [Adaptive, setAdaptive] = useState(() => behaviour?.AdaptiveForm ?? null)
  if (!Adaptive && behaviour && !open) setAdaptive(() => behaviour.AdaptiveForm)

  const opened: ArcDialogContentProps["onOpenAutoFocus"] = event => {
    onOpenAutoFocus?.(event)
    if (event.defaultPrevented) return
    // A field with autoFocus already has it.
    if (contentRef.current?.contains(document.activeElement)) { event.preventDefault(); return }
    const target = firstFocusTarget(contentRef.current)
    if (target) { event.preventDefault(); focusWithoutScroll(target) }
  }
  const closed: ArcDialogContentProps["onCloseAutoFocus"] = event => {
    onCloseAutoFocus?.(event)
    if (event.defaultPrevented) return
    const from = openerRef.current
    openerRef.current = null
    const target = isFocusable(from) ? from : returnFocus?.()
    if (target) { event.preventDefault(); focusWithoutScroll(target) }
  }

  const body = <div ref={contentRef} className={styles.content} data-popup-content="">{children}</div>
  const desktop = <ArcDialogContent {...props} onOpenAutoFocus={opened} onCloseAutoFocus={closed}>{body}</ArcDialogContent>
  if (!Adaptive) return <>{desktop}{prompt}</>
  // The panel takes the dialog's content props except the centred dialog's own classes.
  const { title, description, layout, ...panelProps } = withoutKeys(props, ["className", "overlayClassName"])
  return <>
    <Adaptive open={open} desktop={desktop} sheet={{
      open, onDismiss: () => change(false), title, description, layout: layout === "composer" ? "composer" : "fit",
      className: [styles.sheet, sheetClassName].filter(Boolean).join(" "), confirmDismiss: () => dismissible && !losesText() && (canDismiss?.() ?? true),
      contentProps: { ...panelProps, onOpenAutoFocus: opened, onCloseAutoFocus: closed }, children: body,
    }} />
    {prompt}
  </>
}
