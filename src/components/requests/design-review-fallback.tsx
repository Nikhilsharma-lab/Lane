import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { ASK_FOR_REVIEW_HINT } from "./design-review-copy"
import styles from "./detail.module.css"

/**
 * Plan item 2.5: Ask for review's place while its chunk loads, built like the
 * closed panel: a 44px header row (the skeleton), then the hint line. The
 * hint is laid out but never shown or read, so it wraps where the panel's
 * does at every width and the conversation does not move when the panel
 * arrives. Its own module, so stories render it without the panel's actions.
 */
export function DesignReviewFallback() {
  return <section aria-busy="true" className={styles.reviewFallback}>
    <div className={styles.reviewFallbackHeader}><Skeleton label="Loading Ask for review" lines={2} /></div>
    <p aria-hidden="true" className={styles.reviewFallbackHint}>{ASK_FOR_REVIEW_HINT}</p>
  </section>
}
