import type { ReactNode } from "react";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageStrip } from "@/components/shell/page-strip";
import styles from "./profile.module.css";

// Layout follows Arc's documented settings composition.
export function ProfileLayout({ children }: { children: ReactNode }) {
  return <><PageStrip title="Profile" /><div className={styles.page}><h1 className={styles.title}>Settings</h1>{children}</div></>;
}

export function ProfileSections({ profileForm, appearance }: { profileForm: ReactNode; appearance: ReactNode }) {
  return <div className={styles.stack}>
    <section className={styles.section} aria-labelledby="profile-section-heading">
      <div><h2 id="profile-section-heading" className={styles.heading}>Profile</h2><p className={styles.description}>Update your PM, Designer, or Developer label.</p></div>
      <div className={styles.field}>{profileForm}</div>
    </section>
    <section className={styles.section} aria-labelledby="appearance-section-heading">
      <div><h2 id="appearance-section-heading" className={styles.heading}>Appearance</h2><p className={styles.description}>Choose how Lane looks on this browser.</p></div>
      <div className={styles.field}>{appearance}</div>
    </section>
  </div>;
}

/** The real two-section grid with its static headings; only the controls wait (plan item 2.0). */
export function ProfileSkeleton() {
  return <div data-skeleton="profile" aria-busy="true">
    <ProfileSections profileForm={<Skeleton label="Loading Profile settings" lines={2} />} appearance={<div aria-hidden="true"><Skeleton lines={2} /></div>} />
  </div>;
}
