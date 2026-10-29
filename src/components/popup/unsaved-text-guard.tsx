"use client"

import { lazy, Suspense, useCallback, useRef, useState, type ReactNode } from "react"

const loadPrompt = () => import("./discard-prompt")
const DiscardPrompt = lazy(loadPrompt)

/** Fetch the guard's dialog ahead of its first use: call when a guarded popup or in-page form opens. */
export function preloadDiscardPrompt() {
  void loadPrompt().catch(() => undefined)
}

/**
 * #263: the one unsaved-text guard. `ask(discard)` shows "Discard what you typed?" with Keep editing (focused) and
 * Discard. Keep editing, Escape, Close or a press outside keep everything and put focus back where it was; Discard
 * runs `discard`. Callers ask only when `hasTypedText` (typed-text.ts) says closing would lose something. The dialog
 * itself (discard-prompt.tsx) loads on first use.
 */
export function useDiscardPrompt(): { ask: (discard: () => void) => void; prompt: ReactNode } {
  const [pending, setPending] = useState<(() => void) | null>(null)
  const [asked, setAsked] = useState(false)
  const returnTo = useRef<Element | null>(null)

  const ask = useCallback((discard: () => void) => {
    returnTo.current = document.activeElement
    setAsked(true)
    setPending(() => discard)
  }, [])

  // Once asked, it stays mounted, so it can animate out and hand focus back.
  const prompt = asked && <Suspense fallback={null}>
    <DiscardPrompt open={pending !== null} returnTo={returnTo} onKeep={() => setPending(null)}
      onDiscard={() => { const discard = pending; setPending(null); discard?.() }} />
  </Suspense>

  return { ask, prompt }
}
