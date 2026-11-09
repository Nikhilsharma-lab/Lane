"use client"

import { callAction } from "@/lib/action-call"
import { useEffect, useState } from "react"
import { Button } from "@/components/arc/button/button"
import { readRequestRelease } from "@/app/(app)/requests/[id]/release-actions"
import { IS_IT_LIVE_COPY, type IsItLiveRequest } from "./is-it-live"
import { ReleaseForm } from "./release-form"
import { FocusOnArrival } from "./focus-on-arrival"

// The release date picker takes Escape for itself while open; the prompt reads this once its release step is here.
export { keepOpenWhilePickerOpen } from "./picker-escape"
import detailStyles from "./detail.module.css"
import styles from "./is-it-live.module.css"
import { Placeholder } from "@/components/loading/placeholder";

type ReleaseRead = Awaited<ReturnType<typeof readRequestRelease>>

/**
 * #135: "Yes, record release": the release form for the Request just marked Done, from the same release read as the
 * Journey, with the same defaults as the Journey's Record release (#277). Loaded only when chosen, so it stays out of
 * every page's first load.
 */
export function IsItLiveRelease({ request, orgId, onSaved, onNotYet }: { request: IsItLiveRequest; orgId: string; onSaved: () => void; onNotYet: () => void }) {
  const [read, setRead] = useState<ReleaseRead | null>(null)
  useEffect(() => {
    let active = true
    callAction(() => readRequestRelease(request.id, { orgId }))
      .then(next => { if (active) setRead(next) })
      .catch(() => { if (active) setRead({ error: "Couldn’t load release. Try again." }) })
    return () => { active = false }
  }, [request.id, orgId])

  const notYet = <div className={detailStyles.dialogActions}><Button variant="ghost" onClick={onNotYet}>{IS_IT_LIVE_COPY.notYet}</Button></div>
  if (!read) return <Placeholder label="Loading release" lines={2} />
  if ("error" in read) return <><p role="alert">{read.error}</p>{notYet}</>
  if (!read.actions.release.allowed) return <><p className={styles.note}>{read.actions.release.reason}</p>{notYet}</>
  return <FocusOnArrival><ReleaseForm requestId={request.id} orgId={orgId} read={read} onSaved={onSaved} onCancel={onNotYet} cancelLabel={IS_IT_LIVE_COPY.notYet} /></FocusOnArrival>
}
