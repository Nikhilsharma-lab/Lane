import { Check } from "lucide-react"
import type { PaletteEntry, PriorityEntry } from "./command-palette-entries"
import { ShortcutKeys } from "./keyboard-shortcuts"
import styles from "./command-palette.module.css"

type Props = {
  entry: PaletteEntry | PriorityEntry
  id: string
  index: number
  selected: boolean
  onActive: (index: number) => void
  onChoose: (entry: PaletteEntry) => void
}

/** Issue #106: one option of the palette's listbox. Its key hint is the entry's full hint, every alternative, as the ? overlay shows it. */
export function PaletteOption({ entry, id, index, selected, onActive, onChoose }: Props) {
  const isCurrent = "current" in entry && entry.current
  return <div id={id} role="option" aria-selected={selected} data-index={index} className={styles.option} aria-keyshortcuts={entry.keys.join(" ") || undefined}
    onPointerMove={() => { if (!selected) onActive(index) }} onPointerDown={event => event.preventDefault()} onClick={() => onChoose(entry)}>
    <span className={styles.label}>{entry.label}{entry.detail ? <span className={styles.detail}>{entry.detail}</span> : null}{isCurrent ? <span className={styles.srOnly}>, current</span> : null}</span>
    {isCurrent ? <Check data-icon-size="sm" aria-hidden="true" className={styles.check} /> : null}
    {entry.keys.length ? <span className={styles.keys} aria-hidden="true"><ShortcutKeys keys={entry.keys} /></span> : null}
  </div>
}
