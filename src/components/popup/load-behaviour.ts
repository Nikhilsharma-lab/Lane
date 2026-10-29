import { useSyncExternalStore } from "react"

/**
 * #263: the popup's phone panel switch (popup-behaviour.tsx) stays out of every page's first load. It loads at the
 * first sign someone is about to use a popup (a press, a key or focus anywhere in the page), or once the page is idle,
 * and no later than `DEADLINE_MS` after the page starts. Until then popups open as the centred Arc dialog; focus and
 * the typed-text guard don't wait for it (adaptive-dialog.tsx, in-page-form.tsx).
 */
type Behaviour = typeof import("./popup-behaviour")
let behaviour: Behaviour | null = null
let loading: Promise<Behaviour> | null = null
const listeners = new Set<() => void>()

/** The longest the idle wait may take before the behaviour loads anyway. */
const DEADLINE_MS = 1000

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
  const INTENT = ["pointerdown", "keydown", "focusin"] as const
  const start = () => {
    for (const type of INTENT) document.removeEventListener(type, start, true)
    void loadBehaviour().catch(() => { loading = null })
  }
  for (const type of INTENT) document.addEventListener(type, start, true)
  if (window.requestIdleCallback) window.requestIdleCallback(start, { timeout: DEADLINE_MS })
  else window.setTimeout(start, 1)
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** The loaded behaviour, or null until it arrives. */
export const useBehaviour = () => useSyncExternalStore(subscribe, () => behaviour, () => null)
