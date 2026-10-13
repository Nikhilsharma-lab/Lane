import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageStrip } from "@/components/shell/page-strip";
import styles from "../app-skeletons.module.css";

// Plan item 2.0: the page's strip and the form's own padding (intake-form.tsx),
// then the header, title, description, property chips, Expected impact and the
// footer action. The header line is the one live region; the rest is decorative.
export default function IntakeLoading() {
  return <>
    <PageStrip title="New Request" />
    <div data-skeleton="intake" aria-busy="true" className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="space-y-6">
        <Skeleton label="Loading Intake" lines={2} />
        <div aria-hidden="true" className="space-y-5">
          <div className="space-y-2"><Skeleton lines={1} /><span className={styles.field} /></div>
          <div className="space-y-2"><Skeleton lines={1} /><span className={styles.area} /></div>
          <div className="flex flex-wrap items-center gap-2">{[0, 1, 2, 3].map(chip => <span key={chip} className={styles.chip} />)}</div>
          <div className={styles.rule}><Skeleton lines={4} /></div>
          <div className={styles.footer}><span className={styles.button} /></div>
        </div>
      </div>
    </div>
  </>;
}
