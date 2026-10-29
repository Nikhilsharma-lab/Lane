import { useSyncExternalStore } from "react"

/**
 * #260: whether the browser is offline, from its own `online` and `offline` events. Browser-only: the server
 * and the first render read "online". It feeds the app frame's offline line and navigation guard
 * (src/components/shell/offline-guard.tsx) and the offline answer every server call checks first
 * (`callAction`, src/lib/action-call.ts). It only tracks; it never queues. Kept tiny: it is on every page.
 */
export const isOffline = () => typeof navigator != "undefined" && navigator.onLine === false

const subscribe = (listener: () => void) => {
  addEventListener("online", listener)
  addEventListener("offline", listener)
  return () => { removeEventListener("online", listener); removeEventListener("offline", listener) }
}

/** True while the browser is offline; re-renders when the connection comes or goes. */
export const useOffline = () => useSyncExternalStore(subscribe, isOffline, () => false)
