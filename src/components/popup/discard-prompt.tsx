"use client"

import { useRef } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { focusWithoutScroll } from "./focus"
import styles from "./popup.module.css"

/** #263: the unsaved-text guard's dialog (unsaved-text-guard.tsx), loaded the first time a guarded popup or form opens. */
export default function DiscardPrompt({ open, onKeep, onDiscard, returnTo }: {
  open: boolean
  onKeep: () => void
  onDiscard: () => void
  /** Where focus goes back to after Keep editing. */
  returnTo: { current: Element | null }
}) {
  const keep = useRef<HTMLButtonElement>(null)
  const discarded = useRef(false)
  return <Dialog open={open} onOpenChange={next => { if (!next) onKeep() }}>
    <DialogContent title="Discard what you typed?" description="What you typed here hasn't been saved." data-discard-prompt=""
      onOpenAutoFocus={event => { event.preventDefault(); discarded.current = false; keep.current?.focus({ preventScroll: true }) }}
      onCloseAutoFocus={event => {
        event.preventDefault()
        // After Discard, whatever held the text is closing and hands focus on itself.
        if (!discarded.current && returnTo.current instanceof HTMLElement) focusWithoutScroll(returnTo.current)
      }}>
      <div className={styles.actions}>
        <Button ref={keep} variant="secondary" onClick={onKeep}>Keep editing</Button>
        <Button variant="danger" onClick={() => { discarded.current = true; onDiscard() }}>Discard</Button>
      </div>
    </DialogContent>
  </Dialog>
}
