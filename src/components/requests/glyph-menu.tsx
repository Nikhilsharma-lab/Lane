"use client"

import { cloneElement, useState, type FocusEvent, type ReactElement } from "react"
import { ContextMenu, type ContextMenuItem } from "@/components/arc/context-menu/context-menu"
import { Tooltip } from "@/components/arc/tooltip/tooltip"
import styles from "./glyph-menu.module.css"

// Plan item 2.5: moved from request-row.tsx so the list row and Request
// detail's property panel open their Status and Priority menus the same way.
/** A glyph button that explains itself on hover and opens its menu on click.
 * Arc's ContextMenu clones one element and the Radix tooltip slots into one
 * element, so a layout-free span carries the menu handlers while the button
 * keeps focus, the tooltip and the menu's return focus. */
export function GlyphMenu({ label, items, tip, onOpenChange, children }: { label: string; items: ContextMenuItem[]; tip: string; onOpenChange?: (open: boolean) => void; children: ReactElement<{ "aria-expanded"?: boolean; onFocus?: (event: FocusEvent<HTMLButtonElement>) => void }> }) {
  // The span receives the menu's expanded state; the button is what assistive tech reads, so it repeats it.
  const [open, setOpen] = useState(false)
  return <ContextMenu label={label} items={items} asChild onOpenChange={next => { setOpen(next); onOpenChange?.(next) }}>
    <span className={styles.slot}><Tooltip morph="plain" content={tip}>{cloneElement(children, {
      "aria-expanded": open,
      // The menu hands focus back to the button when it closes. Radix opens the tooltip on
      // any focus unless the handler before it prevents default, so only keyboard focus does.
      onFocus: event => { children.props.onFocus?.(event); if (!event.currentTarget.matches(":focus-visible")) event.preventDefault() },
    })}</Tooltip></span>
  </ContextMenu>
}
