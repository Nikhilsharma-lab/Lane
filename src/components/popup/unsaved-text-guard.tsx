"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { focusWithoutScroll } from "./focus"
import styles from "./popup.module.css"

export const DISCARD_COPY = {
  title: "Discard what you typed?",
  description: "What you typed here hasn't been saved.",
  keep: "Keep editing",
  discard: "Discard",
} as const

/**
 * #263: the one unsaved-text guard. `ask(discard)` shows "Discard what you typed?" with Keep editing (focused) and
 * Discard. Keep editing, Escape, Close or a press outside keep everything and put focus back where it was; Discard
 * runs `discard`. Callers ask only when `hasTypedText` (typed-text.ts) says closing would lose something.
 */
export function useDiscardPrompt(): { ask: (discard: () => void) => void; prompt: ReactNode } {
  const [pending, setPending] = useState<(() => void) | null>(null)
  const returnTo = useRef<Element | null>(null)
  const discarded = useRef(false)
  const keep = useRef<HTMLButtonElement>(null)

  const ask = useCallback((discard: () => void) => {
    returnTo.current = document.activeElement
    discarded.current = false
    setPending(() => discard)
  }, [])

  const prompt = <Dialog open={pending !== null} onOpenChange={open => { if (!open) setPending(null) }}>
    <DialogContent title={DISCARD_COPY.title} description={DISCARD_COPY.description} data-discard-prompt=""
      onOpenAutoFocus={event => { event.preventDefault(); keep.current?.focus({ preventScroll: true }) }}
      onCloseAutoFocus={event => {
        event.preventDefault()
        // After Discard, whatever held the text is closing and hands focus on itself.
        if (!discarded.current && returnTo.current instanceof HTMLElement) focusWithoutScroll(returnTo.current)
        returnTo.current = null
      }}>
      <div className={styles.actions}>
        <Button ref={keep} variant="secondary" onClick={() => setPending(null)}>{DISCARD_COPY.keep}</Button>
        <Button variant="danger" onClick={() => {
          const discard = pending
          discarded.current = true
          setPending(null)
          discard?.()
        }}>{DISCARD_COPY.discard}</Button>
      </div>
    </DialogContent>
  </Dialog>

  return { ask, prompt }
}
