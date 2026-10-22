import { Fragment } from "react"
import styles from "./shortcut-keys.module.css"

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
