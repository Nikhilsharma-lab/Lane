import { Bookmark, Plus } from "lucide-react"
import { Skeleton } from "@/components/arc/skeleton/skeleton"
import buttonStyles from "@/components/arc/button/button.module.css"
import { NewRequestLink } from "@/components/requests/new-request-link"
import rowStyles from "@/components/requests/request-rows.module.css"
import savedViewStyles from "@/components/requests/saved-view-menu.module.css"
import tableStyles from "@/components/requests/tasks/data-table-toolbar.module.css"
import { PageStrip } from "@/components/shell/page-strip"
import overviewStyles from "./requests-overview.module.css"
import styles from "./app-skeletons.module.css"
import { Placeholder } from "@/components/loading/placeholder";

const ROWS = Array.from({ length: 12 }, (_, index) => index)
// The status pills' widths, in the order the list shows them: All, Open, In progress, Done, Measuring, Closed.
const PILLS = [styles.pillShort, styles.pillShort, styles.pillLong, styles.pillShort, styles.pillLong, styles.pillShort]
// The toolbar's icon buttons: title filter, Add filter, Display and the list summary.
const TOOLS = [0, 1, 2, 3]

// The Request detail route has its own loading.tsx; this skeleton only ever stands in for the list.
// Plan item 2.0 and #275 (A225): the real page's shape, in its own layout classes: the strip with its title, Save view
// and New Request, the toolbar with its status pills and icon buttons, a group header and 44px compact rows, so
// the first row, the pills and Save view land where the loaded ones do. The one live region is the strip's title;
// everything below it is decorative. It imports no list code (requests-overview.tsx explains why).
export function RequestsWorkspaceLoading() {
  return <Placeholder><div data-slot="requests-workspace" data-skeleton="list" aria-busy="true" className={overviewStyles.overview}>
    <PageStrip title={<span className={styles.titleSkeleton}><Skeleton label="Loading Requests" lines={1} /></span>}
      tools={<span aria-hidden="true" inert className={savedViewStyles.control}><span data-skeleton-part="save-view" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm}`}><Bookmark data-icon-size="sm" strokeWidth={1.75} aria-hidden="true" /><span className={savedViewStyles.label}>Save view</span></span></span>}
      action={<NewRequestLink className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.sm} ${overviewStyles.newRequest}`}><Plus aria-hidden="true" />New Request</NewRequestLink>} />
    <div aria-hidden="true" className={tableStyles.tableLayout} data-preview-table="">
      <div className={tableStyles.toolbarStack}>
        <div className={tableStyles.toolbar}>
          <div className={tableStyles.status}><div data-skeleton-part="pills" className={tableStyles.statusRow}>{PILLS.map((width, index) => <span key={index} className={`${styles.pill} ${width}`} />)}</div></div>
          <div className={tableStyles.actions}>{TOOLS.map(tool => <span key={tool} className={`${tableStyles.iconButton} ${styles.tool}`} />)}</div>
        </div>
      </div>
      <div className={tableStyles.listAndSummary}>
        <div className={tableStyles.listPane}>
          <div className={tableStyles.listScroll}>
          <div className={`${rowStyles.records} ${tableStyles.recordRegion}`}>
            {/* Plan item 2.4: the same group, header row and row boxes as the loaded treegrid, without its roles. */}
            <div className={rowStyles.group}>
              <div data-skeleton-part="group-header" className={`${rowStyles.groupRow} ${rowStyles.groupHeader} ${styles.groupHeader}`}><span className={styles.groupLabel}><Skeleton lines={1} /></span></div>
              <div><div className={rowStyles.list}>{ROWS.map(row => <div key={row} data-skeleton-part="row" className={rowStyles.row} data-compact-row="true">
                <div className={rowStyles.rowContent}><span className={styles.rowTitle}><Skeleton lines={1} /></span><span className={styles.rowMeta}><Skeleton lines={1} /></span></div>
              </div>)}</div></div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  </div></Placeholder>
}
