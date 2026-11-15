"use client"

import type { RefObject } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { Placeholder } from "@/components/loading/placeholder"
import { IS_IT_LIVE_COPY, promptCloseFocus, type IsItLiveView } from "./is-it-live"
import type { IsItLivePrompt } from "./is-it-live-state"
import { restoreRequestFocus } from "./list-focus"
import detailStyles from "./detail.module.css"
import styles from "./is-it-live.module.css"

// The release form loads only once "Yes, record release" is chosen.
const releaseCode = popupCode(() => import("./is-it-live-release"))

/** Where focus was when the prompt opened, to hand it back on close. */
export type PromptOpener = { element: Element | null; requestId: string } | null

/**
 * #135: the "Is it live?" dialog itself, loaded after the page (IsItLiveProvider, #277), so its words and buttons stay
 * out of every page's first load. The question says a recorded release can't be reopened; "Yes, record release"
 * opens the one release form (#277), "Not yet", Escape or Close leave the Request at Done and bring back its Marked
 * Done toast, hidden while the prompt is open (C2-12, globals.css). Focus returns to where it was, else the page title
 * or the row.
 */
export function IsItLiveDialog({ view, prompt, orgId, openerRef }: { view: IsItLiveView | null; prompt: IsItLivePrompt; orgId: string; openerRef: RefObject<PromptOpener> }) {
  const returnFocus = (event: Event) => {
    event.preventDefault()
    const from = openerRef.current
    openerRef.current = null
    const element = from?.element
    promptCloseFocus({
      active: document.activeElement, body: document.body,
      opener: element instanceof HTMLElement && element !== document.body ? element : null,
      title: document.getElementById("request-title"),
      restoreRow: from ? () => restoreRequestFocus(from.requestId, { force: true }) : null,
    })
  }

  // A release form that can't load leaves the Request at Done with its Undo, as Not yet does.
  const release = usePopupCode(releaseCode, view?.step === "release", () => couldNotOpen("release", () => prompt.notYet(), { retry: null }))

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
