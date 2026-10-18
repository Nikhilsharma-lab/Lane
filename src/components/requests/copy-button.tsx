"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Check, RotateCcw } from "lucide-react"
import { Button } from "@/components/arc/button/button"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import { useCopy } from "./use-copy"
import styles from "./detail.module.css"

/** How long the check mark stays after a copy. */
export const COPIED_MS = 2000

/**
 * Plan item 2.5: an icon button that copies one value (Request detail's
 * link and code). The state machine is the list's code control
 * (request-row.tsx): repeat presses wait for the clipboard, the glyph turns
 * into a check for two seconds, and a failure offers a retry. No blur morph
 * in a dense control (decision 8.22).
 */
export function CopyButton({ label, value, copied, icon }: {
  /** The button's name and tooltip, such as "Copy link". */
  label: string
  /** The value, or a function that reads it at the press (a URL needs the browser's origin). */
  value: string | (() => string)
  /** What the polite region says once it is on the clipboard, such as "Link copied." */
  copied: string
  icon: ReactNode
}) {
  const copy = useCopy()
  const [state, setState] = useState<"idle" | "copied" | "error">("idle")
  const inFlight = useRef(false)
  const timer = useRef(0)
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; window.clearTimeout(timer.current) }
  }, [])

  async function run() {
    if (inFlight.current) return
    inFlight.current = true
    window.clearTimeout(timer.current)
    const ok = await copy(typeof value === "function" ? value() : value, copied)
    inFlight.current = false
    if (!mounted.current) return
    setState(ok ? "copied" : "error")
    if (ok) timer.current = window.setTimeout(() => { if (mounted.current) setState("idle") }, COPIED_MS)
  }

  const name = state === "error" ? "Retry copying" : label
  return <Tooltip morph="plain" side="bottom" content={state === "copied" ? "Copied" : name}>
    <Button type="button" variant="ghost" size="sm" morph="plain" className={styles.iconButton} aria-label={name} data-copy-state={state} onClick={() => { void run() }}>
      {state === "copied" ? <Check strokeWidth={1.75} aria-hidden="true" /> : state === "error" ? <RotateCcw strokeWidth={1.75} aria-hidden="true" /> : icon}
    </Button>
  </Tooltip>
}
