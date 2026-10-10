import { Skeleton } from "@/components/arc/skeleton/skeleton"
import styles from "@/components/requests/request-rows.module.css"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"
// The Request detail route has its own loading.tsx; this skeleton only ever stands in for the list.
export function RequestsWorkspaceLoading() {
  return <div aria-label="Loading Requests" aria-busy="true" className="space-y-6 p-4 md:p-6"><div className="flex items-center gap-3"><SidebarExpandButton /><Skeleton label="Loading Requests" lines={2} className="flex-1" /></div><div className={styles.records}>{[0, 1, 2, 3, 4].map(row => <div key={row} className={styles.row}><div className={styles.title}><Skeleton lines={1} className="w-full" /></div><div className={`${styles.properties} w-48`}><Skeleton lines={1} className="w-full" /></div></div>)}</div></div>
}
