import { useSyncExternalStore } from "react"

/**
 * #263: the popup and in-page form behaviour (popup-behaviour.tsx: focus in and back, the typed-text guard, the
 * phone panel) stays out of every page's first load. It loads once the page is idle, long before anyone types into
 * a popup; until then popups behave as Arc's do.
 */
type Behaviour = typeof import("./popup-behaviour")
let behaviour: Behaviour | null = null
let loading: Promise<Behaviour> | null = null
const listeners = new Set<() => void>()

export function loadBehaviour() {
  loading ??= import("./popup-behaviour").then(module => {
    behaviour = module
    listeners.forEach(listener => listener())
    // For the browser tests: what opens from now on has Lane's focus, Escape and phone behaviour.
    document.documentElement.dataset.popupBehaviour = "ready"
    return module
  })
  return loading
}

if (typeof window !== "undefined") {
  const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1))
  idle(() => { void loadBehaviour().catch(() => { loading = null }) })
}

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

/** The loaded behaviour, or null until it arrives. */
export const useBehaviour = () => useSyncExternalStore(subscribe, () => behaviour, () => null)
