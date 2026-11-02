"use client"

// The one place Lane imports Next's Link (eslint.config.mjs points everyone else here).
// eslint-disable-next-line no-restricted-imports
import NextLink from "next/link"
import { useState, useSyncExternalStore, type ComponentProps } from "react"
import { afterPageLoad } from "@/lib/after-page-load"

let pageLoaded = false
let waiting = false
const listeners = new Set<() => void>()

/** One wait for the whole page, however many links are on it. */
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!waiting && !pageLoaded) {
    waiting = true
    afterPageLoad(() => { pageLoaded = true; for (const notify of listeners) notify() })
  }
  return () => { listeners.delete(listener) }
}

/**
 * Next's Link, whose reading ahead waits for the page (Build 3, Build 2's rule in src/lib/after-page-load.ts).
 * Next reads a link's page ahead as soon as the link is on screen. On a slow phone whose page is drawn before
 * Clerk's script arrives, those reads, and the page code their answers bring, came before `load` and held it back.
 * A link now reads ahead once the page has loaded and is idle, or earlier when someone points at it, touches it
 * or tabs to it. Clicking works the same either way; after the first load every link reads ahead at once.
 */
export default function Link({ prefetch, onMouseEnter, onTouchStart, onFocus, ...props }: ComponentProps<typeof NextLink>) {
  const loaded = useSyncExternalStore(subscribe, () => pageLoaded, () => false)
  const [intent, setIntent] = useState(false)
  const ready = loaded || intent
  return (
    <NextLink
      {...props}
      prefetch={ready ? prefetch : false}
      onMouseEnter={event => { onMouseEnter?.(event); if (!ready) setIntent(true) }}
      onTouchStart={event => { onTouchStart?.(event); if (!ready) setIntent(true) }}
      onFocus={event => { onFocus?.(event); if (!ready) setIntent(true) }}
    />
  )
}
