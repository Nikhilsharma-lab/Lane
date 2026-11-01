"use client"

import { startTransition, useEffect, useEffectEvent, useState } from "react"
import { useToastStack, type ToastOptions } from "@/components/arc/toast-stack/toast-stack"
import { isOffline } from "@/lib/connection-status"
import { CHECK_CONNECTION, OFFLINE_ANSWER_TITLE, POPUP_UNAVAILABLE_TITLE, TEXT_KEPT, TRY_AGAIN } from "@/lib/failure-messages"
// The phone panel's switch starts listening for the first press with the page (#263), before any popup's code is here.
import "./load-behaviour"

/**
 * #267 (Build 3): a popup's code stays out of the page's first load and arrives when someone reaches for it, in
 * Lane's "load ahead, then open" style (date-range-picker-lazy.tsx, workspace-search-pane-lazy.tsx). Its opener
 * stays with the page and calls `preload` on intent (pointer down, focus, its shortcut) and, for the most used
 * popups, once the page has loaded and is idle (after-page-load.ts). From the moment the code is here, the popup
 * renders with the page, closed, so every open after that is the same as when it shipped with the page.
 */
export type PopupCode<T> = {
  /** The code, fetched once; a failed fetch is tried again on the next call. */
  load: () => Promise<T>
  /** Fetch it ahead of an open; a failure is quiet, and the open itself says so. */
  preload: () => void
  /** The code once it is here, else null. */
  current: () => T | null
  subscribe: (listener: () => void) => () => void
}

export function popupCode<T>(importer: () => Promise<T>): PopupCode<T> {
  let value: T | null = null
  let loading: Promise<T> | null = null
  const listeners = new Set<() => void>()
  const load = () => loading ??= importer().then(
    loaded => { value = loaded; listeners.forEach(listener => listener()); return loaded },
    (thrown: unknown) => { loading = null; throw thrown },
  )
  return {
    load,
    preload: () => { void load().catch(() => undefined) },
    current: () => value,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

export type Unavailable = {
  /** Gives up the open: the popup's opener closes it (or answers for it). */
  close: () => void
  /** Try again: opens it once more. */
  retry?: () => void
  /** The open had typed text to keep, and kept it. */
  textKept?: boolean
  /** One message per popup: a second failure updates the first in place. */
  id: string
}

/** #260's words for a popup whose code couldn't load: offline says so; otherwise Lane couldn't open it. */
export function popupUnavailableToast({ retry, textKept, id }: Omit<Unavailable, "close">): ToastOptions {
  const action = retry ? { label: TRY_AGAIN, onClick: retry } : undefined
  return isOffline()
    ? { id, type: "warning", title: OFFLINE_ANSWER_TITLE, description: textKept ? TEXT_KEPT : undefined, action }
    : { id, type: "error", title: POPUP_UNAVAILABLE_TITLE, description: textKept ? `${CHECK_CONNECTION} ${TEXT_KEPT}` : CHECK_CONNECTION, action }
}

// Where a popup that couldn't load says so: the toast stack, through PopupNotices. Unset (a render with no signed-in
// app around it), the popup still gives up its open; it just has nowhere to say so.
let showNotice: ((options: ToastOptions) => void) | null = null

/** Mounted once in the signed-in app, inside the toast stack, so popups can say their code couldn't load without each one reading the stack. */
export function PopupNotices() {
  const { toast } = useToastStack()
  useEffect(() => {
    showNotice = toast
    return () => { if (showNotice === toast) showNotice = null }
  }, [toast])
  return null
}

/**
 * The popup's code, once it is open (or, with `ahead`, from the moment the code is here). While `wanted` (the popup
 * is open) and the code isn't here, it is fetched; if that fails (offline, or an old tab after a deploy), the open is
 * given up and Lane says so, never a blank popup. Once it has opened, it stays rendered, closed, between opens.
 * - `ahead`: render it, closed, as soon as a load ahead brings the code (the composer's form, #296), so even the first
 *   open only mounts it. Without it, code that arrives ahead waits for the open: a press that loads it ahead never
 *   re-renders the page under the press.
 * - `transition`: that early render yields to input that arrives meanwhile (a large popup rendered closed).
 */
export function usePopupCode<T>(code: PopupCode<T>, wanted: boolean, unavailable: Unavailable, { ahead = false, transition = false } = {}): T | null {
  const [held, setHeld] = useState(code.current)
  // Already here when it opens: rendered in that same render, with no extra pass.
  const value = held ?? (wanted ? code.current() : null)
  // Kept from its first open on, so it can animate out and open again at once.
  if (value && !held) setHeld(() => value)
  const failed = useEffectEvent(() => {
    unavailable.close()
    showNotice?.(popupUnavailableToast(unavailable))
  })
  useEffect(() => {
    if (!ahead || held) return
    const arrived = () => {
      const loaded = code.current()
      if (!loaded) return
      if (transition) startTransition(() => setHeld(() => loaded))
      else setHeld(() => loaded)
    }
    arrived()
    return code.subscribe(arrived)
  }, [ahead, code, held, transition])
  useEffect(() => {
    if (value || !wanted) return
    let live = true
    code.load().then(loaded => { if (live) setHeld(() => loaded) }, () => { if (live) failed() })
    return () => { live = false }
  }, [code, value, wanted])
  return value
}

/** What Radix's dialog trigger told assistive technology, for an opener that is a plain button until the popup's code is here. */
export const popupOpener = (open: boolean) => ({ "aria-haspopup": "dialog", "aria-expanded": open, "data-state": open ? "open" : "closed" }) as const
