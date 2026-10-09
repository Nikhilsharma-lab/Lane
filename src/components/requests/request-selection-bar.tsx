"use client"

import { CheckCheck, Check, Link, Play, RefreshCw, X } from "lucide-react"
import { FloatingButtonGroup, type FloatingButtonGroupItem } from "@/components/arc/floating-button-group/floating-button-group"
import type { useRequestSelection } from "./use-request-selection"
import styles from "./request-selection.module.css"

export function RequestSelectionBar({ selection }: { selection: ReturnType<typeof useRequestSelection> }) {
  const { selected, busy, count, action, allSelected, error, message } = selection
  const items: FloatingButtonGroupItem[] = [
    ...(count ? [{ id: "all", label: "Select all on this page", icon: <CheckCheck />, disabled: busy || allSelected, onSelect: selection.selectPage }] : []),
    ...(action ? [{ id: action, label: action === "pick-up" ? "Pick up selected Requests" : "Mark selected Requests Done", icon: action === "pick-up" ? <Play /> : <Check />, disabled: busy, onSelect: () => { void selection.update() } }] : []),
    ...(count ? [{ id: "copy", label: message === "Links copied" ? "Links copied" : "Copy links", icon: <Link />, disabled: busy, onSelect: () => { void selection.copyLinks() } }] : []),
    ...(!count && error ? [{ id: "refresh", label: "Refresh Requests", icon: <RefreshCw />, onSelect: selection.refresh }] : []),
    { id: "clear", label: "Clear selection", icon: <X />, shortcut: "Esc", disabled: busy, onSelect: selection.clear },
  ]
  return <>
    <span className="sr-only" role="status">{busy ? `Working on ${count} selected Requests` : message || (selected.length ? `${selected.length} selected` : "")}</span>
    {(count > 0 || error) && <div className={styles.dock} data-request-selection-bar="">
      {error && <p className={styles.error} role="alert">{error}</p>}
      <FloatingButtonGroup label="Selected Requests" variant="floating" iconOnly items={items}
        leading={<span className={styles.count}>{count ? `${count} selected` : "Update failed"}</span>} />
    </div>}
  </>
}
