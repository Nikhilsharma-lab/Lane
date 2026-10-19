"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"

export type AnnounceOptions = {
  /** A keyed message replaces a pending one with the same key, so a burst of changes is read once. */
  key?: string
  /** Waits this long (ms) before speaking. */
  delay?: number
}
export type Announce = (text: string, options?: AnnounceOptions) => void

type Announcer = {
  announce: Announce
  /** Drops a delayed message with this key that has not been spoken yet. */
  cancel: (key: string) => void
}

const AnnouncerContext = createContext<Announcer | null>(null)
AnnouncerContext.displayName = "ListAnnouncer"

const noop: Announce = () => {}

/**
 * Plan item 2.4: the Requests list's one polite live region. It is mounted
 * empty with the list, so the first message is heard, and it is written
 * directly, so an announcement never re-renders the list. Optimistic changes,
 * selection, copy results and the filtered result count all speak here; the
 * toast stack stays the app-wide region for Mark Done, Undo and failures.
 *
 * Plan item 2.7 (decision D6): the authenticated shell hosts the region, so
 * the notifications bell in the sidebar speaks through it too. A provider
 * mounted under another one passes through, so the page providers (and every
 * story or fixture that mounts its own) keep working with one region in the DOM.
 * A pass-through still ends with its page: a delayed message it scheduled (the
 * list's match count, a copy) is dropped when it unmounts, as the page's own
 * region used to drop it, so it is never read out on the next page.
 */
export function ListAnnouncerProvider({ children }: { children: ReactNode }) {
  const outer = useContext(AnnouncerContext)
  return outer ? <AnnouncerScope outer={outer}>{children}</AnnouncerScope> : <AnnouncerRegion>{children}</AnnouncerRegion>
}

function AnnouncerScope({ outer, children }: { outer: Announcer; children: ReactNode }) {
  const delayed = useRef(new Set<string>())
  const announce = useCallback<Announce>((text, options = {}) => {
    if (options.key !== undefined && (options.delay ?? 0) > 0) delayed.current.add(options.key)
    outer.announce(text, options)
  }, [outer])
  useEffect(() => {
    const keys = delayed.current
    return () => {
      for (const key of keys) outer.cancel(key)
      keys.clear()
    }
  }, [outer])
  const value = useMemo(() => ({ announce, cancel: outer.cancel }), [announce, outer.cancel])
  return <AnnouncerContext.Provider value={value}>{children}</AnnouncerContext.Provider>
}

function AnnouncerRegion({ children }: { children: ReactNode }) {
  const region = useRef<HTMLParagraphElement>(null)
  const timers = useRef(new Map<string, number>())
  const frame = useRef(0)

  const write = useCallback((text: string) => {
    const node = region.current
    if (!node) return
    window.cancelAnimationFrame(frame.current)
    // The same words again would not change the region, so clear it and set them on the next frame.
    if (text && node.textContent === text) {
      node.textContent = ""
      frame.current = window.requestAnimationFrame(() => { node.textContent = text })
    } else node.textContent = text
  }, [])

  const announce = useCallback<Announce>((text, { key, delay = 0 } = {}) => {
    if (key !== undefined) {
      window.clearTimeout(timers.current.get(key))
      timers.current.delete(key)
    }
    if (delay <= 0) { write(text); return }
    const timer = window.setTimeout(() => {
      if (key !== undefined) timers.current.delete(key)
      write(text)
    }, delay)
    if (key !== undefined) timers.current.set(key, timer)
  }, [write])

  const cancel = useCallback((key: string) => {
    window.clearTimeout(timers.current.get(key))
    timers.current.delete(key)
  }, [])
  const value = useMemo(() => ({ announce, cancel }), [announce, cancel])

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
      window.cancelAnimationFrame(frame.current)
    }
  }, [])

  return <AnnouncerContext.Provider value={value}>
    {children}
    <p ref={region} className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-slot="list-announcer" />
  </AnnouncerContext.Provider>
}

/** Speaks through the list's region. Outside the provider (a lone row in a story) it does nothing. */
export function useListAnnouncer(): Announce {
  return useContext(AnnouncerContext)?.announce ?? noop
}
