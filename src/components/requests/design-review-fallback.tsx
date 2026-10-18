import { Skeleton } from "@/components/arc/skeleton/skeleton"
import styles from "./detail.module.css"

/** Holds the compact empty review row's height while its chunk loads. */
export function DesignReviewFallback() {
  return <section aria-busy="true" className={styles.reviewFallback}>
    <div className={styles.reviewFallbackHeader}><Skeleton label="Loading Ask for review" lines={2} /></div>
  </section>
}
