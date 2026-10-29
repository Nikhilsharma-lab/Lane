import styles from "./auth.module.css";
import { Placeholder } from "@/components/loading/placeholder";

/**
 * Plan item 2.11: Clerk's card as `clerkEmbeddedAppearance` lays it out (centred
 * header, an optional social button and "or" divider, labelled fields, the
 * primary button, the footer action). It is Clerk's `fallback` and the content of
 * the auth loading states, so the card arrives in a block of its own shape. The
 * wait is announced once and the bars are decorative. Plain markup with no client
 * code: /login loads it twice (its loading state and Clerk's fallback), and the
 * Arc Skeleton would bring its motion code along both times.
 */
export function AuthCardSkeleton({ label, fields = 1, social = true }: { label: string; fields?: number; social?: boolean }) {
  return <Placeholder><div role="status" aria-label={label} aria-busy="true" data-skeleton="auth-card" className={styles.cardSkeleton}>
    <div aria-hidden="true" className={styles.heading}>
      <span className={styles.skeletonTitle}><span className={styles.skeletonTitleBar} /></span>
      <span className={styles.skeletonText}><span className={styles.skeletonBar} /></span>
    </div>
    <div aria-hidden="true" className={styles.skeletonBody}>
      {social && <>
        <span className={styles.skeletonControl} />
        <span className={styles.skeletonText}><span className={styles.skeletonDivider} /></span>
      </>}
      <span className={styles.skeletonForm}>
        {fields > 0 && <span className={styles.skeletonFields}>
          {Array.from({ length: fields }, (_, index) => <span key={index} className={styles.skeletonField}>
            <span className={styles.skeletonText}><span className={styles.skeletonLabel} /></span>
            <span className={styles.skeletonControl} />
          </span>)}
        </span>}
        <span className={styles.skeletonButton} />
      </span>
    </div>
    <span aria-hidden="true" className={styles.skeletonText}><span className={styles.skeletonBar} /></span>
  </div></Placeholder>;
}
