"use client";

import { Button } from "@/components/arc/button/button";
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog";
import { PAID_SEAT_CONFIRMATION, PAID_SEAT_DETAIL, paidSeatSummary, type PaidSeatChange } from "@/lib/member-role-rules";
import styles from "./settings.module.css";

export type PaidSeatDialogProps = {
  change: PaidSeatChange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** The `data-seat-return` value of the control focus goes back to when the dialog closes. */
  returnTo: string;
};

/**
 * #215: "This adds a paid seat", asked before an Admin adds a Member or Admin while billing is enforced. Settings →
 * Members loads it only when it is first needed, so it adds nothing to any page's first load.
 */
export function PaidSeatDialog({ change, open, onOpenChange, onConfirm, returnTo }: PaidSeatDialogProps) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title={PAID_SEAT_CONFIRMATION} description={PAID_SEAT_DETAIL}
      onCloseAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLElement>(`[data-seat-return="${CSS.escape(returnTo)}"]`)?.focus(); }}>
      <p>{paidSeatSummary(change)}</p>
      <div className={styles.dialogActions}>
        <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
        <Button onClick={onConfirm}>Add paid seat</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
