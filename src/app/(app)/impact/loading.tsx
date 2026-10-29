import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { PageStrip } from "@/components/shell/page-strip";
import styles from "@/components/impact/impact-screen.module.css";
import { Placeholder } from "@/components/loading/placeholder";

// The Dashboard's loading state: the strip, then a skeleton in the screen's own padding.
export default function ImpactLoading() {
  return <>
    <PageStrip title="Impact" heading />
    <Placeholder><div data-skeleton="impact" className={styles.loading}>
      <Skeleton label="Loading impact" lines={6} />
    </div></Placeholder>
  </>;
}
