"use client"

import { startTransition, useEffect, useEffectEvent, useState } from "react"
import { useToastStack, type ToastOptions } from "@/components/arc/toast-stack/toast-stack"
import { isOffline } from "@/lib/connection-status"
import { CHECK_CONNECTION, OFFLINE_ANSWER_TITLE, POPUP_UNAVAILABLE_TITLE, TEXT_KEPT, TRY_AGAIN } from "@/lib/failure-messages"

/**
 * Lane's one way to load a popup's code on demand, for the popups that have always stayed out of the page's first
 * load (the Properties sheet, the Iterations link, the paid seat question, the phone panel, the discard question,
 * the calendar, search, the command palette and the New Request form). Each keeps the moment it has always loaded
 * at; this gives them one cache and one answer when the code can't arrive (offline, an old tab after a deploy): the
 * open is given up and Lane says so, never a blank popup or the page thrown out to the error screen.
 * Every other popup ships with the page, so it opens at once, every time (Nikhil, 2026-11-01).
 */
export type PopupCode<T> = {
  /** The code, fetched once; a failed fetch is tried again on the next call. */
  load: () => Promise<T>
  /** Fetch it ahead of an open; a failure is quiet here, and the open itself says so. */
  preload: () => void
  /** The code once it is here, else null. */
  current: () => T | null
  subscribe: (listener: () => void) => () => void
}

export function popupCode<T>(importer: () => Promise<T>): PopupCode<T> {
  let loaded: T | null = null
  let loading: Promise<T> | null = null
  const listeners = new Set<() => void>()
  const load = () => loading ??= importer().then(
    code => { loaded = code; listeners.forEach(listener => listener()); return code },
    (reason: unknown) => { loading = null; throw reason },
  )
  return {
    load,
    preload: () => { void load().catch(() => undefined) },
    current: () => loaded,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

/** #260's words for a popup whose code couldn't load: offline says so; otherwise Lane couldn't open it. */
export function popupUnavailableToast({ id, retry, textKept }: { id: string; retry?: () => void; textKept?: boolean }): ToastOptions {
  const action = retry ? { label: TRY_AGAIN, onClick: retry } : undefined
  return isOffline()
    ? { id, type: "warning", title: OFFLINE_ANSWER_TITLE, description: textKept ? TEXT_KEPT : undefined, action }
    : { id, type: "error", title: POPUP_UNAVAILABLE_TITLE, description: textKept ? `${CHECK_CONNECTION} ${TEXT_KEPT}` : CHECK_CONNECTION, action }
}

// The toast stack's `toast` while PopupNotices is mounted, so a popup can say its code couldn't load without reading
// the stack itself, which would re-render it whenever a toast comes or goes.
let showNotice: ((options: ToastOptions) => void) | null = null

/** Mounted once in the signed-in app, inside the toast stack: where a popup whose code couldn't load says so. */
export function PopupNotices() {
  const { toast } = useToastStack()
  useEffect(() => {
    showNotice = toast
    return () => { if (showNotice === toast) showNotice = null }
  }, [toast])
  return null
}

/**
 * A popup whose code couldn't load: `setOpen(false)` gives up the open, and Lane says so, one message per popup
 * `name` (a second failure updates the first in place). Try again runs `retry`, by default `setOpen(true)`;
 * `retry: null` offers none. `textKept`: the open had typed text, and it is still there.
 */
export function couldNotOpen(name: string, setOpen: (open: boolean) => void, { retry = () => setOpen(true), textKept = false }: { retry?: (() => void) | null; textKept?: boolean } = {}) {
  setOpen(false)
  const notice = popupUnavailableToast({ id: `popup-unavailable:${name}`, retry: retry ?? undefined, textKept })
  if (showNotice) showNotice(notice)
  else console.error(`[popup] ${name}: "${notice.title}" has nowhere to show, PopupNotices isn't mounted`)
}

/**
 * The popup's code, from its first open on (or, with `ahead`, from the moment the code is here). While `open` and
 * the code isn't here, it is fetched; if that fails, the reason is logged and `onFailed` runs (`couldNotOpen`, or
 * the caller's own fallback). Once it has opened, it stays rendered, closed, between opens.
 * - `ahead`: render it, closed, as soon as a load ahead brings the code (the composer's form, #296), so even the first
 *   open only mounts it. Without it, code that arrives ahead waits for the open: a press that loads it ahead never
 *   re-renders the page under the press.
 * - `transition`: that early render yields to input that arrives meanwhile (a large popup rendered closed).
 */
export function usePopupCode<T>(loader: PopupCode<T>, open: boolean, onFailed: () => void, { ahead = false, transition = false } = {}): T | null {
  const [kept, setKept] = useState(loader.current)
  // Already here when it opens: rendered in that same render, with no extra pass.
  const code = kept ?? (open ? loader.current() : null)
  if (code && !kept) setKept(() => code)
  const failed = useEffectEvent((reason: unknown) => {
    console.error("[popup] code didn't load:", reason)
    onFailed()
  })
  useEffect(() => {
    if (!ahead || kept) return
    const arrived = () => {
      const loaded = loader.current()
      if (!loaded) return
      if (transition) startTransition(() => setKept(() => loaded))
      else setKept(() => loaded)
    }
    arrived()
    return loader.subscribe(arrived)
  }, [ahead, loader, kept, transition])
  useEffect(() => {
    if (code || !open) return
    let live = true
    loader.load().then(loaded => { if (live) setKept(() => loaded) }, (reason: unknown) => { if (live) failed(reason) })
    return () => { live = false }
  }, [loader, code, open])
  return code
}
