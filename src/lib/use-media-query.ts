"use client"

import { useSyncExternalStore } from "react"

/** Under 640px Lane's popups become the phone's bottom panel (polish bar §1), and so does the list's summary. */
export const PHONE_PANEL = "(max-width: 639.98px)"

type QueryStore = { subscribe: (change: () => void) => () => void; matches: () => boolean }
const stores = new Map<string, QueryStore>()

/** Whether a media query matches now, following its changes; false on the server and in the first render after it. */
export function useMediaQuery(query: string) {
  let store = stores.get(query)
  if (!store) stores.set(query, store = {
    subscribe: change => {
      const list = window.matchMedia(query)
      list.addEventListener("change", change)
      return () => list.removeEventListener("change", change)
    },
    matches: () => window.matchMedia(query).matches,
  })
  return useSyncExternalStore(store.subscribe, store.matches, serverMatches)
}
const serverMatches = () => false

/** The popups' and the summary's switch to the bottom panel. */
export const usePhonePanel = () => useMediaQuery(PHONE_PANEL)
