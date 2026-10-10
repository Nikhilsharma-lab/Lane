// shadcn use-mobile adapter using React's external-store API for Lane's lint rules.
"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(max-width: 767px)"
function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}
const getSnapshot = () => window.matchMedia(QUERY).matches
const getServerSnapshot = () => false

export function useIsMobile() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
