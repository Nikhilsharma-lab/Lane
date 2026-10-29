import type { Ref } from "react"
import { ITERATIONS_SECTION_ID } from "@/lib/same-problem-rules"
import styles from "./same-problem.module.css"

export const ITERATIONS_HEADING_ID = "iterations-heading"
/** The empty state's words: no group yet, and (for those who can) how to start one. */
export const NO_LINKS_YET = "No other Request is linked as Same problem yet."
export const LINK_HINT = " Link Requests that tackle the same problem to see each attempt and its result together."

/**
 * "Iterations of this problem" while its read is on the way (#295): the height of the empty state most Requests have,
 * with room for Link a Request, so the page does not move when it arrives. Kept apart from the list so the Request
 * page's first load carries it without the list's code. A Viewer sees the section only when the Request is linked,
 * so nothing is held for them.
 */
export function IterationsPlaceholder({ canLink, headingRef }: { canLink: boolean; headingRef?: Ref<HTMLHeadingElement> }) {
  if (!canLink) return null
  return <section id={ITERATIONS_SECTION_ID} aria-labelledby={ITERATIONS_HEADING_ID} className={styles.section}>
    <div className={`${styles.header} ${styles.holdsButton}`} data-holds-button="">
      <h2 id={ITERATIONS_HEADING_ID} ref={headingRef} tabIndex={-1} className={styles.heading}>Iterations of this problem</h2>
    </div>
    <div className={styles.holding}>
      <p role="status" className={styles.muted}>Loading Iterations…</p>
      <p aria-hidden="true" className={`${styles.muted} ${styles.unseen}`}>{NO_LINKS_YET}{LINK_HINT}</p>
    </div>
  </section>
}
