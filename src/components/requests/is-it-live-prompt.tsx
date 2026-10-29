"use client"

import dynamic from "next/dynamic"
import { createContext, useContext, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/arc/button/button"
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog"
import { createIsItLive, IS_IT_LIVE_COPY, type AskIsItLive, type IsItLiveView } from "./is-it-live"
import { restoreRequestFocus } from "./list-focus"
import detailStyles from "./detail.module.css"
import styles from "./is-it-live.module.css"
import { Placeholder } from "@/components/loading/placeholder";

// The release form loads only once "Yes, record release" is chosen; this provider sits on every page.
const IsItLiveRelease = dynamic(() => import("./is-it-live-release").then(module => module.IsItLiveRelease), {
  ssr: false,
  loading: () => <Placeholder label="Loading release" lines={2} />,
})

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
    if (element instanceof HTMLElement && element.isConnected && element !== document.body) { element.focus({ preventScroll: true }); return }
    const title = document.getElementById("request-title")
    if (title) { title.focus({ preventScroll: true }); return }
    if (from) restoreRequestFocus(from.requestId, { force: true })
  }

  return <IsItLiveContext.Provider value={ask}>
    {children}
    <Dialog open={view !== null} onOpenChange={open => { if (!open) prompt.notYet() }}>
      {view && <DialogContent data-is-it-live="" onCloseAutoFocus={returnFocus}
        title={view.step === "ask" ? IS_IT_LIVE_COPY.title : IS_IT_LIVE_COPY.releaseTitle}
        description={view.step === "ask" ? IS_IT_LIVE_COPY.question(view.request.name) : view.request.name}>
        {view.step === "ask" ? <>
          <p className={styles.note}>{IS_IT_LIVE_COPY.endsUndo}</p>
          <div className={detailStyles.dialogActions}>
            <Button variant="ghost" onClick={prompt.notYet}>{IS_IT_LIVE_COPY.notYet}</Button>
            <Button onClick={prompt.record}>{IS_IT_LIVE_COPY.yes}</Button>
          </div>
        </> : <IsItLiveRelease key={view.request.id} request={view.request} orgId={orgId} onSaved={prompt.saved} onNotYet={prompt.notYet} />}
      </DialogContent>}
    </Dialog>
  </IsItLiveContext.Provider>
}
