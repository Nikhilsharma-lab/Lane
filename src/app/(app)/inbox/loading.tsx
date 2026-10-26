import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageStrip } from "@/components/shell/page-strip";
import styles from "@/components/inbox/inbox.module.css";

// #204: the Inbox's loading state: the strip, then rows the height of real rows in the list's own padding.
export default function InboxLoading() {
  return <>
    <PageStrip title="Inbox" heading />
    <div className={styles.body} data-skeleton="inbox">
      <div className={styles.list} aria-busy="true">
        <Skeleton label="Loading your Inbox" lines={1} />
        <ul className={styles.items} aria-hidden="true">
          {[0, 1, 2, 3].map(index => <li key={index} className={styles.row}><span className={styles.lead} /><Skeleton lines={2} /></li>)}
        </ul>
      </div>
    </div>
  </>;
}
