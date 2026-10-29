"use client"

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { firstFocusTarget, focusWithoutScroll, isFocusable, openerOf } from "./focus"
import { hasTypedText } from "./typed-text"
import { useDiscardPrompt } from "./unsaved-text-guard"
import styles from "./popup.module.css"

/** Dispatched on an open in-page form to ask it to close, as Escape does. */
const DISMISS = "lane:dismiss-form"

/**
 * #263: a form that opens inside the page (the Request page's Journey and Reviewers forms). Opening moves focus into
 * it. Escape closes only it, never the page behind: with typed text it first asks "Discard what you typed?" (Keep
 * editing keeps everything), with nothing typed it just closes. However it closes (Escape, Cancel, saving), focus goes
 * back to the button that opened it, or `returnFocus` when that button was replaced.
 *
 * Page-level Escape handlers call `dismissOpenForm` first, so Escape with focus outside any field still reaches it.
 */
export function InPageForm({ onDismiss, returnFocus, children }: {
  /** Closes the form, as its Cancel does. */
  onDismiss: () => void
  returnFocus?: () => HTMLElement | null | undefined
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const opener = useRef<Element | null>(null)
  const { ask, prompt } = useDiscardPrompt()
  const dismissRef = useRef(onDismiss)
  const returnRef = useRef(returnFocus)
  useEffect(() => { dismissRef.current = onDismiss; returnRef.current = returnFocus })

  const dismiss = useRef(() => {
    if (hasTypedText(ref.current)) ask(() => dismissRef.current())
    else dismissRef.current()
  })

  useLayoutEffect(() => {
    const form = ref.current
    opener.current = openerOf(document.activeElement)
    if (form && !form.contains(document.activeElement)) focusWithoutScroll(firstFocusTarget(form))
    const listener = () => dismiss.current()
    form?.addEventListener(DISMISS, listener)
    return () => {
      form?.removeEventListener(DISMISS, listener)
      // Still attached here. Focus inside the closing form (or its Discard), or already dropped to the page, goes back to the opener.
      const active = document.activeElement
      if (!form || !(!active || active === document.body || form.contains(active) || active.closest("[data-discard-prompt]"))) return
      const from = opener.current
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return
        if (!focusWithoutScroll(isFocusable(from) ? from : null)) focusWithoutScroll(returnRef.current?.())
      })
    }
  }, [])

  return <>
    <div ref={ref} className={styles.content} data-detail-form=""
      onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return
        event.preventDefault()
        dismiss.current()
      }}>
      {children}
    </div>
    {prompt}
  </>
}

/**
 * For page-level Escape handlers: asks the open in-page form inside `scope` (the one holding focus, else the last)
 * to close, and returns true, so the page itself does nothing else with this Escape.
 */
export function dismissOpenForm(scope: ParentNode = document) {
  const forms = Array.from(scope.querySelectorAll("[data-detail-form]"))
  const form = forms.find(element => element.contains(document.activeElement)) ?? forms.at(-1)
  if (!form) return false
  form.dispatchEvent(new Event(DISMISS))
  return true
}
