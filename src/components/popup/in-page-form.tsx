"use client"

import { useRef, type ReactNode } from "react"
import { DISMISS_FORM } from "./dismiss-form"
import { useBehaviour } from "./load-behaviour"
import styles from "./popup.module.css"

/**
 * #263: a form that opens inside the page (the Request page's Journey and Reviewers forms). Opening moves focus into
 * it. Escape closes only it, never the page behind: with typed text it first asks "Discard what you typed?" (Keep
 * editing keeps everything), with nothing typed it just closes. However it closes (Escape, Cancel, saving), focus goes
 * back to the button that opened it, or `returnFocus` when that button was replaced.
 *
 * Page-level Escape handlers call `dismissOpenForm` (dismiss-form.ts) first, so Escape with focus outside any field
 * still reaches it. The behaviour itself is in popup-behaviour.tsx, loaded once the page is idle.
 */
export function InPageForm({ onDismiss, returnFocus, children }: {
  /** Closes the form, as its Cancel does. */
  onDismiss: () => void
  returnFocus?: () => HTMLElement | null | undefined
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const behaviour = useBehaviour()
  return <>
    <div ref={ref} className={styles.content} data-detail-form=""
      onKeyDown={event => {
        if (event.key !== "Escape" || event.defaultPrevented || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.currentTarget.dispatchEvent(new Event(DISMISS_FORM))
      }}>
      {children}
    </div>
    {behaviour
      ? <behaviour.InPageFormBehaviour formRef={ref} onDismiss={onDismiss} returnFocus={returnFocus} />
      : <DismissWithoutGuard formRef={ref} onDismiss={onDismiss} />}
  </>
}

/** Until the behaviour loads, Escape still closes the form. */
function DismissWithoutGuard({ formRef, onDismiss }: { formRef: { current: HTMLDivElement | null }; onDismiss: () => void }) {
  return <span hidden ref={span => {
    const form = formRef.current
    if (!span || !form) return
    form.addEventListener(DISMISS_FORM, onDismiss)
    return () => form.removeEventListener(DISMISS_FORM, onDismiss)
  }} />
}
