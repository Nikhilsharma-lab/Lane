"use client"

import { memo, useEffect, useState } from "react"
import { afterPageLoad } from "@/lib/after-page-load"
import type { LifecycleMove } from "@/lib/request-lifecycle"
import type { RequestSelectionActions } from "./use-request-selection"
import styles from "./request-selection.module.css"

export type RequestSelectionBarProps = { busy: boolean; count: number; action: LifecycleMove | null; allSelected: boolean; error: string; message: string; actions: RequestSelectionActions }

let tray: typeof import("./request-selection-tray") | null = null
const loadTray = () => import("./request-selection-tray").then(module => tray = module)

/**
 * Memoised on what it shows: a J or a pointer focus on a row re-renders the list, not the bar (plan item 2.4).
 * The tray's buttons (Arc FloatingButtonGroup) load once the page has loaded and is idle, as the list's motion does
 * (list-feel.ts), or at the first selection if that comes sooner; a failed change says so here from the first frame.
 * Changes are announced by the list's one region (useRequestSelection), not here.
 */
export const RequestSelectionBar = memo(function RequestSelectionBar(props: RequestSelectionBarProps) {
  const [code, setCode] = useState(tray)
  const shown = props.count > 0 || Boolean(props.error)
  useEffect(() => code ? undefined : afterPageLoad(() => { void loadTray().then(setCode, () => undefined) }), [code])
  useEffect(() => { if (shown && !code) void loadTray().then(setCode, () => undefined) }, [shown, code])
  return shown ? <div className={styles.dock} data-request-selection-bar="">
    {props.error && <p className={styles.error} role="alert">{props.error}</p>}
    {code && <code.RequestSelectionTray {...props} />}
  </div> : null
})
