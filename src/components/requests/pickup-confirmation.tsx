"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogClose, DialogContent } from "@/components/arc/dialog/dialog"
import { pickupConfirmation, type PickupConfirmation, type ReviewState } from "@/lib/request-reviewer-rules"
import detailStyles from "./detail.module.css"
import styles from "./pickup-confirmation.module.css"

export type PickupTarget = { id: string; name: string; reviewState?: ReviewState | null }
/** Resolves true to pick up: at once when nothing is outstanding, else once the person confirms. */
export type ConfirmPickup = (targets: PickupTarget[]) => Promise<boolean>

/** A reviewers panel tells the confirmation what it last read for its Request; undefined when it goes away. */
export type ReportReviewState = (requestId: string, state: ReviewState | null | undefined) => void

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
  const resolver = useRef<((confirmed: boolean) => void) | null>(null)
  const latest = useRef(new Map<string, ReviewState | null>())

  const report = useCallback<ReportReviewState>((requestId, state) => {
    if (state === undefined) latest.current.delete(requestId)
    else latest.current.set(requestId, state)
  }, [])

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed)
    resolver.current = null
    setShown(null)
  }, [])

  const confirm = useCallback<ConfirmPickup>(targets => {
    const confirmation = pickupConfirmation(targets, latest.current)
    if (!confirmation) return Promise.resolve(true)
    // A second request while one is open cancels the first.
    resolver.current?.(false)
    return new Promise<boolean>(resolve => {
      resolver.current = resolve
      setShown(confirmation)
    })
  }, [])

  const value = useMemo(() => ({ confirm, report }), [confirm, report])
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
