"use client"

import { useCallback, useRef, useState, type ReactNode } from "react"
import { popupCode, usePopupCode } from "./lazy-popup"

const promptCode = popupCode(() => import("./discard-prompt"))

/** Fetch the guard's dialog ahead of its first use: call when a guarded popup or in-page form opens. */
export function preloadDiscardPrompt() {
  promptCode.preload()
}

/**
 * #263: the one unsaved-text guard. `ask(discard)` shows "Discard what you typed?" with Keep editing (focused) and
 * Discard. Keep editing, Escape, Close or a press outside keep everything and put focus back where it was; Discard
 * runs `discard`. Callers ask only when `hasTypedText` (typed-text.ts) says closing would lose something. The dialog
 * itself (discard-prompt.tsx) loads on first use. #267: if it can't load (offline, an old tab after a deploy),
 * nothing closes and Lane says the text is still here, as Keep editing would leave it.
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

  const discardPrompt = usePopupCode(promptCode, pending !== null, { id: "popup-unavailable:discard", textKept: true, close: () => setPending(null) })

  // Once asked, it stays mounted, so it can animate out and hand focus back.
  const prompt = asked && discardPrompt && <discardPrompt.default open={pending !== null} returnTo={returnTo} onKeep={() => setPending(null)}
    onDiscard={() => { const discard = pending; setPending(null); discard?.() }} />

  return { ask, prompt }
}
