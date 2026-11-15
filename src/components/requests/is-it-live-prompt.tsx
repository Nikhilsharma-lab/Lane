"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { couldNotOpen, popupCode, usePopupCode } from "@/components/popup/lazy-popup"
import { afterPageLoad } from "@/lib/after-page-load"
import type { AskIsItLive, IsItLiveView } from "./is-it-live"
import { createIsItLive } from "./is-it-live-state"
import type { PromptOpener } from "./is-it-live-dialog"

// The dialog arrives after the page has loaded (#277): this provider sits on every page, and a Mark Done takes a
// server round trip before it asks, so the dialog is there by then.
const dialogCode = popupCode(() => import("./is-it-live-dialog"))

const IsItLiveContext = createContext<AskIsItLive | null>(null)
IsItLiveContext.displayName = "IsItLive"

/** The ask for "Is it live?" after Mark Done, or undefined outside the (app) layout (a standalone render). */
export function useIsItLive(): AskIsItLive | undefined {
  return useContext(IsItLiveContext) ?? undefined
}

/**
 * #135: the one "Is it live?" prompt, asked after a successful Mark Done from the Request page's button, its
 * Status control, a row's menu or the palette (every single-Request Done runs useRequestMoves). Its dialog is
 * is-it-live-dialog.tsx.
 */
export function IsItLiveProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const [view, setView] = useState<IsItLiveView | null>(null)
  const [prompt] = useState(() => createIsItLive(setView))
  const opener = useRef<PromptOpener>(null)
  const [ask] = useState(() => {
    const open: AskIsItLive = (request, undo) => {
      opener.current = { element: document.activeElement, requestId: request.id }
      prompt.ask(request, undo)
    }
    return open
  })
  useEffect(() => afterPageLoad(dialogCode.preload), [])
  // Rendered, closed, once its code is here, so it opens in place. A dialog that can't load leaves the Request at
  // Done with its Undo, as Not yet does.
  const dialog = usePopupCode(dialogCode, view !== null, () => couldNotOpen("is-it-live", () => prompt.notYet(), { retry: null }), { ahead: true })

  return <IsItLiveContext.Provider value={ask}>
    {children}
    {dialog && <dialog.IsItLiveDialog view={view} prompt={prompt} orgId={orgId} openerRef={opener} />}
  </IsItLiveContext.Provider>
}
