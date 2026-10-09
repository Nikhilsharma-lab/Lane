import { Skeleton } from "@/components/arc/skeleton/skeleton"
import { RequestDetailSkeleton } from "@/components/requests/detail-view"
import styles from "@/components/requests/request-rows.module.css"
import { SidebarExpandButton } from "@/components/shell/sidebar-controls"
export function RequestsWorkspaceLoading({ selected = false }: { selected?: boolean }) {
  if (!selected) return <div aria-label="Loading Requests" aria-busy="true" className="space-y-6 p-4 md:p-6"><div className="flex items-center gap-3"><SidebarExpandButton /><Skeleton label="Loading Requests" lines={2} className="flex-1" /></div><div className={styles.records}>{[0, 1, 2, 3, 4].map(row => <div key={row} className={styles.row}><div className={styles.title}><Skeleton lines={1} className="w-full" /></div><div className={`${styles.properties} w-48`}><Skeleton lines={1} className="w-full" /></div></div>)}</div></div>
  return <div className="flex min-h-0 flex-1"><aside className="hidden w-80 shrink-0 space-y-6 border-r p-4 lg:block" aria-label="Loading Request list">{[0, 1, 2].map(row => <Skeleton key={row} lines={4} />)}</aside><RequestDetailSkeleton /></div>
}
