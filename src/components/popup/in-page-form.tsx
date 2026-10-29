"use client"

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react"
import { DISMISS_FORM } from "./dismiss-form"
import { firstFocusTarget, focusWithoutScroll, isFocusable, openerOf, type ReturnFocus } from "./focus"
import { hasTypedText } from "./typed-text"
import { preloadDiscardPrompt, useDiscardPrompt } from "./unsaved-text-guard"
import styles from "./popup.module.css"

/**
 * #263: a form that opens inside the page (the Request page's Journey and Reviewers forms, the Quarter note editor).
 * Opening moves focus into it. Escape closes only it, never the page behind: with typed text it first asks "Discard
 * what you typed?" (Keep editing keeps everything), with nothing typed it just closes. However it closes (Escape,
 * Cancel, saving), focus goes back to the button that opened it, or `returnFocus` when that button was replaced.
 *
 * Page-level Escape handlers call `dismissOpenForm` (dismiss-form.ts) first, so Escape with focus outside any field
 * still reaches it. All of this loads with the page, so it holds from the moment the form opens.
 */
export function InPageForm({ onDismiss, returnFocus, children }: {
  /** Closes the form, as its Cancel does. */
  onDismiss: () => void
  returnFocus?: ReturnFocus
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { ask, prompt } = useDiscardPrompt()
  const dismissRef = useRef(onDismiss)
  const returnRef = useRef(returnFocus)
  useEffect(() => { dismissRef.current = onDismiss; returnRef.current = returnFocus })

  useLayoutEffect(() => {
    const form = ref.current
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
  }, [ask])

  return <>
    <div ref={ref} className={styles.content} data-detail-form=""
      onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.currentTarget.dispatchEvent(new Event(DISMISS_FORM))
      }}>
      {children}
    </div>
    {prompt}
  </>
}
