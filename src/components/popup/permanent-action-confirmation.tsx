"use client"

import { useRef, type ReactNode } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "./adaptive-dialog"
import type { ReturnFocus } from "./focus"
import styles from "./popup.module.css"

/**
 * #263 (polish bar §2): the shared "are you sure?" for an action that can't be undone, on the adaptive popup.
 * It names the thing and what will happen, opens with focus on Cancel so a habitual Enter changes nothing, and
 * its confirm button is red and named for the action ("Delete Request", never "OK"). The screen builds move each
 * permanent action onto it. `children` sits above the buttons (a failure message, for one).
 */
export function PermanentActionConfirmation({ open, onOpenChange, trigger, title, description, confirmLabel, onConfirm, busy = false, returnFocus, children }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The control that opens it, when it has one; focus returns to it. */
  trigger?: ReactNode
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  busy?: boolean
  returnFocus?: ReturnFocus
  children?: ReactNode
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  return <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next) }}>
    {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
    <DialogContent title={title} description={description} returnFocus={returnFocus} data-permanent-action=""
      onOpenAutoFocus={event => { event.preventDefault(); cancel.current?.focus({ preventScroll: true }) }}>
      {children}
      <div className={styles.actions}>
        <DialogClose asChild><Button ref={cancel} variant="secondary" disabled={busy}>Cancel</Button></DialogClose>
        <Button variant="danger" loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>
}
