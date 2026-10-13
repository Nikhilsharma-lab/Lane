import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageStrip } from "@/components/shell/page-strip";
import styles from "../app-skeletons.module.css";

// Plan item 2.3: the strip, then the compose step as intake-form.tsx lays it
// out in the same max-w-2xl wrapper: the title line (its one status), three
// lines of description, the four property chips, the 44px Expected impact row
// under its rule, and the sticky footer's action. Everything after the status
// is decorative.
export default function IntakeLoading() {
  return <>
    <PageStrip title="New Request" heading />
    <div data-skeleton="intake" aria-busy="true" className="mx-auto w-full max-w-2xl px-4 pt-6 sm:px-6 sm:pt-8">
      <div className="space-y-5">
        <div className="space-y-2">
          <div className={styles.composeTitle}><Skeleton label="Loading New Request" lines={1} /></div>
          <div aria-hidden="true" className={styles.composeDescription}><span /><span /><span /></div>
        </div>
        <div aria-hidden="true" className="flex flex-wrap items-center gap-2">{[0, 1, 2, 3].map(chip => <span key={chip} className={styles.chip} />)}</div>
        <div aria-hidden="true" className={styles.impactRow}><span /><span className={styles.impactToggle} /></div>
      </div>
      <div aria-hidden="true" className={styles.composeFooter}><span className={styles.button} /></div>
    </div>
  </>;
}
