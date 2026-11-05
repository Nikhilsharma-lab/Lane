"use client"

import { createContext, useContext, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { createIsItLive, IS_IT_LIVE_COPY, promptCloseFocus, type AskIsItLive, type IsItLiveView } from "./is-it-live"
import { restoreRequestFocus } from "./list-focus"
import detailStyles from "./detail.module.css"
import styles from "./is-it-live.module.css"
import { Placeholder } from "@/components/loading/placeholder";

// The release form loads only once "Yes, record release" is chosen; this provider sits on every page.
const releaseCode = popupCode(() => import("./is-it-live-release"))

const IsItLiveContext = createContext<AskIsItLive | null>(null)
IsItLiveContext.displayName = "IsItLive"

/** The ask for "Is it live?" after Mark Done, or undefined outside the (app) layout (a standalone render). */
export function useIsItLive(): AskIsItLive | undefined {
  return useContext(IsItLiveContext) ?? undefined
}

/**
 * #135: the one "Is it live?" prompt, asked after a successful Mark Done from the Request page's button, its
 * Status control, a row's menu or the palette (every single-Request Done runs useRequestMoves). "Yes, record
 * release" opens the release form with today as the exposure date; "Not yet", Escape or Close leave the Request
 * at Done and bring back its Marked Done toast, so Undo Done works as before. Both the question and the form say
 * that recording the release ends Undo Done. Focus returns to where it was, else the page title or the row.
 */
export function IsItLiveProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const [view, setView] = useState<IsItLiveView | null>(null)
  const [prompt] = useState(() => createIsItLive(setView))
  // Where focus was when the prompt opened, to hand it back on close.
  const opener = useRef<{ element: Element | null; requestId: string } | null>(null)
  const [ask] = useState(() => {
    const open: AskIsItLive = (request, undo) => {
      opener.current = { element: document.activeElement, requestId: request.id }
      prompt.ask(request, undo)
    }
    return open
  })

  const returnFocus = (event: Event) => {
    event.preventDefault()
    const from = opener.current
    opener.current = null
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

  return <IsItLiveContext.Provider value={ask}>
    {children}
    <Dialog guardTypedText open={view !== null} onOpenChange={open => { if (!open) prompt.notYet() }}>
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
  </IsItLiveContext.Provider>
}
