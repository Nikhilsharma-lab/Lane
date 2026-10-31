"use client"

import { Button } from "@/components/arc/button/button"
import { Placeholder } from "@/components/loading/placeholder"
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { IS_IT_LIVE_COPY, type createIsItLive, type IsItLiveView } from "./is-it-live"
import detailStyles from "./detail.module.css"
import styles from "./is-it-live.module.css"

// The release form loads only once "Yes, record release" is chosen.
const releaseCode = popupCode(() => import("./is-it-live-release"))

/** #135: the "Is it live?" question and, after "Yes, record release", the release form. IsItLiveProvider (is-it-live-prompt.tsx) opens it. */
export function IsItLiveDialog({ view, prompt, orgId, returnFocus }: {
  view: IsItLiveView | null
  prompt: ReturnType<typeof createIsItLive>
  orgId: string
  returnFocus: (event: Event) => void
}) {
  // A release form that can't load leaves the Request at Done with its Undo, as Not yet does.
  const release = usePopupCode(releaseCode, view?.step === "release", { id: "popup-unavailable:release", close: () => prompt.notYet() })
  return <Dialog guardTypedText open={view !== null} onOpenChange={open => { if (!open) prompt.notYet() }}>
      {view && <DialogContent data-is-it-live="" onCloseAutoFocus={returnFocus}
        title={view.step === "ask" ? IS_IT_LIVE_COPY.title : IS_IT_LIVE_COPY.releaseTitle}
        description={view.step === "ask" ? IS_IT_LIVE_COPY.question(view.request.name) : view.request.name}>
        {view.step === "ask" ? <>
          <p className={styles.note}>{IS_IT_LIVE_COPY.endsUndo}</p>
          <div className={detailStyles.dialogActions}>
            <Button variant="ghost" onClick={prompt.notYet}>{IS_IT_LIVE_COPY.notYet}</Button>
            <Button onClick={prompt.record}>{IS_IT_LIVE_COPY.yes}</Button>
          </div>
        </> : release
          ? <release.IsItLiveRelease key={view.request.id} request={view.request} orgId={orgId} onSaved={prompt.saved} onNotYet={prompt.notYet} />
          : <Placeholder label="Loading release" lines={2} />}
      </DialogContent>}
    </Dialog>
}
