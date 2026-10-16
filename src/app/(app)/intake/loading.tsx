import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageStrip } from "@/components/shell/page-strip";
import launcher from "@/components/requests/intake-launcher.module.css";
import styles from "../app-skeletons.module.css";

// Plan item 2.3: /intake is a launcher under the strip, and the composer opens
// over it as a centred dialog (2026-10-13). The skeleton draws the launcher as
// intake-launcher.tsx lays it out, centred in the pane: the glyph, the title
// line (its one status), one line of description and the Create Request pill.
// Everything after the status is decorative.
export default function IntakeLoading() {
  return <>
    <PageStrip title="New Request" heading />
    <div data-skeleton="intake" aria-busy="true" className={launcher.launcher}>
      <div className={styles.launcherState}>
        <span aria-hidden="true" className={styles.launcherGlyph}><span /></span>
        <div className={styles.launcherTitle}><Skeleton label="Loading New Request" lines={1} /></div>
        <span aria-hidden="true" className={styles.launcherDescription}><span className={styles.launcherLine} /></span>
        <span aria-hidden="true" className={styles.launcherButton} />
      </div>
    </div>
  </>;
}
