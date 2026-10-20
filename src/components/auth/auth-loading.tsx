import { Skeleton } from "@/components/arc/skeleton/skeleton";
import styles from "./auth.module.css";

export function AuthLoading({ label, roles = false }: { label: string; roles?: boolean }) {
  return <div className={styles.form}><Skeleton label={label} lines={roles ? 6 : 4} /></div>;
}

/**
 * Plan item 2.11: Clerk's card as `clerkEmbeddedAppearance` lays it out (centred
 * header, an optional social button and "or" divider, labelled fields, the
 * primary button, the footer action), drawn while Clerk mounts and by the auth
 * loading states so the card arrives in a block of its own shape. The title line
 * is the Arc Skeleton and carries the one status; everything else is decorative.
 */
export function AuthCardSkeleton({ label, fields = 1, social = true }: { label: string; fields?: number; social?: boolean }) {
  return <div className={styles.cardSkeleton} data-skeleton="auth-card" aria-busy="true">
    <div className={styles.heading}>
      <div className={styles.skeletonTitle}><Skeleton label={label} lines={1} /></div>
      <span aria-hidden="true" className={styles.skeletonText}><span className={styles.skeletonBar} /></span>
    </div>
    <div aria-hidden="true" className={styles.skeletonBody}>
      {social && <>
        <span className={styles.skeletonControl} />
        <span className={styles.skeletonText}><span className={styles.skeletonDivider} /></span>
      </>}
      {Array.from({ length: fields }, (_, index) => <span key={index} className={styles.skeletonField}>
        <span className={styles.skeletonText}><span className={styles.skeletonLabel} /></span>
        <span className={styles.skeletonControl} />
      </span>)}
      <span className={styles.skeletonButton} />
    </div>
    <span aria-hidden="true" className={styles.skeletonText}><span className={styles.skeletonBar} /></span>
  </div>;
}
