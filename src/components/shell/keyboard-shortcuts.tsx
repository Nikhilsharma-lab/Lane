"use client"

import { Fragment, useEffect, useEffectEvent, useRef, useState } from "react"
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { isShown, isTypingTarget, overlayOpen } from "@/lib/keyboard-guards"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import { useShellOpener } from "./shell-openers"
import styles from "./keyboard-shortcuts.module.css"

/**
 * Plan item 2.4 (decision 8.25): `?` lists every shortcut, from the one map
 * in src/lib/keyboard-shortcuts.ts. Mounted once in the authenticated shell.
 * `?` opens and closes it, Esc closes it, and the Arc Dialog returns focus to
 * where it was (a row, say). Nothing renders until it opens.
 */
export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false)
  // No trigger button opens it, so it hands focus back to where `?` was pressed itself.
  const returnFocus = useRef<HTMLElement | null>(null)
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // "?" arrives as its own key; Shift is how most layouts type it, so Shift is allowed.
    if (event.key !== "?" || event.defaultPrevented || event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
    // Open, the overlay is itself the visible dialog, so `?` closes it. Closed, another dialog, menu or listbox keeps the key.
    if (!open && overlayOpen()) return
    event.preventDefault()
    if (!open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(!open)
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event)
    window.addEventListener("keydown", listener)
    return () => window.removeEventListener("keydown", listener)
  }, [])
  // Issue #102: the palette opens it too, naming where focus goes back to.
  useShellOpener("shortcuts", request => {
    if (open) return
    returnFocus.current = request.returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setOpen(true)
  })

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogContent title="Keyboard shortcuts" description="Shortcuts work when you’re not typing in a field." className={styles.dialog}
      onCloseAutoFocus={event => {
        const target = returnFocus.current
        returnFocus.current = null
        if (!isShown(target)) return
        event.preventDefault()
        target.focus({ preventScroll: true })
      }}>
      <div className={styles.groups}>
        {SHORTCUT_GROUPS.map(group => <section key={group.scope} className={styles.group} aria-labelledby={`shortcuts-${group.scope}`}>
          <h3 id={`shortcuts-${group.scope}`} className={styles.heading}>{group.title}</h3>
          <dl className={styles.list}>
            {group.shortcuts.map(shortcut => <div key={shortcut.label} className={styles.item}>
              <dt className={styles.label}>{shortcut.label}</dt>
              <dd className={styles.keys}><ShortcutKeys keys={shortcut.keys} /></dd>
            </div>)}
          </dl>
        </section>)}
      </div>
    </DialogContent>
  </Dialog>
}

/**
 * The key caps the `?` overlay and the ⌘K palette share (spec #101): every
 * interchangeable alternative, "or" between them, one cap per key of a chord.
 * A recorded deviation (docs/design-system/arc-sources.md): Arc's
 * `ShortcutKbd` replaces these caps once `shortcut-recorder` is installed.
 * The caller supplies the wrapper and its accessible text.
 */
export function ShortcutKeys({ keys }: { keys: readonly string[] }) {
  return keys.map((alternative, index) => <Fragment key={alternative}>
    {index > 0 && <span className={styles.or}>or</span>}
    {alternative.split(" ").map(part => <kbd key={part} className={styles.key}>{part}</kbd>)}
  </Fragment>)
}
