import { Plus } from "lucide-react"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import buttonStyles from "@/components/arc/button/button.module.css"
import { NewRequestLink } from "@/components/requests/new-request-link"
import rowStyles from "@/components/requests/request-rows.module.css"
import tableStyles from "@/components/requests/tasks/data-table-toolbar.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import overviewStyles from "./requests-overview.module.css"
import styles from "./app-skeletons.module.css"

const ROWS = Array.from({ length: 12 }, (_, index) => index)

// The Request detail route has its own loading.tsx; this skeleton only ever stands in for the list.
// Plan item 2.0: the same strip, toolbar row, group header and 44px compact rows
// as the loaded list, so the first row lands where the loaded one does. The one
// live region is the strip's title; every bar below it is decorative.
export function RequestsWorkspaceLoading() {
  return <div data-slot="requests-workspace" data-skeleton="list" aria-busy="true" className={overviewStyles.overview}>
    <PageStrip title={<span className={styles.titleSkeleton}><Skeleton label="Loading Requests" lines={1} /></span>}
      action={<NewRequestLink className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm} ${overviewStyles.newRequest}`}><Plus aria-hidden="true" />New Request</NewRequestLink>} />
    <div aria-hidden="true" className={tableStyles.tableLayout} data-preview-table="">
      <div className={tableStyles.toolbarStack}>
        <div className={tableStyles.toolbar}><span className={styles.toolbarStatus}><Skeleton lines={1} /></span></div>
      </div>
      <div className={tableStyles.listAndSummary}>
        <div className={tableStyles.listPane}>
          <div className={`${rowStyles.records} ${tableStyles.recordRegion}`}>
            {/* Plan item 2.4: the same group, header row and row boxes as the loaded treegrid, without its roles. */}
            <div className={rowStyles.group}>
              <div className={`${rowStyles.groupRow} ${rowStyles.groupHeader} ${styles.groupHeader}`}><span className={styles.groupLabel}><Skeleton lines={1} /></span></div>
              <div><div className={rowStyles.list}>{ROWS.map(row => <div key={row} className={rowStyles.row} data-compact-row="true">
                <div className={rowStyles.rowContent}><span className={styles.rowTitle}><Skeleton lines={1} /></span><span className={styles.rowMeta}><Skeleton lines={1} /></span></div>
              </div>)}</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
}
