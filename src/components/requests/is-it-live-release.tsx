"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/arc/button/button"
import { readRequestRelease } from "@/app/(app)/requests/[id]/release-actions"
import { IS_IT_LIVE_COPY, type IsItLiveRequest } from "./is-it-live"
import { ReleaseForm } from "./release-form"
import detailStyles from "./detail.module.css"
import styles from "./is-it-live.module.css"
import { Placeholder } from "@/components/loading/placeholder";

type ReleaseRead = Awaited<ReturnType<typeof readRequestRelease>>

/**
 * #135: "Yes, record release": the release form for the Request just marked Done, from the same release read as
 * the timeline, with today (UTC) as the exposure date. Loaded only when chosen, so it stays out of every page's
 * first load.
 */
export function IsItLiveRelease({ request, orgId, onSaved, onNotYet }: { request: IsItLiveRequest; orgId: string; onSaved: () => void; onNotYet: () => void }) {
  const [read, setRead] = useState<ReleaseRead | null>(null)
  useEffect(() => {
    let active = true
    readRequestRelease(request.id, { orgId })
      .then(next => { if (active) setRead(next) })
      .catch(() => { if (active) setRead({ error: "Could not load release. Try again." }) })
    return () => { active = false }
  }, [request.id, orgId])

  const notYet = <div className={detailStyles.dialogActions}><Button variant="ghost" onClick={onNotYet}>{IS_IT_LIVE_COPY.notYet}</Button></div>
  if (!read) return <Placeholder label="Loading release" lines={2} />
  if ("error" in read) return <><p role="alert">{read.error}</p>{notYet}</>
  if (!read.actions.release.allowed) return <><p className={styles.note}>{read.actions.release.reason}</p>{notYet}</>
  return <ReleaseForm requestId={request.id} orgId={orgId} revision={read.revision} audience={read.audience}
    earliestExposure={read.earliestExposure} today={read.today} valueBefore={read.valueBefore} defaultExposureDate={read.today}
    intro={<p className={styles.note}>{IS_IT_LIVE_COPY.endsUndo}</p>}
    onSaved={onSaved} onCancel={onNotYet} cancelLabel={IS_IT_LIVE_COPY.notYet} />
}
