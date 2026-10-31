"use client"

import { createContext, useContext, useRef, useState, type ReactNode } from "react"
import { popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { createIsItLive, type AskIsItLive, type IsItLiveView } from "./is-it-live"
import { restoreRequestFocus } from "./list-focus"

// #267: this provider sits on every page; the prompt's code loads when a Mark Done first asks.
const dialogCode = popupCode(() => import("./is-it-live-dialog"))

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

  // If the prompt's code can't load, the Request stays at Done and its Marked Done toast (with Undo) comes back, as Not yet does.
  const dialog = usePopupCode(dialogCode, view !== null, { id: "popup-unavailable:is-it-live", close: () => prompt.notYet() })

  return <IsItLiveContext.Provider value={ask}>
    {children}
    {dialog && <dialog.IsItLiveDialog view={view} prompt={prompt} orgId={orgId} returnFocus={returnFocus} />}
  </IsItLiveContext.Provider>
}
