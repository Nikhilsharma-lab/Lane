"use client"

import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react"
import { DialogContent as ArcDialogContent, type DialogContentProps as ArcDialogContentProps } from "@/components/arc/dialog/dialog"
import type { DialogContentProps, Popup } from "./adaptive-dialog"
import { DISMISS_FORM } from "./dismiss-form"
import { firstFocusTarget, focusWithoutScroll, isFocusable, openerOf } from "./focus"
import { hasTypedText } from "./typed-text"
import { preloadDiscardPrompt, useDiscardPrompt } from "./unsaved-text-guard"
import styles from "./popup.module.css"

/**
 * #263: what Lane's popups and in-page forms do beyond Arc's own overlays, loaded once the page is idle
 * (load-behaviour.ts). `AdaptiveContent` is the adaptive popup's content (adaptive-dialog.tsx);
 * `InPageFormBehaviour` is the in-page form's (in-page-form.tsx).
 */

/** Under 640px Lane's dialogs become bottom panels (polish bar §1). */
const PHONE = "(max-width: 639.98px)"
function subscribePhone(change: () => void) {
  const query = window.matchMedia(PHONE)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}
const usePhone = () => useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)

const loadPhoneSheet = () => import("./phone-sheet")
const PhoneSheet = lazy(loadPhoneSheet)

function omit<T extends object, K extends keyof T>(value: T, keys: K[]) {
  const copy = { ...value }
  for (const key of keys) delete copy[key]
  return copy as Omit<T, K>
}

export function AdaptiveContent({ popup, returnFocus, sheetClassName, onOpenAutoFocus, onCloseAutoFocus, children, ...props }: DialogContentProps & { popup: Popup }) {
  const { open, change, guardTypedText, guardRef } = popup
  const contentRef = useRef<HTMLDivElement | null>(null)
  const openerRef = useRef<Element | null>(null)
  const phoneNow = usePhone()
  // The form chosen when it opens holds until it closes.
  const [phone, setPhone] = useState(phoneNow)
  if (!open && phone !== phoneNow) setPhone(phoneNow)
  const { ask, prompt } = useDiscardPrompt()
  const losesText = () => guardTypedText && hasTypedText(contentRef.current)

  // Before the popup moves focus inside itself, note what had it.
  useLayoutEffect(() => { if (open) openerRef.current = openerOf(document.activeElement) }, [open])
  useEffect(() => { if (open && guardTypedText) preloadDiscardPrompt() }, [open, guardTypedText])
  useEffect(() => {
    guardRef.current = close => { if (!losesText()) return false; ask(close); return true }
    return () => { guardRef.current = null }
  })
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

  const body = <div ref={contentRef} className={styles.content} data-popup-content="">{children}</div>

  if (phone) {
    const { title, description, layout, ...rest } = props
    return <>
      <Suspense fallback={null}>
        <PhoneSheet open={open} onDismiss={() => change(false)} title={title} description={description}
          layout={layout === "composer" ? "composer" : "fit"} className={[styles.sheet, sheetClassName].filter(Boolean).join(" ")}
          confirmDismiss={() => !losesText()}
          contentProps={{ ...omit(rest, ["className", "overlayClassName"]), onOpenAutoFocus: opened, onCloseAutoFocus: closed }}>
          {body}
        </PhoneSheet>
      </Suspense>
      {prompt}
    </>
  }
  return <>
    <ArcDialogContent {...props} onOpenAutoFocus={opened} onCloseAutoFocus={closed}>{body}</ArcDialogContent>
    {prompt}
  </>
}

/** The in-page form's behaviour: focus in on open, back on close, and the typed-text guard on Escape. */
export function InPageFormBehaviour({ formRef, onDismiss, returnFocus }: {
  formRef: RefObject<HTMLDivElement | null>
  onDismiss: () => void
  returnFocus?: () => HTMLElement | null | undefined
}) {
  const { ask, prompt } = useDiscardPrompt()
  const dismissRef = useRef(onDismiss)
  const returnRef = useRef(returnFocus)
  useEffect(() => { dismissRef.current = onDismiss; returnRef.current = returnFocus })

  useLayoutEffect(() => {
    const form = formRef.current
    preloadDiscardPrompt()
    const opener = openerOf(document.activeElement)
    if (form && !form.contains(document.activeElement)) focusWithoutScroll(firstFocusTarget(form))
    const dismiss = () => { if (hasTypedText(form)) ask(() => dismissRef.current()); else dismissRef.current() }
    form?.addEventListener(DISMISS_FORM, dismiss)
    return () => {
      form?.removeEventListener(DISMISS_FORM, dismiss)
      // Still attached here. Focus inside the closing form (or its Discard), or already dropped to the page, goes back to the opener.
      const active = document.activeElement
      if (!form || !(!active || active === document.body || form.contains(active) || active.closest("[data-discard-prompt]"))) return
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return
        if (!focusWithoutScroll(isFocusable(opener) ? opener : null)) focusWithoutScroll(returnRef.current?.())
      })
    }
  }, [ask, formRef])

  return prompt
}
