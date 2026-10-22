"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import type { PickupConfirmation } from "@/lib/request-reviewer-rules"
import detailStyles from "./detail.module.css"
import { createPickupConfirmation, type ConfirmPickup, type ReportReviewState } from "./pickup-confirmation-store"
import styles from "./pickup-confirmation.module.css"

export type { ConfirmPickup, PickupTarget, ReportReviewState } from "./pickup-confirmation-store"

const PickupConfirmationContext = createContext<{ confirm: ConfirmPickup; report: ReportReviewState } | null>(null)
PickupConfirmationContext.displayName = "PickupConfirmation"

const pickUpAtOnce: ConfirmPickup = async () => true
const reportNowhere: ReportReviewState = () => {}

/**
 * #77: the one pickup confirmation, used by the detail button, the detail
 * status control, the row menu and the bulk bar. It opens only when a
 * Request has an open concern or an unanswered review, lists each concern
 * (who and why) and the unanswered count, and asks "Pick up anyway?". Bulk
 * pickup passes every selected Request and gets one combined confirmation.
 * Reviews never block pickup; the server does not check them.
 *
 * The page and the preview load review state with the Request, and the
 * preview loads it on demand, so either copy can be older than a reviewer
 * just added, removed or answered. The reviewers panel reports what it last
 * read, and that wins for its Request at every entry point.
 */
export function PickupConfirmationProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<PickupConfirmation | null>(null)
  // The logic lives in pickup-confirmation-store.ts; this is its dialog. Its functions keep their identity.
  const [value] = useState(() => createPickupConfirmation(setShown))
  const { settle } = value
  const single = shown?.requests.length === 1
  return <PickupConfirmationContext.Provider value={value}>
    {children}
    <Dialog open={shown !== null} onOpenChange={open => { if (!open) settle(false) }}>
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
  </PickupConfirmationContext.Provider>
}

/** The shared confirmation. Outside the provider (an isolated fixture) pickup goes ahead at once. */
export function usePickupConfirmation(): ConfirmPickup {
  return useContext(PickupConfirmationContext)?.confirm ?? pickUpAtOnce
}

/** For the reviewers panel: report what it read so pickup confirms from it. Outside the provider it goes nowhere. */
export function useReportReviewState(): ReportReviewState {
  return useContext(PickupConfirmationContext)?.report ?? reportNowhere
}
