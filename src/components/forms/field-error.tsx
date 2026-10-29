import styles from "./field-error.module.css"

/**
 * #260 (polish bar §4): the error under one field whose Arc control has no `error` prop of its own (Arc
 * `select`, `radio-group`, a picker button). Arc `input` and `textarea` take `error` themselves and need none
 * of this. It reads like their error line, is announced once, and its `id` goes in the control's
 * `aria-describedby`. Errors that aren't about one field use a toast or the offline line instead.
 */
export function FieldError({ id, children }: { id?: string; children?: string | null | false }) {
  if (!children) return null
  return <p id={id} className={styles.error} role="alert">{children}</p>
}
