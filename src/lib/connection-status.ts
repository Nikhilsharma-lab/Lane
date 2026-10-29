import { useSyncExternalStore } from "react"

/**
 * #260: whether the browser is offline, from its own `online` and `offline`
 * events. Browser-only: the server and the first render always read "online",
 * so nothing shifts at hydration. It feeds the app frame's "You're offline"
 * line, the shared offline answer every server call checks first
 * (src/lib/action-call.ts) and the signed-in app's navigation guard
 * (src/components/shell/offline-guard.tsx). It only tracks; it never queues.
 */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false
}

function subscribe(listener: () => void) {
  window.addEventListener("online", listener)
  window.addEventListener("offline", listener)
  return () => {
    window.removeEventListener("online", listener)
    window.removeEventListener("offline", listener)
  }
}

/** True while the browser is offline; re-renders when the connection comes or goes. */
export function useOffline(): boolean {
  return useSyncExternalStore(subscribe, isOffline, () => false)
}
