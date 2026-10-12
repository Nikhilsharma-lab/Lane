"use client"

import { memo, useSyncExternalStore } from "react"
import { CheckCheck, Link, RefreshCw, X } from "lucide-react"
import { FloatingButtonGroup, type FloatingButtonGroupItem } from "@/components/arc/floating-button-group/floating-button-group"
import { StatusGlyph } from "./row-presentation"
import type { LifecycleMove } from "@/lib/request-lifecycle"
import type { RequestSelectionActions } from "./use-request-selection"
import styles from "./request-selection.module.css"

const PHONE = "(max-width: 640px)"
const subscribePhone = (change: () => void) => {
  const query = window.matchMedia(PHONE)
  query.addEventListener("change", change)
  return () => query.removeEventListener("change", change)
}

type RequestSelectionBarProps = { busy: boolean; count: number; action: LifecycleMove | null; allSelected: boolean; error: string; message: string; actions: RequestSelectionActions }

/** Memoised on what it shows: a J or a pointer focus on a row re-renders the list, not the bar (plan item 2.4). */
export const RequestSelectionBar = memo(function RequestSelectionBar({ busy, count, action, allSelected, error, message, actions: selection }: RequestSelectionBarProps) {
  // A phone-width tray keeps only the lifecycle verb as words; the rest keep their glyphs and tooltips.
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)
  const items: FloatingButtonGroupItem[] = [
    ...(count ? [{ id: "all", label: "Select all on page", icon: <CheckCheck />, iconOnly: true, disabled: busy || allSelected, onSelect: selection.selectPage }] : []),
    ...(action ? [{ id: action, label: action === "pick-up" ? "Pick up" : "Mark Done", icon: <StatusGlyph status={action === "pick-up" ? "in_progress" : "done"} />, disabled: busy, onSelect: () => { void selection.update() } }] : []),
    ...(count ? [{ id: "copy", label: message === "Links copied" ? "Links copied" : "Copy links", reserveLabels: ["Copy links", "Links copied"], icon: <Link />, iconOnly: phone, disabled: busy, onSelect: () => { void selection.copyLinks() } }] : []),
    ...(!count && error ? [{ id: "refresh", label: "Refresh", icon: <RefreshCw />, iconOnly: phone, onSelect: selection.refresh }] : []),
    { id: "clear", label: "Clear selection", icon: <X />, iconOnly: true, shortcut: "Esc", disabled: busy, onSelect: selection.clear },
  ]
  // Plan item 2.4: changes are announced by the list's one region (useRequestSelection), not here.
  return <>
    {(count > 0 || error) && <div className={styles.dock} data-request-selection-bar="">
      {error && <p className={styles.error} role="alert">{error}</p>}
      <FloatingButtonGroup label="Selected Requests" variant="floating" items={items}
        leading={<span className={styles.count}>{count ? `${count} selected` : "Update failed"}</span>} />
    </div>}
  </>
})
