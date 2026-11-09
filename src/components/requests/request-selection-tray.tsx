"use client"

import { CheckCheck, Link, RefreshCw, X } from "lucide-react"
import { FloatingButtonGroup, type FloatingButtonGroupItem } from "@/components/arc/floating-button-group/floating-button-group"
import { useMediaQuery } from "@/lib/use-media-query"
import { StatusGlyph } from "./row-presentation"
import type { RequestSelectionBarProps } from "./request-selection-bar"
import styles from "./request-selection.module.css"

/** The selection's tray (request-selection-bar.tsx loads it after the page): the count, the moves, Copy links and Clear selection. */
export function RequestSelectionTray({ busy, count, action, allSelected, error, message, actions: selection }: RequestSelectionBarProps) {
  // A phone-width tray keeps only the lifecycle verb as words; the rest keep their glyphs and tooltips.
  const phone = useMediaQuery("(max-width: 640px)")
  const items: FloatingButtonGroupItem[] = [
    ...(count ? [{ id: "all", label: "Select all on page", icon: <CheckCheck />, iconOnly: true, disabled: busy || allSelected, onSelect: selection.selectPage }] : []),
    ...(action ? [{ id: action, label: action === "pick-up" ? "Pick up" : "Mark Done", icon: <StatusGlyph status={action === "pick-up" ? "in_progress" : "done"} />, disabled: busy, onSelect: () => { void selection.update() } }] : []),
    ...(count ? [{ id: "copy", label: message === "Links copied" ? "Links copied" : "Copy links", reserveLabels: ["Copy links", "Links copied"], icon: <Link />, iconOnly: phone, disabled: busy, onSelect: () => { void selection.copyLinks() } }] : []),
    ...(!count && error ? [{ id: "refresh", label: "Refresh", icon: <RefreshCw />, iconOnly: phone, onSelect: selection.refresh }] : []),
    { id: "clear", label: "Clear selection", icon: <X />, iconOnly: true, shortcut: "Esc", disabled: busy, onSelect: selection.clear },
  ]
  return <FloatingButtonGroup label="Selected Requests" variant="floating" items={items}
    leading={<span className={styles.count}>{count ? `${count} selected` : "Update failed"}</span>} />
}
