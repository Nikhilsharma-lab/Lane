"use client"

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react"

export type AnnounceOptions = {
  /** A keyed message replaces a pending one with the same key, so a burst of changes is read once. */
  key?: string
  /** Waits this long (ms) before speaking. */
  delay?: number
}
export type Announce = (text: string, options?: AnnounceOptions) => void

const AnnouncerContext = createContext<Announce | null>(null)
AnnouncerContext.displayName = "ListAnnouncer"

const noop: Announce = () => {}

/**
 * Plan item 2.4: the Requests list's one polite live region. It is mounted
 * empty with the list, so the first message is heard, and it is written
 * directly, so an announcement never re-renders the list. Optimistic changes,
 * selection, copy results and the filtered result count all speak here; the
 * toast stack stays the app-wide region for Mark Done, Undo and failures.
 */
export function ListAnnouncerProvider({ children }: { children: ReactNode }) {
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

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer)
      pending.clear()
      window.cancelAnimationFrame(frame.current)
    }
  }, [])

  return <AnnouncerContext.Provider value={announce}>
    {children}
    <p ref={region} className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-slot="list-announcer" />
  </AnnouncerContext.Provider>
}

/** Speaks through the list's region. Outside the provider (a lone row in a story) it does nothing. */
export function useListAnnouncer(): Announce {
  return useContext(AnnouncerContext) ?? noop
}
