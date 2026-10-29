"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import type { ComponentPropsWithoutRef, RefObject } from "react"
import { Dialog as ArcDialog, DialogContent as ArcDialogContent, type DialogContentProps as ArcDialogContentProps } from "@/components/arc/dialog/dialog"
import { firstFocusTarget, focusWithoutScroll, isFocusable, openerOf } from "./focus"
import { hasTypedText } from "./typed-text"
import { useDiscardPrompt } from "./unsaved-text-guard"
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
 * - `guardTypedText` (on Dialog) asks "Discard what you typed?" before Escape, Close, a press outside or Back drops typed text.
 *   Leave it off where closing keeps the text (the New Request and Edit Request composers keep their drafts).
 * - On a phone, Back closes the panel.
 *
 * Menus and small pickers (Arc popover, dropdown-menu, context-menu, the date range dialogs, the command palette)
 * stay as they are.
 */

/** Under 640px Lane's dialogs become bottom panels (polish bar §1). */
const PHONE = "(max-width: 639.98px)"
function subscribePhone(change: () => void) {
  const query = window.matchMedia(PHONE)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}
const usePhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)

function omit<T extends object, K extends keyof T>(value: T, keys: K[]) {
  const copy = { ...value }
  for (const key of keys) delete copy[key]
  return copy as Omit<T, K>
}

const loadPhoneSheet = () => import("./phone-sheet")
const PhoneSheet = lazy(loadPhoneSheet)

type Popup = {
  open: boolean
  phone: boolean
  change: (open: boolean) => void
  /** Whether closing now would drop typed text (with `guardTypedText`); the content keeps it current. */
  losesText: () => boolean
  contentRef: RefObject<HTMLElement | null>
  openerRef: RefObject<Element | null>
}
const PopupContext = createContext<Popup | null>(null)
PopupContext.displayName = "LanePopup"

export function Dialog({ open: openProp, defaultOpen = false, onOpenChange, guardTypedText = false, children, ...props }: ComponentPropsWithoutRef<typeof DialogPrimitive.Root> & {
  /** Ask "Discard what you typed?" before a close would drop text typed into this popup's fields. */
  guardTypedText?: boolean
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const phoneNow = usePhone()
  const [phone, setPhone] = useState(phoneNow)
  if (!open && phone !== phoneNow) setPhone(phoneNow)
  const contentRef = useRef<HTMLElement | null>(null)
  const openerRef = useRef<Element | null>(null)
  const { ask, prompt } = useDiscardPrompt()

  const commit = useCallback((next: boolean) => {
    if (openProp === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }, [openProp, onOpenChange])
  const losesText = useCallback(() => guardTypedText && hasTypedText(contentRef.current), [guardTypedText])
  const change = useCallback((next: boolean) => {
    if (!next && losesText()) { ask(() => commit(false)); return }
    commit(next)
  }, [ask, commit, losesText])

  // Before the popup moves focus inside itself, note what had it.
  useLayoutEffect(() => { if (open) openerRef.current = openerOf(document.activeElement) }, [open])

  const value = useMemo(() => ({ open, phone, change, losesText, contentRef, openerRef }), [open, phone, change, losesText])
  return <PopupContext.Provider value={value}>
    <ArcDialog {...props} open={open} onOpenChange={change}>{children}</ArcDialog>
    {prompt}
  </PopupContext.Provider>
}

export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export interface DialogContentProps extends ArcDialogContentProps {
  /** Where focus goes on close when the control that opened the popup is gone (it was replaced, or it was a menu item). */
  returnFocus?: () => HTMLElement | null | undefined
  /** Class for the phone panel's surface, where `className` styles the centred dialog. */
  sheetClassName?: string
}

export function DialogContent({ returnFocus, sheetClassName, onOpenAutoFocus, onCloseAutoFocus, children, ...props }: DialogContentProps) {
  const popup = useContext(PopupContext)
  if (!popup) throw new Error("DialogContent needs Dialog from @/components/popup/adaptive-dialog.")
  const { contentRef, openerRef, phone } = popup
  // Fetch the phone panel as soon as this is a phone, so the first open never waits for it.
  useEffect(() => { if (phone) void loadPhoneSheet().catch(() => undefined) }, [phone])

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

  const body = <div ref={element => { contentRef.current = element }} className={styles.content} data-popup-content="">{children}</div>

  if (phone) {
    const { title, description, layout, ...rest } = props
    const contentProps = omit(rest, ["className", "overlayClassName"])
    return <Suspense fallback={null}>
      <PhoneSheet open={popup.open} onDismiss={() => popup.change(false)} title={title} description={description}
        layout={layout === "composer" ? "composer" : "fit"} className={[styles.sheet, sheetClassName].filter(Boolean).join(" ")}
        confirmDismiss={() => !popup.losesText()}
        contentProps={{ ...contentProps, onOpenAutoFocus: opened, onCloseAutoFocus: closed }}>
        {body}
      </PhoneSheet>
    </Suspense>
  }
  return <ArcDialogContent {...props} onOpenAutoFocus={opened} onCloseAutoFocus={closed}>{body}</ArcDialogContent>
}
