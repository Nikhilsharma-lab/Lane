"use client"

import { Fragment, type RefObject } from "react"
import { Dialog, DialogContent } from "@/components/popup/adaptive-dialog"
import { isShown } from "@/lib/keyboard-guards"
import { SHORTCUT_GROUPS } from "@/lib/keyboard-shortcuts"
import styles from "./keyboard-shortcuts.module.css"
import { KeyCap } from "@/components/keyboard/key-caps";

/** The `?` overlay itself (keyboard-shortcuts.tsx opens it): every shortcut, from the one map in src/lib/keyboard-shortcuts.ts. */
export function KeyboardShortcutsDialog({ open, onOpenChange, returnFocusRef }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent title="Keyboard shortcuts" description="Shortcuts work when you’re not typing in a field." className={styles.dialog}
      onCloseAutoFocus={event => {
        const target = returnFocusRef.current
        returnFocusRef.current = null
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
 * Each cap is Arc's `ShortcutKbd`, through Lane's KeyCap (#262).
 * The caller supplies the wrapper and its accessible text.
 */
export function ShortcutKeys({ keys }: { keys: readonly string[] }) {
  return keys.map((alternative, index) => <Fragment key={alternative}>
    {index > 0 && <span className={styles.or}>or</span>}
    {alternative.split(" ").map(part => <KeyCap key={part}>{part}</KeyCap>)}
  </Fragment>)
}
