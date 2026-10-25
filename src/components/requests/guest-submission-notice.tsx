"use client"
import { useState, type ReactNode } from "react"
import { Badge } from "@/components/arc/badge/badge"
import { Button } from "@/components/arc/button/button"
import { takeOnGuestSubmission } from "@/app/(app)/requests/[id]/take-on-actions"
import { guestSubmissionNotice, WAITING_TO_BE_TAKEN_ON, type GuestNoticeReader, type GuestSubmissionView } from "@/lib/guest-submission"
import { useJourneyChange } from "./use-journey-change"
import detailStyles from "./detail.module.css"

/**
 * #212: a Guest submission on Request detail. It says who filed it and who took it on; an Admin or Member takes a
 * waiting one on here, and whoever took it on is asked for the prediction (`writePrediction`: the editor's trigger,
 * and the same editor already open, shown right after taking it on). Elements, not render functions, so a server
 * render can pass them.
 */
export function GuestSubmissionNotice({ requestId, orgId, revision, view, reader, hasPrediction, writePrediction }: {
  requestId: string; orgId: string; revision: number; view: GuestSubmissionView; reader: GuestNoticeReader; hasPrediction: boolean
  writePrediction: { offered: ReactNode; asked: ReactNode } | null
}) {
  const { busy, error, save } = useJourneyChange({ requestId, orgId, failed: "Could not take this on. Try again." })
  const [tookOn, setTookOn] = useState(false)
  const notice = guestSubmissionNotice(view, reader, hasPrediction)
  return <section id="guest-submission" aria-labelledby="guest-submission-heading" className={detailStyles.section} data-guest-submission={view.state}>
    <div className={detailStyles.sectionHeader}>
      <h2 id="guest-submission-heading" className={detailStyles.sectionHeading}>Guest submission</h2>
      {view.state === "waiting" && <Badge size="sm" tone="warning">{WAITING_TO_BE_TAKEN_ON}</Badge>}
    </div>
    <p className={detailStyles.secondaryText}>{notice.text}</p>
    {notice.action === "take_on" && <div>
      <Button size="sm" loading={busy} onClick={async () => {
        // Asked before the answer lands: the refreshed Request may arrive first, and should open the editor.
        setTookOn(true)
        if (!await save({}, revision, takeOnGuestSubmission)) setTookOn(false)
      }}>Take this on</Button>
    </div>}
    {notice.action === "write_prediction" && writePrediction && (tookOn ? writePrediction.asked : writePrediction.offered)}
    <p role="status" aria-live="polite" className={error ? "text-destructive text-sm" : "sr-only"}>{error}</p>
  </section>
}
