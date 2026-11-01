"use client"

import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/popup/adaptive-dialog"
import type { PickupConfirmation } from "@/lib/request-reviewer-rules"
import detailStyles from "./detail.module.css"
import styles from "./pickup-confirmation.module.css"

/** #77: the "Pick up anyway?" dialog, opened by PickupConfirmationProvider (pickup-confirmation.tsx) when a pickup has something outstanding. */
export function PickupConfirmationDialog({ shown, settle }: { shown: PickupConfirmation | null; settle: (confirmed: boolean) => void }) {
  const single = shown?.requests.length === 1
  return <Dialog open={shown !== null} onOpenChange={open => { if (!open) settle(false) }}>
      {shown && <DialogContent title={shown.title}
        description={single ? "Reviews never block pickup. Check what is outstanding first." : "Reviews never block pickup. Some selected Requests have something outstanding."}>
        <ul className={styles.list} data-pickup-confirmation="">
          {shown.requests.map((request, index) => <li key={index} className={styles.request}>
            <p><span className={styles.name}>{request.name}</span> <span className={styles.muted}>{request.summary}</span></p>
            {request.concerns.length > 0 && <ul className={styles.concerns} aria-label={`Concerns on ${request.name}`}>
              {request.concerns.map((concern, concernIndex) => <li key={concernIndex}>
                <p><span className={styles.name}>{concern.name}</span> raised a concern</p>
                <p className={styles.muted}>{concern.reason}</p>
              </li>)}
            </ul>}
          </li>)}
        </ul>
        <div className={detailStyles.dialogActions}>
          <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
          <Button onClick={() => settle(true)}>Pick up anyway</Button>
        </div>
      </DialogContent>}
    </Dialog>
}
