import { useSyncExternalStore } from "react"
import { afterPageLoad } from "@/lib/after-page-load"

/**
 * #263: the popup's phone panel switch (popup-behaviour.tsx) stays out of every page's first load. It loads at the
 * first sign someone is about to use a popup (a press or a key anywhere in the page but on a link, which moves to
 * another page instead, and from `load` on also focus), or once the page has loaded and is idle (after-page-load.ts).
 * Never before `load` on its own: fetched earlier, it held that event back on a slow phone. Until then popups open
 * as the centred Arc dialog; focus and the typed-text guard don't wait for it (adaptive-dialog.tsx, in-page-form.tsx).
 */
type Behaviour = typeof import("./popup-behaviour")
let behaviour: Behaviour | null = null
let loading: Promise<Behaviour> | null = null
const listeners = new Set<() => void>()

export function loadBehaviour() {
  loading ??= import("./popup-behaviour").then(module => {
    behaviour = module
    listeners.forEach(listener => listener())
    // For the browser tests: what opens from now on can become the phone panel.
    document.documentElement.dataset.popupBehaviour = "ready"
    return module
  })
  return loading
}

if (typeof window !== "undefined") {
  // Focus before `load` is the page's own (autofocus, hydration), not someone reaching for a popup.
  const INTENT = ["pointerdown", "keydown"] as const
  const start = (event?: Event) => {
    // A link moves to another page: loading now would only compete with that page.
    if (event && (event.target as Element | null)?.closest?.("a[href]")) return
    for (const type of INTENT) document.removeEventListener(type, start, true)
    document.removeEventListener("focusin", start, true)
    void loadBehaviour().catch(() => { loading = null })
  }
  for (const type of INTENT) document.addEventListener(type, start, true)
  const focusCounts = () => { if (!loading) document.addEventListener("focusin", start, true) }
  if (document.readyState === "complete") focusCounts()
  else window.addEventListener("load", focusCounts, { once: true })
  afterPageLoad(() => start())
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** The loaded behaviour, or null until it arrives. */
export const useBehaviour = () => useSyncExternalStore(subscribe, () => behaviour, () => null)
