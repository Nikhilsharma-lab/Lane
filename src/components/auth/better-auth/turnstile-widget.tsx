"use client"

import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"

import { authErrorCopy } from "@/lib/auth-error-copy"
import type { HumanCheck } from "./human-check"
import styles from "./better-auth.module.css"
import authStyles from "../auth.module.css"

/** Cloudflare's script, in explicit-render mode: it draws a widget only when Lane asks. */
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/** The part of Cloudflare's `window.turnstile` Lane uses. */
type Turnstile = {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined
  reset(widgetId: string): void
  remove(widgetId: string): void
}
type WithTurnstile = { turnstile?: Turnstile }

let loading: Promise<Turnstile> | null = null

/** Adds Cloudflare's script to the page once, and answers its API when it has loaded. Only the widget's mount calls it. */
export function loadTurnstile(): Promise<Turnstile> {
  const ready = (window as WithTurnstile).turnstile
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT
    script.async = true
    script.onload = () => {
      const turnstile = (window as WithTurnstile).turnstile
      if (turnstile) resolve(turnstile)
      else reject(new Error("Turnstile's script loaded without its API"))
    }
    script.onerror = () => {
      loading = null
      reject(new Error("Turnstile's script didn't load"))
    }
    document.head.append(script)
  })
  return loading
}

/**
 * #377: Cloudflare Turnstile's managed widget, in Lane's theme, for a screen whose calls need the human check. It
 * hands the check a token when it passes and none while it's unfinished or expired; the screen resets it after
 * every answer. With no site key it says the check isn't set up, and the screen keeps the actions that need it off.
 */
export function TurnstileWidget({ check }: { check: HumanCheck }) {
  const container = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()
  const theme = resolvedTheme === "dark" ? "dark" : "light"
  const { siteKey } = check

  useEffect(() => {
    const element = container.current
    if (!siteKey || !element) return
    let widgetId: string | undefined
    let api: Turnstile | undefined
    let forget: (() => void) | undefined
    let gone = false
    loadTurnstile().then((turnstile) => {
      if (gone) return
      api = turnstile
      widgetId = turnstile.render(element, {
        sitekey: siteKey,
        theme,
        size: "flexible",
        callback: (token: string) => check.receive(token),
        "expired-callback": () => check.receive(null),
        "timeout-callback": () => check.receive(null),
        "error-callback": () => check.receive(null),
      })
      const id = widgetId
      if (id) forget = check.connect({ reset: () => turnstile.reset(id) })
    }, () => check.receive(null))
    return () => {
      gone = true
      forget?.()
      if (api && widgetId) api.remove(widgetId)
      check.receive(null)
    }
  }, [check, siteKey, theme])

  if (!siteKey) return <p className={authStyles.notice}>{authErrorCopy("HUMAN_CHECK_NOT_SET_UP")}</p>
  return <div ref={container} className={styles.turnstile} data-turnstile="" />
}
